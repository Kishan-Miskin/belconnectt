/**
 * Single source of truth for resolving the Socket.IO signaling server URL.
 * Handles trailing slashes, environment variables, Dev Tunnels, localhost dev,
 * and production Render defaults.
 */
export function getSignalingUrl(): string {
  // 1. Check environment variables
  const rawUrl =
    process.env.NEXT_PUBLIC_SIGNALING_URL ||
    process.env.SIGNALING_SERVER_URL;

  if (rawUrl && typeof rawUrl === "string") {
    let cleaned = rawUrl.trim();
    // Strip trailing slashes
    while (cleaned.endsWith("/")) {
      cleaned = cleaned.slice(0, -1);
    }
    // If it's a remote URL (not localhost and not Vercel, which doesn't support WebSockets), honor it directly
    if (cleaned && !cleaned.includes("localhost") && !cleaned.includes("127.0.0.1") && !cleaned.includes("vercel.app")) {
      return cleaned;
    }
  }

  // 2. Client-side browser inspection
  if (typeof window !== "undefined") {
    const browserHost = window.location.hostname;
    const protocol = window.location.protocol;
    const isLocalBrowser = browserHost === "localhost" || browserHost === "127.0.0.1";

    // VS Code Dev Tunnels forwarding port 3000 -> 4001
    if (browserHost.includes("devtunnels.ms")) {
      const derivedSignalingHost = browserHost.replace(/-3000(?=\.|\b)/, "-4001");
      return `${protocol}//${derivedSignalingHost}`;
    }

    // Local desktop development
    if (isLocalBrowser) {
      return `http://${browserHost}:4001`;
    }

    // Production domains, Vercel deployments, or standalone Android APK
    return "https://belcconect-backend.onrender.com";
  }

  // 3. Server-side / fallback
  if (rawUrl && typeof rawUrl === "string") {
    let cleaned = rawUrl.trim();
    while (cleaned.endsWith("/")) {
      cleaned = cleaned.slice(0, -1);
    }
    if (cleaned) return cleaned;
  }

  return process.env.NODE_ENV === "production"
    ? "https://belcconect-backend.onrender.com"
    : "http://localhost:4001";
}

