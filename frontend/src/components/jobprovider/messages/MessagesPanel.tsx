"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Search, Mail, ExternalLink, ArrowLeft, Loader2, Inbox } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { panelVariants } from "../mockData";
import { AvatarCircle } from "../common/AvatarCircle";
import { getAuthToken } from "@/lib/jwt";

export function MessagesPanel() {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeMsg, setActiveMsg] = useState<any | null>(null);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchMessages = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = getAuthToken();
      const res = await fetch("/api/jobprovider/messages", {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch messages");

      const msgs = data.messages || [];
      setMessages(msgs);
      setUnreadCount(data.unreadCount || 0);
      if (msgs.length > 0 && !activeMsg) {
        setActiveMsg(msgs[0]);
      }
    } catch (err: any) {
      console.error("Fetch employer messages error:", err);
      setError(err.message || "Failed to load candidate messages");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, []);

  const selectMessage = async (msg: any) => {
    setActiveMsg(msg);
    setShowMobileChat(true);

    if (!msg.read_at) {
      try {
        const token = getAuthToken();
        await fetch("/api/jobprovider/messages", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ messageId: msg.id }),
        });

        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, read_at: new Date().toISOString() } : m))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (e) {
        console.error("Mark read error:", e);
      }
    }
  };

  const filteredMessages = messages.filter((m) => {
    const q = searchQuery.toLowerCase();
    return (
      m.candidate_name?.toLowerCase().includes(q) ||
      m.from_email?.toLowerCase().includes(q) ||
      m.subject?.toLowerCase().includes(q) ||
      m.job_title?.toLowerCase().includes(q)
    );
  });

  const getGmailComposeUrl = (msg: any) => {
    const to = encodeURIComponent(msg.from_email || "");
    const subject = encodeURIComponent(`Re: ${msg.subject || `Inquiry for ${msg.job_title}`}`);
    const body = encodeURIComponent(
      `Hi ${msg.candidate_name || "Candidate"},\n\nThank you for reaching out regarding the position "${msg.job_title}".\n\n`
    );
    return `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${body}`;
  };

  return (
    <motion.div {...panelVariants}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-xl text-foreground">{t("jobprovider.messagesTitle")}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">{t("jobprovider.communicateApplicants")}</p>
        </div>
        {unreadCount > 0 && (
          <span className="px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-bold">
            {unreadCount} Unread Inquiry{unreadCount > 1 ? "ies" : ""}
          </span>
        )}
      </div>

      <div
        className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden flex flex-col sm:flex-row"
        style={{ minHeight: "520px" }}
      >
        {/* Inbox list */}
        <div
          className={`w-full sm:w-80 border-b sm:border-b-0 sm:border-r border-border flex flex-col shrink-0 ${
            showMobileChat ? "hidden sm:flex" : "flex"
          }`}
        >
          <div className="p-4 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("jobprovider.searchConversations")}
                className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-xl bg-muted/50 focus:bg-background focus:ring-2 focus:ring-primary focus:border-transparent transition-all text-foreground placeholder-muted-foreground"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Loading inbox…
              </div>
            ) : error ? (
              <div className="p-4 text-xs text-red-500 text-center">{error}</div>
            ) : filteredMessages.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Inbox className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-xs">No candidate inquiries found</p>
              </div>
            ) : (
              filteredMessages.map((msg) => {
                const isUnread = !msg.read_at;
                const initials = (msg.candidate_name || "C")
                  .split(" ")
                  .map((n: string) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase();

                return (
                  <div
                    key={msg.id}
                    onClick={() => selectMessage(msg)}
                    className={`flex items-start gap-3 p-4 cursor-pointer border-b border-border last:border-0 transition-colors ${
                      activeMsg?.id === msg.id ? "bg-primary/5" : "hover:bg-muted/30"
                    }`}
                  >
                    <div className="relative">
                      <AvatarCircle initials={initials} size="sm" />
                      {isUnread && (
                        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary border-2 border-card" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between gap-2">
                        <p className={`text-sm truncate ${isUnread ? "font-bold text-foreground" : "font-medium text-foreground"}`}>
                          {msg.candidate_name}
                        </p>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {msg.created_at ? new Date(msg.created_at).toLocaleDateString() : ""}
                        </span>
                      </div>
                      <p className="text-xs text-primary font-medium truncate mt-0.5">{msg.subject}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{msg.body}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Message view */}
        {activeMsg ? (
          <div className={`flex-1 flex flex-col min-w-0 ${!showMobileChat ? "hidden sm:flex" : "flex"}`}>
            {/* Header */}
            <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5 sm:py-4 border-b border-border">
              <button
                onClick={() => setShowMobileChat(false)}
                className="p-1.5 rounded-lg border border-border text-muted-foreground sm:hidden"
                title="Back to inbox"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <AvatarCircle
                initials={(activeMsg.candidate_name || "C")
                  .split(" ")
                  .map((n: string) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground text-sm truncate">{activeMsg.candidate_name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {activeMsg.from_email} · Job: {activeMsg.job_title}
                </p>
              </div>
              <a
                href={getGmailComposeUrl(activeMsg)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
              >
                <Mail className="h-4 w-4" /> Reply in Gmail <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {/* Message Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="p-4 rounded-xl border border-border bg-muted/30 space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <h4 className="font-bold text-foreground text-base">{activeMsg.subject}</h4>
                  <span className="text-xs text-muted-foreground">
                    {activeMsg.created_at ? new Date(activeMsg.created_at).toLocaleString() : ""}
                  </span>
                </div>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{activeMsg.body}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 hidden sm:flex items-center justify-center p-8 text-muted-foreground">
            Select a message from the left to view details
          </div>
        )}
      </div>
    </motion.div>
  );
}
