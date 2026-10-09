"use client";

import { authFetch, getClientToken, triggerAuthExpired } from "@/lib/authFetch";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { useAuthStore } from "@/store/useAuthStore";
import { CallRecord } from "@/lib/calls";
import IncomingCall from "./IncomingCall";
import OutgoingCall from "./OutgoingCall";
import ActiveCall from "./ActiveCall";
import { LiveKitCredentials } from "./LiveKitVoiceCall";
import { ringtonePlayer } from "@/lib/ringtone";
import { callAudioManager } from "@/lib/callAudioManager";
import { registerAndSubscribeUser } from "@/lib/registerSW";
import { App } from "@capacitor/app";
import { nativeCallBridge } from "@/lib/nativeCallBridge";

interface CallContextType {
  activeCall: CallRecord | null;
  livekitCredentials: LiveKitCredentials | null;
  callState: "IDLE" | "CREATING" | "OUTGOING" | "INCOMING" | "ACCEPTING" | "ACTIVE";
  startCall: (bookingId: string) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  endCall: () => Promise<void>;
  isCalling: boolean;
  socket: Socket | null;
}

const CallContext = createContext<CallContextType>({
  activeCall: null,
  livekitCredentials: null,
  callState: "IDLE",
  startCall: async () => {},
  acceptCall: async () => {},
  rejectCall: async () => {},
  endCall: async () => {},
  isCalling: false,
  socket: null
});

export const useCallContext = () => useContext(CallContext);

// ─── Authoritative signaling URL resolution ─────────────────────────────────
function resolveSignalingUrl(): string | null {
  const envUrl = process.env.NEXT_PUBLIC_SIGNALING_URL?.trim();

  // If environment variable is explicitly set to a non-localhost remote URL, honor it (excluding Vercel serverless URLs)
  if (envUrl && !envUrl.includes("localhost") && !envUrl.includes("127.0.0.1") && !envUrl.includes("vercel.app")) {
    return envUrl;
  }

  if (typeof window !== "undefined") {
    const browserHost = window.location.hostname;
    const protocol = window.location.protocol;
    const isLocalBrowser = browserHost === "localhost" || browserHost === "127.0.0.1";

    if (browserHost.includes("devtunnels.ms")) {
      const derivedSignalingHost = browserHost.replace(/-3000(?=\.|\b)/, "-4001");
      return `${protocol}//${derivedSignalingHost}`;
    }

    // Production domains, Vercel deployments, or standalone Android APK
    if (
      browserHost.includes("vercel.app") ||
      browserHost.includes("belcconect") ||
      browserHost.includes("cityconnect") ||
      (!isLocalBrowser &&
        !browserHost.endsWith(".local") &&
        !browserHost.startsWith("192.168.") &&
        !browserHost.startsWith("10."))
    ) {
      return "https://belcconect-backend.onrender.com";
    }

    if (isLocalBrowser) {
      return `http://${browserHost}:4001`;
    }

    return `${protocol}//${browserHost}:4001`;
  }

  if (envUrl && envUrl.length > 0) return envUrl;
  return "https://belcconect-backend.onrender.com";
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { currentUser } = useAuthStore();

  const currentUserId = useMemo(() => {
    const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
    const isProviderPortal = pathname?.startsWith("/provider") || pathname?.startsWith("/jobprovider");
    if (currentUser?.id) return currentUser.id;
    return isDemo ? (isProviderPortal ? "provider-1" : "customer-1") : "";
  }, [pathname, currentUser]);

  const userTokenRef = useRef<string | undefined>(currentUser?.token);
  useEffect(() => {
    userTokenRef.current = currentUser?.token;
  }, [currentUser?.token]);

  const currentUserIdRef = useRef(currentUserId);
  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  const getHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = userTokenRef.current || getClientToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const uid = currentUserIdRef.current;
    if (uid) headers["x-user-id"] = uid;
    return headers;
  }, []);

  const [activeCall, setActiveCall] = useState<CallRecord | null>(null);
  const [livekitCredentials, setLivekitCredentials] = useState<LiveKitCredentials | null>(null);
  const [callState, setCallState] = useState<"IDLE" | "CREATING" | "OUTGOING" | "INCOMING" | "ACCEPTING" | "ACTIVE">("IDLE");

  const callStateRef = useRef(callState);
  useEffect(() => { callStateRef.current = callState; }, [callState]);
  useEffect(() => { 
    callStateRef.current = callState; 
    callAudioManager.setCallState(callState);
  }, [callState]);

  const socketRef = useRef<Socket | null>(null);
  const socketConnectedRef = useRef(false);
  const connectPromiseRef = useRef<Promise<void> | null>(null);
  const connectResolversRef = useRef<
    Array<{ resolve: () => void; reject: (e?: any) => void; timer: ReturnType<typeof setTimeout> }>
  >([]);

  const livekitCredentialsRef = useRef(livekitCredentials);
  useEffect(() => { livekitCredentialsRef.current = livekitCredentials; }, [livekitCredentials]);

  const activeCallRef = useRef(activeCall);
  useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);

  const callStartInProgressRef = useRef(false);
  const acceptInProgressRef = useRef(false);
  const endInProgressRef = useRef(false);
  const fetchingTokenForRef = useRef<string | null>(null);
  const activeCallMissingCountRef = useRef(0);
  const outgoingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const incomingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearOutgoingTimeout = useCallback(() => {
    if (outgoingTimeoutRef.current) {
      clearTimeout(outgoingTimeoutRef.current);
      outgoingTimeoutRef.current = null;
    }
  }, []);

  const clearIncomingTimeout = useCallback(() => {
    if (incomingTimeoutRef.current) {
      clearTimeout(incomingTimeoutRef.current);
      incomingTimeoutRef.current = null;
    }
  }, []);

  const matchesMe = useCallback((id: string) => {
    const uid = currentUserIdRef.current;
    if (!id || !uid) return false;
    if (id === uid) return true;
    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
      if ((uid.includes("prov") || uid === "provider-1") && (id.includes("prov") || id === "provider-1")) return true;
      if ((uid.includes("cust") || uid === "customer-1") && (id.includes("cust") || id === "customer-1")) return true;
    }
    return false;
  }, []);

  const nativeAcceptRetryCountRef = useRef<{ [callId: string]: number }>({});
  const handleNativeCallActionRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const handleAcceptTransientFailure = useCallback(async (callId: string, errorMsg: string) => {
    const currentRetries = (nativeAcceptRetryCountRef.current[callId] || 0) + 1;
    nativeAcceptRetryCountRef.current[callId] = currentRetries;
    const MAX_RETRIES = 3;

    if (currentRetries <= MAX_RETRIES) {
      console.warn(`[CALL] Accept failed (${errorMsg}). Transient failure, retrying attempt ${currentRetries}/${MAX_RETRIES} in 1500ms...`);
      setTimeout(() => {
        handleNativeCallActionRef.current();
      }, 1500);
    } else {
      console.error(`[CALL] Accept failed after ${MAX_RETRIES} attempts (${errorMsg}). Conclusive timeout. Clearing pending action.`);
      delete nativeAcceptRetryCountRef.current[callId];
      await nativeCallBridge.clearPendingCallAction();
      await nativeCallBridge.dismissNativeCall(callId);
      await nativeCallBridge.stopActiveCallService();
      callAudioManager.stopAll();
      setCallState("IDLE");
      setActiveCall(null);
      setLivekitCredentials(null);
    }
  }, []);

  const [callEndedNotice, setCallEndedNotice] = useState<string | null>(null);
  const callEndedNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processedTerminalCallIdsRef = useRef<Set<string>>(new Set());

  const showCallEndedNotice = useCallback((message: string) => {
    if (callEndedNoticeTimerRef.current) {
      clearTimeout(callEndedNoticeTimerRef.current);
    }
    setCallEndedNotice(message);
    callEndedNoticeTimerRef.current = setTimeout(() => {
      setCallEndedNotice(null);
      callEndedNoticeTimerRef.current = null;
    }, 3000);
  }, []);

  const handleRemoteCallEnded = useCallback((data: {
    callId?: string;
    call?: any;
    reason?: string;
    endedByUserId?: string;
    endedByRole?: string;
    endedByName?: string;
    endedAt?: string;
  }) => {
    const rawCallId = data.callId || data.call?.id;
    const currentActiveCall = activeCallRef.current;
    const currentActiveCallId = currentActiveCall?.id;
    const targetCallId = rawCallId ? String(rawCallId).trim() : (currentActiveCallId ? String(currentActiveCallId).trim() : undefined);
    if (!targetCallId) return;

    const normalizedActiveCallId = currentActiveCallId ? String(currentActiveCallId).trim() : null;
    const matchesActiveCall = !normalizedActiveCallId ||
      targetCallId === normalizedActiveCallId ||
      targetCallId.startsWith("temp-") ||
      normalizedActiveCallId.startsWith("temp-");

    console.log(`[CALL-END] event received callId=${targetCallId} reason=${data.reason || "ended"}`);
    console.log(`[CALL-END] matches active call=${matchesActiveCall} (currentActiveCallId=${normalizedActiveCallId})`);

    // If an active call is present locally and does not match this event's callId, skip teardown
    if (normalizedActiveCallId && !matchesActiveCall) {
      console.log(`[CALL-END] Skipping terminal event because targetCallId=${targetCallId} != activeCallId=${normalizedActiveCallId}`);
      return;
    }

    if (processedTerminalCallIdsRef.current.has(targetCallId)) {
      console.log(`[CALL] Terminal call ${targetCallId} already handled. Skipping duplicate.`);
      return;
    }
    processedTerminalCallIdsRef.current.add(targetCallId);

    // Capture caller identity BEFORE clearing active call or call state
    const uid = currentUserIdRef.current;
    const wasCaller = !!(uid && (data.call?.callerId === uid || currentActiveCall?.callerId === uid || callStateRef.current === "OUTGOING"));

    console.log(`[CALL] Remote call terminated: callId=${targetCallId} reason=${data.reason || "ended"} wasCaller=${wasCaller}`);
    console.log(`[CALL-END] processing terminal event for callId=${targetCallId} reason=${data.reason || "ended"}`);

    // 1. Immediately silence ringtone and ringback
    clearOutgoingTimeout();
    clearIncomingTimeout();
    callAudioManager.stopAll();
    ringtonePlayer.stopRingtone();

    // 2. Play synthesized telecom disconnect sound (0.8s dual-tone Web Audio API)
    callAudioManager.playCallEndedSound();

    // 3. Clear native Android notifications and foreground service for this call
    nativeCallBridge.dismissNativeCall(targetCallId).catch(() => {});
    nativeCallBridge.stopActiveCallService().catch(() => {});

    // 4. Teardown active call UI & LiveKit state locally WITHOUT firing any API endpoint
    setCallState("IDLE");
    setActiveCall(null);
    setLivekitCredentials(null);

    callStartInProgressRef.current = false;
    acceptInProgressRef.current = false;
    endInProgressRef.current = false;
    fetchingTokenForRef.current = null;

    // 5. Display user-facing status notice for 2.5–3 seconds
    const reason = data.reason || data.call?.endReason || (data.call?.status === "MISSED" ? "timeout" : "ended");
    const endedByName = data.endedByName || (data.endedByRole === "provider" ? "Service Provider" : "Customer");

    let message = "Call ended";
    if (reason === "declined") {
      message = `Call declined by ${endedByName}`;
    } else if (reason === "cancelled") {
      message = "Call cancelled";
    } else if (reason === "missed" || reason === "timeout") {
      message = wasCaller ? "Call not answered" : "Missed call";
      if (!wasCaller && targetCallId && nativeCallBridge.isNative()) {
        nativeCallBridge.showMissedCallNotification({
          callId: targetCallId,
          callerName: data.call?.callerName || "Customer",
          serviceName: data.call?.serviceName || "Voice Call",
          bookingId: data.call?.bookingId || ""
        }).catch(() => {});
      }
    } else if (reason === "connection_failed") {
      message = "Call connection failed";
    } else {
      message = `Call ended by ${endedByName}`;
    }

    showCallEndedNotice(message);
  }, [clearOutgoingTimeout, clearIncomingTimeout, showCallEndedNotice]);

  // ─── LiveKit token fetch (fallback only) ──────────────────────────────────
  // ─── LiveKit token fetch (Recovery & manual retry) ──────────────────────────
  const fetchMyLiveKitToken = useCallback((bookingId: string) => {
    if (!currentUserIdRef.current || !bookingId) return;
    const currentCreds = livekitCredentialsRef.current;
    if (currentCreds && currentCreds.roomName && fetchingTokenForRef.current === bookingId) return;
    fetchingTokenForRef.current = bookingId;

    fetch("/api/livekit/token", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ bookingId })
    })
      .then(r => r.json())
      .then(d => {
        if (d.participantToken && d.serverUrl && d.roomName) {
          // Latch credentials: only set if credentials not present or roomName changed
          if (!livekitCredentialsRef.current || livekitCredentialsRef.current.roomName !== d.roomName) {
            setLivekitCredentials({ serverUrl: d.serverUrl, participantToken: d.participantToken, roomName: d.roomName });
          }
        } else {
          fetchingTokenForRef.current = null;
        }
      })
      .catch(err => {
        console.error("[LIVEKIT_ERROR] Failed to fetch token:", err);
        fetchingTokenForRef.current = null;
      });
  }, [getHeaders]);

  // ─── Signal payload handler ───────────────────────────────────────────────
  const handleSignalPayloadRef = useRef<(data: any) => void>(() => {});

  useEffect(() => {
    handleSignalPayloadRef.current = (data: any) => {
      if (!data || !data.call) return;
      const { type, call, livekit } = data;
      const uid = currentUserIdRef.current;

      const matchesMe = (id: string) => {
        if (!id || !uid) return false;
        if (id === uid) return true;
        if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
          if ((uid.includes("prov") || uid === "provider-1") && (id.includes("prov") || id === "provider-1")) return true;
          if ((uid.includes("cust") || uid === "customer-1") && (id.includes("cust") || id === "customer-1")) return true;
        }
        return false;
      };

      if (type === "call:ring" || type === "call:initiate") {
        const isReceiver = matchesMe(call.receiverId);
        if (isReceiver) {
          console.log(`[CALL_TRACE] callId=${call.id} stage=receiver_invite_received`);
          // Connected Call Protection: Never interrupt active or accepting call
          if (callStateRef.current === "ACTIVE" || callStateRef.current === "ACCEPTING") {
            return;
          }

          // If the app is in the background or hidden, trigger native heads-up call banner with CallStyle
          const isHidden = typeof document !== "undefined" && document.hidden;
          if (isHidden) {
            nativeCallBridge.showIncomingCallNotification({
              callId: call.id,
              callerName: call.callerName || "BelConnect User",
              serviceName: call.serviceName || "Voice Call",
              bookingId: call.bookingId
            });
          } else {
            // Mark call presented to prevent duplicate FCM background alerts.
            // Do NOT dismiss native call here as native ringtone is authoritative on Android.
            nativeCallBridge.markCallPresented(call.id);
          }

          // Duplicate-event protection: If this call ID is already ringing, do not restart ringtone
          if (callStateRef.current === "INCOMING" && activeCallRef.current?.id === call.id) {
            return;
          }
          if (callStateRef.current === "IDLE") {
            const createdAtMs = call.createdAt ? new Date(call.createdAt).getTime() : Date.now();
            const elapsed = Math.max(0, Date.now() - createdAtMs);
            const remaining = elapsed > 60000 ? 0 : Math.max(15000, 45000 - elapsed);

            if (remaining <= 0) {
              console.log(`[CALL_TIMEOUT] Incoming call ${call.id} already expired (${elapsed}ms elapsed). Ignoring.`);
              if (call?.id) {
                nativeCallBridge.dismissNativeCall(call.id);
                nativeCallBridge.showMissedCallNotification({
                  callId: call.id,
                  callerName: call.callerName || "Customer",
                  serviceName: call.serviceName || "Voice Call",
                  bookingId: call.bookingId || ""
                }).catch(() => {});
              }
              return;
            }

            setActiveCall(call);
            setCallState("INCOMING");
            callAudioManager.playIncoming(call.id);

            clearIncomingTimeout();
            incomingTimeoutRef.current = setTimeout(() => {
              if (callStateRef.current === "INCOMING" && activeCallRef.current?.id === call.id) {
                console.log(`[CALL_TIMEOUT] Incoming call ${call.id} timed out locally after 45s`);
                clearIncomingTimeout();
                callAudioManager.stopAll();
                ringtonePlayer.stopRingtone();
                nativeCallBridge.stopIncomingRingtone();
                if (call?.id) {
                  nativeCallBridge.dismissNativeCall(call.id);
                  nativeCallBridge.showMissedCallNotification({
                    callId: call.id,
                    callerName: call.callerName || "Customer",
                    serviceName: call.serviceName || "Voice Call",
                    bookingId: call.bookingId || ""
                  }).catch(() => {});
                  fetch(`/api/calls/${call.id}/timeout`, {
                    method: "POST",
                    headers: getHeaders(),
                    body: JSON.stringify({})
                  }).catch(() => {});
                }
                setCallState("IDLE");
                setActiveCall(null);
                showCallEndedNotice("Missed call");
              }
            }, remaining);
          }
        }
      } else if (type === "call:accept") {
        if (call?.id) nativeCallBridge.dismissNativeCall(call.id);
        clearOutgoingTimeout();
        clearIncomingTimeout();
        callAudioManager.stopAll();

        // Idempotency check: if already active for same call, don't restart media session
        if (activeCallRef.current && activeCallRef.current.id === call.id && callStateRef.current === "ACTIVE" && livekitCredentialsRef.current) {
          return;
        }
        const isParticipant = matchesMe(call.callerId) || matchesMe(call.receiverId);
        if (isParticipant || callStateRef.current === "OUTGOING" || callStateRef.current === "INCOMING" || callStateRef.current === "ACCEPTING") {
          setActiveCall(call);
          setCallState("ACTIVE");

          if (livekit && livekit.participantToken && livekit.roomName) {
            if (!livekitCredentialsRef.current || livekitCredentialsRef.current.roomName !== livekit.roomName) {
              setLivekitCredentials(livekit);
            }
          } else if (!livekitCredentialsRef.current && call.bookingId) {
            fetchMyLiveKitToken(call.bookingId);
          }
        }
      } else if (
        type === "call:ended" ||
        type === "call:reject" ||
        type === "call:end" ||
        type === "call:cancel" ||
        type === "call:missed" ||
        type === "call:busy" ||
        type === "call:timeout"
      ) {
        if (call?.id) nativeCallBridge.dismissNativeCall(call.id);
        nativeCallBridge.stopActiveCallService().catch(() => {});
        clearOutgoingTimeout();
        clearIncomingTimeout();
        const targetCallId = call?.id || activeCallRef.current?.id;
        if (targetCallId) {
          handleRemoteCallEnded({
            callId: targetCallId,
            call,
            reason: data.reason || (type === "call:reject" ? "declined" : (type === "call:cancel" ? "cancelled" : (type === "call:timeout" || type === "call:missed" ? "timeout" : "ended"))),
            endedByUserId: data.endedByUserId,
            endedByRole: data.endedByRole,
            endedByName: data.endedByName,
            endedAt: data.endedAt
          });
        }
      }
    };
  }, [clearOutgoingTimeout, fetchMyLiveKitToken, handleRemoteCallEnded]);

  // ─── Socket.IO Initialization ──────────────────────────────────────────────
  const initializeSocket = useCallback((): Promise<void> => {
    const uid = currentUserIdRef.current;
    if (!uid) {
      console.warn("[SIGNALING] initializeSocket called with no currentUserId");
      return Promise.reject(new Error("No user ID available for signaling"));
    }

    if (socketConnectedRef.current && socketRef.current) {
      return Promise.resolve();
    }

    const signalingUrl = resolveSignalingUrl();
    if (!signalingUrl) {
      const err = new Error(
        `[SIGNALING_CONFIG_ERROR] No valid signaling server URL configured.`
      );
      console.error(err.message);
      return Promise.reject(err);
    }

    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
      socketConnectedRef.current = false;
    }

    const token = userTokenRef.current || getClientToken();
    if (!token) {
      console.warn("[SIGNALING] Aborting socket connection: No valid authentication token available.");
      return Promise.reject(new Error("No valid authentication token"));
    }

    const isDevTunnel = signalingUrl.includes("devtunnels.ms");
    const isHttps = signalingUrl.startsWith("https");
    const transports = isDevTunnel
      ? ["polling", "websocket"]
      : isHttps
      ? ["websocket", "polling"]
      : ["websocket", "polling"];

    console.log(`[SIGNALING] Connecting Socket.IO to ${signalingUrl} as userId=${uid}...`);

    const socket = io(signalingUrl, {
      auth: { token, userId: uid },
      transports,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      path: "/socket.io/",
      secure: isHttps || isDevTunnel,
      rejectUnauthorized: false
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log(`[SIGNALING] Socket.IO connected! socketId=${socket.id}`);
      socketConnectedRef.current = true;
      socket.emit("register", uid);

      const resolvers = connectResolversRef.current.splice(0);
      resolvers.forEach(({ resolve, timer }) => {
        clearTimeout(timer);
        resolve();
      });
    });

    socket.on("connect_error", (err: Error) => {
      const host = (() => { try { return new URL(signalingUrl || "").host; } catch { return signalingUrl; } })();
      const msg = (err.message || "").toLowerCase();
      if (
        msg.includes("jwt expired") ||
        msg.includes("token verification failed") ||
        msg.includes("authentication failed") ||
        msg.includes("invalid token")
      ) {
        console.warn(`[SIGNALING] Socket authentication failed (${err.message}). Halting reconnection.`);
        socket.disconnect();
        socketConnectedRef.current = false;
        try { socket.io.opts.reconnection = false; } catch (e) {}
        triggerAuthExpired();
        return;
      }
      console.warn(`[SIGNALING] Connection notice host=${host}:`, err.message);
    });

    socket.on("disconnect", (reason: string) => {
      console.warn("[SIGNALING] Socket.IO disconnected reason=", reason);
      socketConnectedRef.current = false;
      connectPromiseRef.current = null;
      callAudioManager.stopAll();
    });

    // Real-time signal listener dispatcher
    const events = [
      "call:ring",
      "call:initiate",
      "call:accept",
      "call:ended",
      "call:reject",
      "call:end",
      "call:cancel",
      "call:missed",
      "call:busy"
    ];
    events.forEach(evt => {
      socket.on(evt, (data: any) => {
        console.log(`[SIGNALING_EVENT] ${evt}:`, data);
        handleSignalPayloadRef.current({ type: evt, ...data });
      });
    });

    socket.on("call:signal", (data: any) => {
      console.log("[SIGNALING_EVENT] call:signal:", data);
      handleSignalPayloadRef.current(data);
    });

    return Promise.resolve();
  }, []);

  const ensureSocketConnected = useCallback(async (): Promise<void> => {
    if (socketConnectedRef.current && socketRef.current) {
      return;
    }

    if (connectPromiseRef.current) {
      return connectPromiseRef.current;
    }

    const promise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        connectResolversRef.current = connectResolversRef.current.filter(r => r.timer !== timer);
        connectPromiseRef.current = null;
        resolve(); // Soft fallback: do not throw hard error if signaling socket lags
      }, 5000);

      connectResolversRef.current.push({ resolve, reject, timer });

      initializeSocket().catch(() => resolve());
    });

    connectPromiseRef.current = promise;
    return promise;
  }, [initializeSocket]);

  // Proactively warm up socket connection on auth load
  // ─── Native Android background call wake-up & accept action recovery ─────
  // ─── Native Android background call wake-up & web push accept action recovery ─────
  const handleNativeCallAction = useCallback(async () => {
    handleNativeCallActionRef.current = handleNativeCallAction;

    // 1. Check Web URL search params (e.g. from Web Push notification click in Chrome)
    if (typeof window !== "undefined" && window.location.search) {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const webCallId = urlParams.get("callId");
        const autoAccept = urlParams.get("autoAccept") === "true";
        const hasActiveCallParam = urlParams.get("activeCall") === "true";

                if (webCallId && (hasActiveCallParam || autoAccept)) {
          // Wait until login is ready; this function runs again once currentUserId loads
          if (!currentUserIdRef.current) return;

          // Remove query params from address bar without page reload
          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);

          if (autoAccept) {
            console.log(`[CALL] Handling Web Push Auto-Accept for call: ${webCallId}`);
            clearOutgoingTimeout();
            callAudioManager.stopAll();
            setCallState("ACCEPTING");
            acceptInProgressRef.current = true;
            ensureSocketConnected().catch(() => {});

            const res = await fetch(`/api/calls/${webCallId}/accept`, {
              method: "POST",
              headers: getHeaders(),
              body: JSON.stringify({})
            });
            const data = await res.json();
            if (res.ok && data.success) {
              setActiveCall(data.call);
              setCallState("ACTIVE");
              if (data.livekit) {
                setLivekitCredentials(data.livekit);
              } else if (data.call.bookingId) {
                fetchMyLiveKitToken(data.call.bookingId);
              }
            } else {
              console.warn("[CALL] Failed to auto-accept call from Web Push:", data.error);
               acceptInProgressRef.current = false;
              callAudioManager.stopAll();
              setCallState("IDLE");
              setActiveCall(null);
              setLivekitCredentials(null);
            }
            return;
          } else {
            console.log(`[CALL] Handling Web Push notification click for call: ${webCallId}`);
            const res = await fetch(`/api/calls/${webCallId}`, { headers: getHeaders() });
            const data = await res.json();
            if (res.ok && data.call && (data.call.status === "INITIATED" || data.call.status === "RINGING")) {
              setActiveCall(data.call);
              setCallState("INCOMING");
              callAudioManager.playIncoming(data.call.id);
            }
            return;
          }
        }
      } catch (e) {
        acceptInProgressRef.current = false;
        console.warn("[CALL] Error parsing URL search params for call:", e);
      }
    }

    // 2. Check Native Android pending actions (e.g. from NotificationCompat.CallStyle action buttons)
    if (!nativeCallBridge.isNative()) return;
    try {
      const pending = await nativeCallBridge.getPendingCallAction();
      if (!pending || !pending.callId || !pending.action) return;

      const token =
        userTokenRef.current ||
        (typeof window !== "undefined"
          ? localStorage.getItem("cityconnect_token") || localStorage.getItem("auth_token")
          : null);

      // Guard: On cold start, if auth token is still loading from storage, preserve pendingAction
      // so it can be consumed as soon as auth resolves, rather than dropping it on unauthenticated 401.
      if (!token && !currentUserIdRef.current) {
        console.log("[CALL] Native pending action detected but auth is not yet resolved. Preserving pendingAction...");
        return;
      }

      const { action, callId } = pending;
      console.log(`[CALL_TRACE] Step 4: CallProvider.handleNativeCallAction picked it up (action=${action}, callId=${callId}, bookingId=${pending.bookingId || "none"})`);

      if (action === "accept") {
        console.log(`[CALL] Handling native notification Accept action for call: ${callId}`);
        clearOutgoingTimeout();
        callAudioManager.stopAll();
        setCallState("ACCEPTING");
        acceptInProgressRef.current = true;
        nativeCallBridge.startActiveCallService({
          callId,
          peerName: "BelConnect Caller",
          serviceName: "BelConnect Voice Call"
        }).catch(() => {});
        ensureSocketConnected().catch(() => {});

        // Step 3: GET /api/calls/{callId} to verify status is INITIATED or RINGING (or already ACCEPTED/CONNECTED by same user)
        let callCheckRes: Response;
        try {
          callCheckRes = await fetch(`/api/calls/${callId}`, { headers: getHeaders() });
        } catch (fetchErr: any) {
          handleAcceptTransientFailure(callId, fetchErr?.message || "Network error checking call status");
          return;
        }

        const callCheckData = await callCheckRes.json().catch(() => ({}));
        const existingCall = callCheckData?.call;

        // Step 7: If call is conclusively CANCELLED / REJECTED / EXPIRED / ENDED / BUSY / MISSED, clear pending action immediately
        if (existingCall) {
          const terminalStatuses = ["CANCELLED", "REJECTED", "EXPIRED", "ENDED", "BUSY", "MISSED"];
          if (terminalStatuses.includes(existingCall.status)) {
            console.log(`[CALL] Call ${callId} is conclusively '${existingCall.status}'. Clearing pending action immediately.`);
            await nativeCallBridge.clearPendingCallAction();
            await nativeCallBridge.dismissNativeCall(callId);
            await nativeCallBridge.stopActiveCallService();
            delete nativeAcceptRetryCountRef.current[callId];
            callAudioManager.stopAll();
            setCallState("IDLE");
            setActiveCall(null);
            setLivekitCredentials(null);
            return;
          }

          // Step 3 (cont): If already ACCEPTED or CONNECTED by this same user -> treat as idempotent success
          if (existingCall.status === "ACCEPTED" || existingCall.status === "CONNECTED") {
            const isMe = matchesMe(existingCall.receiverId) || matchesMe(existingCall.callerId);
            if (isMe) {
              console.log(`[CALL] Call ${callId} is already in status '${existingCall.status}'. Idempotent recovery.`);
              console.log(`[CALL_TRACE] Step 7: ActiveCall mounted (idempotent recovery: callId=${existingCall.id}, callState=ACTIVE, bookingId=${existingCall.bookingId || "none"})`);
              setActiveCall(existingCall);
              setCallState("ACTIVE");
              if (existingCall.bookingId) {
                await fetchMyLiveKitToken(existingCall.bookingId);
              }
              // Step 6: Clear pending action and dismiss native notification
              await nativeCallBridge.clearPendingCallAction();
              await nativeCallBridge.dismissNativeCall(callId);
              delete nativeAcceptRetryCountRef.current[callId];
              return;
            }
          }
        }

        // Step 4: POST /api/calls/{callId}/accept
        console.log(`[CALL_TRACE] Step 5: POST /api/calls/${callId}/accept sent (hasAuth=${!!getHeaders().Authorization})`);
        let res: Response;
        try {
          res = await fetch(`/api/calls/${callId}/accept`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({})
          });
        } catch (fetchErr: any) {
          handleAcceptTransientFailure(callId, fetchErr?.message || "Network error during accept request");
          return;
        }

        const data = await res.json().catch(() => ({}));
        console.log(`[CALL_TRACE] Step 6: POST /accept response received (status=${res.status}, ok=${res.ok}, success=${data?.success}, livekitPresent=${!!data?.livekit}, roomName=${data?.livekit?.roomName || data?.call?.roomName || "none"})`);

        if (res.ok && data.success) {
          // Step 5: Obtain/confirm LiveKit credentials and begin room connection
          console.log(`[CALL_TRACE] Step 7: ActiveCall mounted (callId=${data.call?.id}, callState=ACTIVE, roomName=${data.livekit?.roomName || data.call?.bookingId || "none"})`);
          setActiveCall(data.call);
          setCallState("ACTIVE");
          if (data.livekit) {
            setLivekitCredentials(data.livekit);
          } else if (data.call?.bookingId) {
            fetchMyLiveKitToken(data.call.bookingId);
          }

          if (socketRef.current && socketConnectedRef.current) {
            socketRef.current.emit("call:accept", { call: data.call, livekit: data.livekit });
          }

          // Step 6: ONLY THEN clear the pending action and dismiss the native notification
          await nativeCallBridge.clearPendingCallAction();
          await nativeCallBridge.dismissNativeCall(callId);
          delete nativeAcceptRetryCountRef.current[callId];
          console.log(`[CALL] Successfully accepted call ${callId} and cleared pending action.`);
        } else {
          const errMsg = data?.error || `HTTP ${res.status}`;
          // Conclusive non-recoverable error (e.g. 400 Bad Request, 403 Forbidden, 404 Not Found)
          if (res.status === 400 || res.status === 403 || res.status === 404) {
            console.warn(`[CALL] Conclusive failure accepting call ${callId} (${errMsg}). Clearing pending action.`);
            await nativeCallBridge.clearPendingCallAction();
            await nativeCallBridge.dismissNativeCall(callId);
            await nativeCallBridge.stopActiveCallService();
            delete nativeAcceptRetryCountRef.current[callId];
            callAudioManager.stopAll();
            setCallState("IDLE");
            setActiveCall(null);
            setLivekitCredentials(null);
          } else {
            // Step 8: Transient failure -> retry within bounded window
            handleAcceptTransientFailure(callId, errMsg);
          }
        }
      } else if (action === "incoming") {
        console.log(`[CALL] Handling native notification Incoming click for call: ${callId}`);
        const res = await fetch(`/api/calls/${callId}`, { headers: getHeaders() });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.call && (data.call.status === "INITIATED" || data.call.status === "RINGING")) {
          const call = data.call;
          const createdAtMs = call.createdAt ? new Date(call.createdAt).getTime() : Date.now();
          const elapsed = Math.max(0, Date.now() - createdAtMs);
          const remaining = elapsed > 60000 ? 0 : Math.max(15000, 45000 - elapsed);

          if (remaining <= 0) {
            console.log(`[CALL_TIMEOUT] Native incoming call ${call.id} already expired (${elapsed}ms). Dismissing.`);
            callAudioManager.stopAll();
            setCallState("IDLE");
            setActiveCall(null);
            nativeCallBridge.showMissedCallNotification({
              callId: call.id,
              callerName: call.callerName || "Customer",
              serviceName: call.serviceName || "Voice Call",
              bookingId: call.bookingId || ""
            }).catch(() => {});
            await nativeCallBridge.dismissNativeCall(callId);
          } else {
            setActiveCall(call);
            setCallState("INCOMING");
            callAudioManager.playIncoming(call.id);

            clearIncomingTimeout();
            incomingTimeoutRef.current = setTimeout(() => {
              if (callStateRef.current === "INCOMING" && activeCallRef.current?.id === call.id) {
                console.log(`[CALL_TIMEOUT] Incoming call ${call.id} timed out locally after 45s`);
                clearIncomingTimeout();
                callAudioManager.stopAll();
                ringtonePlayer.stopRingtone();
                nativeCallBridge.stopIncomingRingtone();
                if (call?.id) {
                  nativeCallBridge.dismissNativeCall(call.id);
                  nativeCallBridge.showMissedCallNotification({
                    callId: call.id,
                    callerName: call.callerName || "Customer",
                    serviceName: call.serviceName || "Voice Call",
                    bookingId: call.bookingId || ""
                  }).catch(() => {});
                  fetch(`/api/calls/${call.id}/timeout`, {
                    method: "POST",
                    headers: getHeaders(),
                    body: JSON.stringify({})
                  }).catch(() => {});
                }
                setCallState("IDLE");
                setActiveCall(null);
                showCallEndedNotice("Missed call");
              }
            }, remaining);
          }
        } else {
          console.log(`[CALL] Stale incoming notification (status: ${data?.call?.status || "unknown"}). Dismissing.`);
          callAudioManager.stopAll();
          setCallState("IDLE");
          setActiveCall(null);
          await nativeCallBridge.dismissNativeCall(callId);
        }
        await nativeCallBridge.clearPendingCallAction();
      }
    } catch (err) {
      console.warn("[CALL] Error checking native call action:", err);
    } finally {
      acceptInProgressRef.current = false;
    }
  }, [clearOutgoingTimeout, ensureSocketConnected, getHeaders, fetchMyLiveKitToken, handleAcceptTransientFailure, matchesMe]);

  // Proactively check native call action on mount & app resume/foreground transition
  useEffect(() => {
    handleNativeCallAction();

    let resumeListener: any = null;
    let appStateListener: any = null;

    if (typeof window !== "undefined" && nativeCallBridge.isNative()) {
      App.addListener("resume", () => {
        console.log("[CALL] App resumed from background. Reconnecting socket & checking call actions...");
        ensureSocketConnected().catch(() => {});
        handleNativeCallAction();
      }).then((l) => { resumeListener = l; }).catch(() => {});

      App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) {
          console.log("[CALL] App active state changed to foreground.");
          ensureSocketConnected().catch(() => {});
          handleNativeCallAction();
        }
      }).then((l) => { appStateListener = l; }).catch(() => {});
    }

    return () => {
      if (resumeListener) resumeListener.remove();
      if (appStateListener) appStateListener.remove();
    };
  }, [handleNativeCallAction, ensureSocketConnected]);

  // Proactively warm up socket connection on auth load & sync native push token
  useEffect(() => {
    if (currentUserId) {
      ensureSocketConnected().catch(() => {});
      registerAndSubscribeUser(currentUserId).catch(() => {});
      nativeCallBridge.syncNativeDeviceToken(currentUserId).catch(() => {});
      handleNativeCallAction();

      const token =
        userTokenRef.current ||
        (typeof window !== "undefined"
          ? localStorage.getItem("cityconnect_token") || localStorage.getItem("auth_token")
          : null);
      if (token) {
        nativeCallBridge.setAuthCredentials(token, typeof window !== "undefined" ? window.location.origin : undefined).catch(() => {});
      }
    }

    let crossTabChannel: BroadcastChannel | null = null;
    try {
      crossTabChannel = new BroadcastChannel("cityconnect-calls-global-sync");
      crossTabChannel.onmessage = (event) => {
        if (event.data) {
          handleSignalPayloadRef.current(event.data);
        }
      };
    } catch {}

    return () => {
      if (crossTabChannel) {
        try { crossTabChannel.close(); } catch {}
      }
    };
  }, [currentUserId, ensureSocketConnected]);

  // Cleanup all audio if CallProvider unmounts
  // ─── Native Android Active-Call Foreground Service Lifecycle ─────────────
  useEffect(() => {
    if (callState === "ACTIVE" && activeCall && activeCall.id && !activeCall.id.startsWith("temp-")) {
      const isCaller = currentUserId === activeCall.callerId;
      const peerName = isCaller ? (activeCall.receiverName || "Service Partner") : (activeCall.callerName || "Customer");
      nativeCallBridge.startActiveCallService({
        callId: activeCall.id,
        peerName,
        serviceName: activeCall.serviceName || "BelConnect Voice Call"
      }).catch(() => {});
    } else if (callState === "IDLE" || callState === "OUTGOING" || callState === "INCOMING") {
      nativeCallBridge.stopActiveCallService().catch(() => {});
    }
  }, [callState, activeCall, currentUserId]);

  // Cleanup all audio and foreground services if CallProvider unmounts
  useEffect(() => {
    return () => {
      callAudioManager.stopAll();
      nativeCallBridge.stopActiveCallService().catch(() => {});
    };
  }, []);

  // Logout cleanup
  const prevUserIdRef = useRef(currentUserId);
  useEffect(() => {
    const prevId = prevUserIdRef.current;
    prevUserIdRef.current = currentUserId;

    if (prevId && prevId !== currentUserId && socketRef.current) {
      console.log(`[CALL] User changed (${prevId} → ${currentUserId}). Destroying old socket.`);
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
      socketConnectedRef.current = false;
      connectPromiseRef.current = null;
      connectResolversRef.current = [];
    }
  }, [currentUserId]);

  // ─── Real-time active call sync (2s polling recovery fallback) ────────────
  useEffect(() => {
    if (!currentUserId) return;

    const syncCallStatus = async () => {
      try {
        const res = await authFetch("/api/calls/active", { headers: getHeaders() });
        if (!res.ok) return;
        const data = await res.json();

        if (data.call) {
          activeCallMissingCountRef.current = 0;
          const call = data.call;
          const uid = currentUserIdRef.current;
          const matchesMe = (id: string) => {
            if (!id || !uid) return false;
            if (id === uid) return true;
            if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
              if ((uid.includes("prov") || uid === "provider-1") && (id.includes("prov") || id === "provider-1")) return true;
              if ((uid.includes("cust") || uid === "customer-1") && (id.includes("cust") || id === "customer-1")) return true;
            }
            return false;
          };
          const isCaller = matchesMe(call.callerId);
          const isReceiver = matchesMe(call.receiverId);

          if (call.status === "INITIATED" || call.status === "RINGING") {
            if (isReceiver && callStateRef.current === "IDLE") {
              const createdAtMs = call.createdAt ? new Date(call.createdAt).getTime() : Date.now();
              const elapsed = Math.max(0, Date.now() - createdAtMs);
              const remaining = elapsed > 60000 ? 0 : Math.max(15000, 45000 - elapsed);

              if (remaining <= 0) {
                console.log(`[CALL_TIMEOUT] Polling detected expired call ${call.id} (${elapsed}ms).`);
                if (call?.id && nativeCallBridge.isNative()) {
                  nativeCallBridge.showMissedCallNotification({
                    callId: call.id,
                    callerName: call.callerName || "Customer",
                    serviceName: call.serviceName || "Voice Call",
                    bookingId: call.bookingId || ""
                  }).catch(() => {});
                }
              } else {
                setActiveCall(call);
                setCallState("INCOMING");
                callAudioManager.playIncoming(call.id);

                clearIncomingTimeout();
                incomingTimeoutRef.current = setTimeout(() => {
                  if (callStateRef.current === "INCOMING" && activeCallRef.current?.id === call.id) {
                    console.log(`[CALL_TIMEOUT] Incoming call ${call.id} timed out locally after 45s`);
                    clearIncomingTimeout();
                    callAudioManager.stopAll();
                    ringtonePlayer.stopRingtone();
                    nativeCallBridge.stopIncomingRingtone();
                    if (call?.id) {
                      nativeCallBridge.dismissNativeCall(call.id);
                      nativeCallBridge.showMissedCallNotification({
                        callId: call.id,
                        callerName: call.callerName || "Customer",
                        serviceName: call.serviceName || "Voice Call",
                        bookingId: call.bookingId || ""
                      }).catch(() => {});
                      fetch(`/api/calls/${call.id}/timeout`, {
                        method: "POST",
                        headers: getHeaders(),
                        body: JSON.stringify({})
                      }).catch(() => {});
                    }
                    setCallState("IDLE");
                    setActiveCall(null);
                    showCallEndedNotice("Missed call");
                  }
                }, remaining);
                if (typeof document !== "undefined" && document.hidden) {
                  nativeCallBridge.showIncomingCallNotification({
                    callId: call.id,
                    callerName: call.callerName || "Customer",
                    serviceName: call.serviceName || "Voice Call",
                    bookingId: call.bookingId
                  });
                }
              }
            } else if (isCaller && callStateRef.current === "IDLE") {
              setActiveCall(call); setCallState("OUTGOING"); callAudioManager.playOutgoing();
            }
          } else if (call.status === "ACCEPTED" || call.status === "CONNECTED") {
            clearOutgoingTimeout();
            callAudioManager.stopAll();
            if ((isCaller || isReceiver) && callStateRef.current !== "ACTIVE") {
              setActiveCall(call); setCallState("ACTIVE");
              
              // CRITICAL BUG FIX 23: Ignore token replacement if room is already active
              if (data.livekit) {
                if (!livekitCredentialsRef.current || livekitCredentialsRef.current.roomName !== data.livekit.roomName) {
                  setLivekitCredentials(data.livekit);
                }
              } else if (!livekitCredentialsRef.current && call.bookingId) {
                fetchMyLiveKitToken(call.bookingId);
              }
            }
          } else if (["REJECTED","ENDED","CANCELLED","COMPLETED","BUSY","MISSED"].includes(call.status)) {
            const activeId = activeCallRef.current?.id ? String(activeCallRef.current.id).trim() : null;
            const reportedId = call.id ? String(call.id).trim() : null;
            const matchesCurrent = Boolean(activeId && reportedId && activeId === reportedId && !activeId.startsWith("temp-"));
            if (matchesCurrent) {
              console.log(`[CALL] Polling detected terminal call status '${call.status}' for call ${reportedId}. Triggering handleRemoteCallEnded.`);
              const reason = call.endReason || (call.status === "REJECTED" ? "declined" : (call.status === "CANCELLED" ? "cancelled" : (call.status === "MISSED" ? "timeout" : "ended")));
              handleRemoteCallEnded({
                callId: reportedId || activeId || undefined,
                call,
                reason,
                endedByUserId: call.endedByUserId,
                endedByRole: call.endedByRole
              });
            }
          }
        } else {
          // If we locally believe a call is active/outgoing/incoming, actively check the specific call ID
          const activeCurrent = activeCallRef.current;
          if (activeCurrent && activeCurrent.id && !activeCurrent.id.startsWith("temp-")) {
            try {
              const specificRes = await fetch(`/api/calls/${activeCurrent.id}`, { headers: getHeaders() });
              if (specificRes.ok) {
                const specificData = await specificRes.json();
                const specificCall = specificData?.call;
                if (specificCall && ["REJECTED", "ENDED", "CANCELLED", "COMPLETED", "BUSY", "MISSED"].includes(specificCall.status)) {
                  console.log(`[CALL] Polling check confirmed call ${specificCall.id} is terminal '${specificCall.status}'. Tearing down immediately.`);
                  const reason = specificCall.endReason || (specificCall.status === "REJECTED" ? "declined" : (specificCall.status === "CANCELLED" ? "cancelled" : (specificCall.status === "MISSED" ? "timeout" : "ended")));
                  handleRemoteCallEnded({
                    callId: specificCall.id,
                    call: specificCall,
                    reason,
                    endedByUserId: specificCall.endedByUserId,
                    endedByRole: specificCall.endedByRole
                  });
                  return;
                }
              }
            } catch {}
          }

          activeCallMissingCountRef.current += 1;
          const currentState = callStateRef.current;
          const isTransientState = currentState === "CREATING" || currentState === "OUTGOING" || currentState === "INCOMING" || currentState === "ACCEPTING";
          const isTempCall = activeCallRef.current?.id?.startsWith("temp-");
          
          if (!isTransientState && !isTempCall && currentState === "ACTIVE" && activeCallMissingCountRef.current >= 5) {
            console.log("[CALL] 5 consecutive null responses during ACTIVE state. Clearing call.");
            handleRemoteCallEnded({
              callId: activeCallRef.current?.id,
              reason: "ended"
            });
          }
        }
      } catch {}
    };

    // Single initial call status check on authenticated mount (PART 8)
    syncCallStatus();

    // Fallback polling ONLY when signaling socket is disconnected, interval >= 60 seconds
    const fallbackPollInterval = 60000;
    const interval = setInterval(() => {
      if (!socketConnectedRef.current && getClientToken()) {
        syncCallStatus();
      }
    }, fallbackPollInterval);

    return () => clearInterval(interval);
  }, [currentUserId, getHeaders, fetchMyLiveKitToken, clearOutgoingTimeout, handleRemoteCallEnded]);

  // ─── startCall ────────────────────────────────────────────────────────────
  const startCall = useCallback(async (bookingId: string) => {
    if (callStartInProgressRef.current || callStateRef.current !== "IDLE" || activeCallRef.current) return;
    if (!currentUserIdRef.current) {
      console.error("[CALL_ERROR] Please log in to initiate a voice call.");
      return;
    }

    const clickTime = Date.now();
    callStartInProgressRef.current = true;

    ensureSocketConnected().catch(() => {});

    const tempId = `temp-${Date.now()}`;
    const tempCall: CallRecord = {
      id: tempId,
      bookingId,
      callerId: currentUserIdRef.current,
      receiverId: "pending",
      callerName: currentUser?.name || "Customer",
      receiverName: "Service Partner",
      status: "INITIATED",
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      durationSeconds: 0
    };

    setActiveCall(tempCall);
    setCallState("OUTGOING");
    callAudioManager.playOutgoing();

    // Outgoing ring timeout (45 seconds)
    clearOutgoingTimeout();
    outgoingTimeoutRef.current = setTimeout(async () => {
      if (callStateRef.current === "OUTGOING") {
        console.log("[CALL] Outgoing ring timed out after 45s");
        const callToTimeout = activeCallRef.current;
        clearOutgoingTimeout();
        clearIncomingTimeout();
        callAudioManager.stopAll();
        ringtonePlayer.stopRingtone();
        callAudioManager.playCallEndedSound();
        setCallState("IDLE");
        setActiveCall(null);
        callStartInProgressRef.current = false;
        showCallEndedNotice("Call not answered");

        const targetId = callToTimeout?.id;
        if (targetId && !targetId.startsWith("temp-")) {
          try {
            await fetch(`/api/calls/${targetId}/timeout`, {
              method: "POST",
              headers: getHeaders(),
              body: JSON.stringify({})
            });
          } catch (e) {
            console.warn("[CALL] Error notifying server of call timeout:", e);
          }
        }
      }
    }, 45000);

    try {
      const res = await fetch("/api/calls", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ bookingId })
      });
      const data = await res.json();
      console.log(`[CALL_PERF] start_call_api_ms=${Date.now() - clickTime}`);

      if (res.ok && data.success && data.call) {
        console.log(`[CALL_TRACE] callId=${data.call.id} stage=caller_start_confirmed`);
        setActiveCall(data.call);
        callAudioManager.setCallId(data.call.id);
        if (data.livekit) {
          setLivekitCredentials(data.livekit);
        }
        // Synchronize outgoing timeout to server's authoritative createdAt
        if (data.call.createdAt) {
          clearOutgoingTimeout();
          const createdAtMs = new Date(data.call.createdAt).getTime();
          const remaining = Math.max(1000, 45000 - (Date.now() - createdAtMs));
          outgoingTimeoutRef.current = setTimeout(async () => {
            if (callStateRef.current === "OUTGOING") {
              console.log("[CALL_TIMEOUT] Outgoing ring timed out after 45s (server-synced)");
              const targetId = activeCallRef.current?.id || data.call.id;
              clearOutgoingTimeout();
              clearIncomingTimeout();
              callAudioManager.stopAll();
              ringtonePlayer.stopRingtone();
              callAudioManager.playCallEndedSound();
              setCallState("IDLE");
              setActiveCall(null);
              callStartInProgressRef.current = false;
              showCallEndedNotice("Call not answered");

              if (targetId && !targetId.startsWith("temp-")) {
                try {
                  await fetch(`/api/calls/${targetId}/timeout`, {
                    method: "POST",
                    headers: getHeaders(),
                    body: JSON.stringify({})
                  });
                } catch (e) {
                  console.warn("[CALL] Error notifying server of call timeout:", e);
                }
              }
            }
          }, remaining);
        }
        if (socketRef.current && socketConnectedRef.current) {
          socketRef.current.emit("call:initiate", { call: data.call });
        }
        try {
          const bc = new BroadcastChannel("cityconnect-calls-global-sync");
          bc.postMessage({ type: "call:initiate", call: data.call });
          bc.close();
        } catch {}
      } else {
        clearOutgoingTimeout();
        callAudioManager.stopAll();
        setCallState("IDLE"); setActiveCall(null);
        callStartInProgressRef.current = false;
      }
    } catch (err: any) {
      console.error("[CALL_ERROR] Error initiating call:", err);
      clearOutgoingTimeout();
      callAudioManager.stopAll();
      setCallState("IDLE"); setActiveCall(null);
      callStartInProgressRef.current = false;
    }
  }, [getHeaders, ensureSocketConnected, currentUser?.name, clearOutgoingTimeout]);

  // ─── acceptCall ───────────────────────────────────────────────────────────
  const acceptCall = useCallback(async () => {
        if (acceptInProgressRef.current || !activeCallRef.current) {
      console.log(`[CALL_TRACE] acceptCall blocked: inProgress=${acceptInProgressRef.current}, hasCall=${!!activeCallRef.current}`);
      return;
    }

    const acceptStartTime = Date.now();
    acceptInProgressRef.current = true;
    clearOutgoingTimeout();
    clearIncomingTimeout();
    callAudioManager.stopAll();
    setCallState("ACCEPTING");

    const callId = activeCallRef.current.id;
    if (callId) {
      nativeCallBridge.dismissNativeCall(callId).catch(() => {});
      nativeCallBridge.startActiveCallService({
        callId,
        peerName: activeCallRef.current.callerName || "Customer",
        serviceName: activeCallRef.current.serviceName || "BelConnect Voice Call"
      }).catch(() => {});
    }

    ensureSocketConnected().catch(() => {});

    try {
      const res = await fetch(`/api/calls/${callId}/accept`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({})
      });
      const data = await res.json();
      console.log(`[CALL_PERF] accept_api_ms=${Date.now() - acceptStartTime}`);

      if (res.ok && data.success) {
        setActiveCall(data.call);
        setCallState("ACTIVE");
        if (data.livekit) {
          if (!livekitCredentialsRef.current || livekitCredentialsRef.current.roomName !== data.livekit.roomName) {
            setLivekitCredentials(data.livekit);
          }
        } else if (data.call.bookingId && !livekitCredentialsRef.current) {
          fetchMyLiveKitToken(data.call.bookingId);
        }

        if (socketRef.current && socketConnectedRef.current) {
          socketRef.current.emit("call:accept", { call: data.call, livekit: data.livekit });
        }

        try {
          const bc = new BroadcastChannel("cityconnect-calls-global-sync");
          bc.postMessage({ type: "call:accept", call: data.call, livekit: data.livekit });
          bc.close();
        } catch {}
      } else {
        nativeCallBridge.stopActiveCallService().catch(() => {});
        callAudioManager.stopAll();
        setCallState("IDLE"); setActiveCall(null); setLivekitCredentials(null);
        acceptInProgressRef.current = false;
        callStartInProgressRef.current = false;
        const errMsg = data.error || "Failed to accept call";
        const isExpectedEndedState =
          errMsg.includes("ENDED") ||
          errMsg.includes("CANCELLED") ||
          errMsg.includes("MISSED") ||
          errMsg.includes("EXPIRED") ||
          errMsg.includes("REJECTED");
        if (isExpectedEndedState) {
          console.info("[CALL] Call is no longer active:", errMsg);
        } else {
          console.error("[CALL_ERROR]", errMsg);
        }
      }
    } catch (err: any) {
      console.error("[CALL_SESSION_FAILED] Error accepting call:", err);
      nativeCallBridge.stopActiveCallService().catch(() => {});
      callAudioManager.stopAll();
      setCallState("IDLE"); setActiveCall(null); setLivekitCredentials(null);
      acceptInProgressRef.current = false;
      callStartInProgressRef.current = false;
    }
  }, [getHeaders, ensureSocketConnected, fetchMyLiveKitToken, clearOutgoingTimeout]);

  // ─── rejectCall ───────────────────────────────────────────────────────────
  const rejectCall = useCallback(async () => {
    if (!activeCallRef.current) return;
    const callToReject = activeCallRef.current;
    const callId = callToReject.id;

    processedTerminalCallIdsRef.current.add(callId);
    clearOutgoingTimeout();
    clearIncomingTimeout();
    callAudioManager.stopAll();
    ringtonePlayer.stopRingtone();
    callAudioManager.playCallEndedSound();

    nativeCallBridge.dismissNativeCall(callId).catch(() => {});
    nativeCallBridge.stopActiveCallService().catch(() => {});
    setCallState("IDLE");
    setActiveCall(null);
    setLivekitCredentials(null);

    const endedAt = new Date().toISOString();
    const isCaller = matchesMe(callToReject.callerId);
    const endedByName = currentUser?.name || (isCaller ? "Customer" : "Service Provider");
    const endedByRole = isCaller ? "customer" : "provider";

    if (socketRef.current && socketConnectedRef.current) {
      socketRef.current.emit("call:ended", {
        call: callToReject,
        reason: "declined",
        endedByUserId: currentUserIdRef.current,
        endedByRole,
        endedByName,
        endedAt
      });
      socketRef.current.emit("call:reject", { call: { id: callId } });
    }

    try {
      await fetch(`/api/calls/${callId}/reject`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({})
      });
    } catch (err) {
      console.warn("[CALL] Reject call API notice:", err);
    }
  }, [getHeaders, clearOutgoingTimeout, clearIncomingTimeout, currentUser?.name, matchesMe]);

  // ─── endCall ──────────────────────────────────────────────────────────────
  const endCall = useCallback(async () => {
    if (endInProgressRef.current) return;
    endInProgressRef.current = true;

    clearOutgoingTimeout();
    clearIncomingTimeout();
    callAudioManager.stopAll();
    ringtonePlayer.stopRingtone();
    callAudioManager.playCallEndedSound();

    const callToClose = activeCallRef.current;
    const callId = callToClose?.id;

    if (callId) {
      processedTerminalCallIdsRef.current.add(callId);
      nativeCallBridge.dismissNativeCall(callId).catch(() => {});
    }
    nativeCallBridge.stopActiveCallService().catch(() => {});

    setCallState("IDLE");
    setActiveCall(null);
    setLivekitCredentials(null);

    if (callToClose && callId && !callId.startsWith("temp-")) {
      const endedAt = new Date().toISOString();
      const isCaller = matchesMe(callToClose.callerId);
      const endedByName = currentUser?.name || (isCaller ? "Customer" : "Service Provider");
      const endedByRole = isCaller ? "customer" : "provider";
      const isCancel = callStateRef.current === "OUTGOING" || callToClose.status === "INITIATED" || callToClose.status === "RINGING";
      const reason = isCancel ? "cancelled" : "ended";
      const signalType = isCancel ? "call:cancel" : "call:end";

      if (socketRef.current && socketConnectedRef.current) {
        socketRef.current.emit("call:ended", {
          call: callToClose,
          reason,
          endedByUserId: currentUserIdRef.current,
          endedByRole,
          endedByName,
          endedAt
        });
        socketRef.current.emit(signalType, { call: callToClose });
      }
      try {
        const bc = new BroadcastChannel("cityconnect-calls-global-sync");
        bc.postMessage({
          type: "call:ended",
          call: callToClose,
          reason,
          endedByUserId: currentUserIdRef.current,
          endedByRole,
          endedByName,
          endedAt
        });
        bc.close();
      } catch {}

      try {
        await fetch(`/api/calls/${callId}/end`, {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({ reason })
        });
      } catch (err) {
        console.warn("[CALL] End call API notice:", err);
      }
    }

    callStartInProgressRef.current = false;
    acceptInProgressRef.current = false;
    endInProgressRef.current = false;
    fetchingTokenForRef.current = null;
  }, [getHeaders, clearOutgoingTimeout, clearIncomingTimeout, currentUser?.name, matchesMe]);

  return (
    <CallContext.Provider
      value={{
        activeCall,
        livekitCredentials,
        callState,
        startCall,
        acceptCall,
        rejectCall,
        endCall,
        isCalling: callState !== "IDLE",
        socket: socketRef.current
      }}
    >
      {children}

      {/* Render modals based on callState */}
      {callState === "INCOMING" && activeCall && (
        <IncomingCall
          call={activeCall}
          onAccept={acceptCall}
          onReject={rejectCall}
        />
      )}

      {callState === "OUTGOING" && activeCall && (
        <OutgoingCall
          call={activeCall}
          onCancel={endCall}
        />
      )}

      {(callState === "ACTIVE" || callState === "ACCEPTING") && activeCall && (
        <ActiveCall
          call={activeCall}
          livekit={livekitCredentials}
          currentUserId={currentUserId}
          onEndCall={endCall}
        />
      )}

      {/* Call Ended / Declined Floating Toast Notice */}
      {callEndedNotice && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999999] pointer-events-none animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-slate-900/95 border border-slate-700/80 shadow-2xl backdrop-blur-xl text-white text-xs font-semibold tracking-wide">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            <span>{callEndedNotice}</span>
          </div>
        </div>
      )}
    </CallContext.Provider>
  );
}
