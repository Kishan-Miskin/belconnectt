"use client";

import { useState, useRef, useEffect } from "react";
import Footer from "@/components/sections/Footer";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  MapPin,
  Calendar,
  Star,
  Clock,
  LogOut,
  Plus,
  Trash2,
  Camera,
  Lock,
  CheckCircle2,
  AlertCircle,
  Building,
  Home as HomeIcon,
  Sparkles,
  ArrowRight,
  Radio,
  X,
  HelpCircle,
  Briefcase,
  Users,
  Mail
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore, BookingItem } from "@/store/useAuthStore";
import { useTranslation } from "@/lib/i18n";
import { LanguageSelector } from "@/components/common/LanguageSelector";
import CallButton from "@/components/calls/CallButton";
import ChatButton from "@/components/chat/ChatButton";
import TimeSlotPicker from "@/components/booking/TimeSlotPicker";
import LocationPicker, { ConfirmedLocationData } from "@/components/location/LocationPicker";
import { useOnboardingTour } from "@/components/onboarding/OnboardingContext";

function getBookingTimestamp(booking: { date: string; time?: string }) {
  try {
    let dateStr = booking.date;
    if (dateStr === "Today") {
      const d = new Date();
      dateStr = d.toISOString().split("T")[0];
    } else if (dateStr === "Tomorrow") {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      dateStr = d.toISOString().split("T")[0];
    } else if (dateStr === "Yesterday") {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      dateStr = d.toISOString().split("T")[0];
    }

    if (!dateStr.includes("-")) {
      const parsed = Date.parse(booking.date + " " + (booking.time || ""));
      if (!isNaN(parsed)) return parsed;
      return 0;
    }

    const timeStr = booking.time || "12:00 AM";
    const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
    let hours = 0;
    let minutes = 0;
    if (match) {
      hours = parseInt(match[1], 10);
      minutes = parseInt(match[2], 10);
      const ampm = match[3].toUpperCase();
      if (ampm === "PM" && hours < 12) hours += 12;
      if (ampm === "AM" && hours === 12) hours = 0;
    } else {
      const parts = timeStr.split(":");
      if (parts.length >= 2) {
        hours = parseInt(parts[0], 10);
        minutes = parseInt(parts[1], 10);
      }
    }

    const [year, month, day] = dateStr.split("-").map((x) => parseInt(x, 10));
    return new Date(year, month - 1, day, hours, minutes).getTime();
  } catch (e) {
    return 0;
  }
}

export default function AccountPage() {
  const router = useRouter();
  const { currentUser, updateProfile, addAddress, deleteAddress, logout, fetchUserBookings, fetchUserAddresses } = useAuthStore();
  const { replayTour } = useOnboardingTour();
  const [activeTab, setActiveTab] = useState<"bookings" | "addresses" | "profile" | "applications">("bookings");
  const { t } = useTranslation();

  const [isHydrated, setIsHydrated] = useState(() => {
    if (typeof window === "undefined") return false;
    return useAuthStore.persist.hasHydrated();
  });

  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() => setIsHydrated(true));
    return () => unsub();
  }, []);

  const currentUserId = currentUser?.id;

  useEffect(() => {
    if (!isHydrated) return;

        if (!currentUserId) {
      router.push("/auth?mode=login&returnTo=/account");
      return;
    }
    // Legacy session cleanup: if user holds an outdated pre-split ID, force relogin
    if (currentUserId.startsWith("user-")) {
      logout();
      router.push("/auth?mode=login&returnTo=/account");
      return;
    }
    fetchUserBookings().catch(() => {});
    fetchUserAddresses().catch(() => {});

    // Realtime updates handled via BroadcastChannel syncChannel (5s polling removed)
    let syncChannel: BroadcastChannel | null = null;
    try {
      syncChannel = new BroadcastChannel("cityconnect-bookings-sync");
      syncChannel.onmessage = (event) => {
        if (event.data?.type === "REFRESH_BOOKINGS") {
          fetchUserBookings().catch(() => {});
        }
      };
    } catch (e) {}

    return () => {
      if (syncChannel) {
        try { syncChannel.close(); } catch (e) {}
      }
    };
    }, [fetchUserBookings, fetchUserAddresses, currentUserId, router, logout, isHydrated]);

  // Profile Settings Form State
  const [name, setName] = useState(currentUser?.name || "");
  const [phone, setPhone] = useState(currentUser?.phone || "");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Address Modal State
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [addressType, setAddressType] = useState("Home");
  const [addressText, setAddressText] = useState("");

  // Reschedule Modal State
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleBookingId, setRescheduleBookingId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [isRescheduling, setIsRescheduling] = useState(false);

  // Rate & Review Modal State
  const [showRateModal, setShowRateModal] = useState(false);
  const [rateBookingId, setRateBookingId] = useState<string | null>(null);
  const [currentBookingIdToMarkReviewed, setCurrentBookingIdToMarkReviewed] = useState<string | null>(null);
  const [selectedRating, setSelectedRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Cancellation Modal State
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelBookingId, setCancelBookingId] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState("Schedule changed");
  const [cancellationNote, setCancellationNote] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  // Sync state if currentUser changes
  const activeUser = currentUser || {
    id: "guest",
    email: "guest@belconnect.com",
    name: "Guest User",
    phone: "+91 98765 43210",
    role: "user" as const,
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80",
    addresses: [],
    bookings: []
  };

  // Handle Save Profile
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile({ name, phone });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  // Handle Add Address Submit
  const handleAddAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addressText.trim()) return;
    addAddress({ type: addressType, text: addressText.trim() });
    setAddressText("");
    setShowAddressModal(false);
  };

  // Handle Cancel Booking Modal Open
  const handleCancelBooking = (bookingId: string) => {
    setCancelBookingId(bookingId);
    setCancellationReason("Schedule changed");
    setCancellationNote("");
    setShowCancelModal(true);
  };

  // Handle Cancel Booking Submit
  const handleCancelBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelBookingId) return;
    setIsCancelling(true);
    try {
      const token = currentUser?.token || (typeof window !== "undefined" ? localStorage.getItem("token") : null);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`/api/bookings/${encodeURIComponent(cancelBookingId)}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          status: "Cancelled",
          cancellationReason,
          cancellationNote
        })
      });
      if (res.ok) {
        fetchUserBookings();
        setShowCancelModal(false);
        setCancelBookingId(null);
      } else {
        const err = await res.json();
        alert(err.error || "Failed to cancel booking");
      }
    } catch (error) {
      console.error("Error cancelling booking:", error);
      alert("Network error. Could not cancel booking.");
    } finally {
      setIsCancelling(false);
    }
  };

  // Handle Reschedule Submit
  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleBookingId || !rescheduleDate || !rescheduleTime) return;
    setIsRescheduling(true);
    try {
      const res = await fetch(`/api/bookings/${rescheduleBookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: rescheduleDate, time: rescheduleTime })
      });
      if (res.ok) {
        fetchUserBookings();
        setShowRescheduleModal(false);
        setRescheduleBookingId(null);
        setRescheduleDate("");
        setRescheduleTime("");
      } else {
        const err = await res.json();
        alert(err.error || "Failed to reschedule booking");
      }
    } catch (error) {
      console.error("Error rescheduling booking:", error);
      alert("Network error. Could not reschedule booking.");
    } finally {
      setIsRescheduling(false);
    }
  };

  // Handle Rebook - Creates new booking row in database for Provider Dashboard
  const handleRebook = async (booking: BookingItem | Record<string, unknown> | string) => {
    try {
      const todayStr = new Date().toISOString().split("T")[0];
      const bObj = typeof booking === "object" && booking ? (booking as Record<string, unknown>) : null;
      const serviceName = typeof booking === "string" ? booking : (bObj ? String(bObj.service || bObj.serviceName || "Service") : "Service");
      const providerId = bObj && bObj.providerId ? String(bObj.providerId) : "";
      const providerName = bObj && bObj.providerName ? String(bObj.providerName) : "Service Provider";
      const category = bObj && bObj.category ? String(bObj.category) : "General";
      const token = currentUser?.token;

      if (!token) {
        router.push("/auth?mode=login&returnTo=/account");
        return;
      }

      if (!providerId) {
        router.push(`/services?q=${encodeURIComponent(serviceName)}`);
        return;
      }

      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          providerId,
          providerName,
          serviceName,
          category,
          date: todayStr,
          time: "10:00 AM"
        })
      });

      if (res.ok) {
        try {
          const syncChannel = new BroadcastChannel("cityconnect-bookings-sync");
          syncChannel.postMessage({ type: "REFRESH_BOOKINGS" });
          syncChannel.close();
        } catch (e) {}

        alert(`Service "${serviceName}" has been rebooked successfully! It is now sent to the service provider dashboard.`);
        fetchUserBookings();
      } else {
        router.push(`/services?q=${encodeURIComponent(serviceName)}`);
      }
    } catch (err) {
      console.error("Error rebooking service:", err);
      const bObj = typeof booking === "object" && booking ? (booking as Record<string, unknown>) : null;
      const serviceName = typeof booking === "string" ? booking : (bObj ? String(bObj.service || bObj.serviceName || "") : "");
      router.push(`/services?q=${encodeURIComponent(serviceName)}`);
    }
  };

  const handleDeleteBooking = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this completed service record?")) {
      try {
        const res = await fetch(`/api/bookings/${id}`, { method: "DELETE" });
        if (res.ok) {
          fetchUserBookings();
          try {
            const syncChannel = new BroadcastChannel("cityconnect-bookings-sync");
            syncChannel.postMessage({ type: "REFRESH_BOOKINGS" });
            syncChannel.close();
          } catch (e) {}
        }
      } catch (err) {
        console.error("Error deleting booking:", err);
      }
    }
  };

  // Handle Rate Service Modal Open
  const handleRateService = (bookingId: string, initialRating: number = 5, initialComment: string = "", sourceBookingId: string = "") => {
    setRateBookingId(bookingId);
    setSelectedRating(initialRating);
    setReviewText(initialComment);
    setCurrentBookingIdToMarkReviewed(sourceBookingId);
    setShowRateModal(true);
  };

  // Handle Rate Service Submit
  const handleRateServiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rateBookingId) return;
    setIsSubmittingReview(true);
    try {
      const token = currentUser?.token || (typeof window !== "undefined" ? localStorage.getItem("token") : null);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      // Submit the review to the authoritative two-sided reviews endpoint
      const res = await fetch(`/api/bookings/${encodeURIComponent(rateBookingId)}/reviews`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          rating: selectedRating,
          comment: reviewText.trim()
        })
      });

      if (res.ok) {
        alert("Thank you! Your review has been saved.");
        fetchUserBookings();
        setShowRateModal(false);
        setRateBookingId(null);
        setCurrentBookingIdToMarkReviewed(null);
        setReviewText("");
      } else if (res.status === 409) {
        alert("You have already submitted a review for this booking.");
        fetchUserBookings();
        setShowRateModal(false);
        setRateBookingId(null);
        setCurrentBookingIdToMarkReviewed(null);
        setReviewText("");
      } else {
        const err = await res.json();
        alert(err.error || "Failed to submit review");
      }
    } catch (error) {
      console.error("Error rating service:", error);
      alert("Network error. Could not submit review.");
    } finally {
      setIsSubmittingReview(false);
    }
  };

  return (
    <main className="min-h-screen bg-muted/10 text-foreground flex flex-col">
      <div className="flex-1 pt-8 pb-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

          <div className="flex flex-col md:flex-row gap-8">
            {/* Sidebar Navigation */}
            <div className="w-full md:w-64 space-y-4 shrink-0">

              {/* Reduced Blue Profile Card */}
              <div className="p-5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl flex flex-col items-center text-center gap-3">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-white/20 text-white font-bold text-2xl flex items-center justify-center border-2 border-white/30 shadow-md shrink-0">
                    {activeUser.name ? activeUser.name.trim().charAt(0).toUpperCase() : "U"}
                  </div>
                </div>
                <div className="overflow-hidden w-full">
                  <h2 className="text-lg font-bold font-heading truncate">
                    {activeUser.name}
                  </h2>
                  <p className="text-blue-100 text-xs truncate mt-0.5">
                    {activeUser.email}
                  </p>
                  <p className="text-blue-100 text-xs truncate">
                    {activeUser.phone || t("account.noPhoneAdded")}
                  </p>
                  <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-bold uppercase tracking-wider">
                    {activeUser.role === "provider" ? t("account.serviceProvider") : activeUser.role === "job_provider" ? t("account.employer") : t("account.customer")}
                  </span>
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-3 shadow-sm flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("bookings")}
                  className={`w-full text-left px-4 py-3 rounded-xl flex items-center justify-between text-sm font-semibold transition-all cursor-pointer ${
                    activeTab === "bookings"
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Calendar className="h-4 w-4" />
                    {t("account.myBookings")}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                    activeTab === "bookings" ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    {activeUser.bookings?.length || 0}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("addresses")}
                  className={`w-full text-left px-4 py-3 rounded-xl flex items-center justify-between text-sm font-semibold transition-all cursor-pointer ${
                    activeTab === "addresses"
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <MapPin className="h-4 w-4" />
                    {t("account.savedAddresses")}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                    activeTab === "addresses" ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    {activeUser.addresses?.length || 0}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("profile")}
                  className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 text-sm font-semibold transition-all cursor-pointer ${
                    activeTab === "profile"
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  <User className="h-4 w-4" />
                  {t("account.profileSettings")}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("applications")}
                  className={`w-full text-left px-4 py-3 rounded-xl flex items-center justify-between text-sm font-semibold transition-all cursor-pointer ${
                    activeTab === "applications"
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Briefcase className="h-4 w-4" />
                    Applications & Jobs
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => replayTour("customer")}
                  className="w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 text-sm font-semibold text-primary hover:bg-primary/10 transition-all cursor-pointer mt-1"
                >
                  <HelpCircle className="h-4 w-4 text-primary" />
                  <span>Guide Tour</span>
                </button>

                <Link
                  href="/help"
                  className="w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-all cursor-pointer mt-1 min-h-[44px]"
                >
                  <HelpCircle className="h-4 w-4 text-blue-600" />
                  <span>Help & Support</span>
                </Link>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 min-w-0">
              {/* TAB 1: MY BOOKINGS */}
              {activeTab === "bookings" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-bold text-foreground">{t("account.myBookings")}</h2>
                      <p className="text-sm text-muted-foreground">{t("account.trackAndManage")}</p>
                    </div>
                  </div>

                  {!activeUser.bookings || activeUser.bookings.length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-3xl border border-border bg-card p-10 text-center space-y-4 shadow-sm"
                    >
                      <div className="w-16 h-16 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center mx-auto">
                        <Calendar className="w-8 h-8" />
                      </div>
                      <h3 className="text-xl font-bold text-foreground">{t("account.noBookingsYetTitle")}</h3>
                      <p className="text-sm text-muted-foreground max-w-md mx-auto">
                        {t("account.noBookingsYetDesc")}
                      </p>
                      <Link
                        href="/services"
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-blue-600 text-white text-sm font-bold shadow-lg shadow-blue-600/25 hover:bg-blue-700 transition-all"
                      >
                        <Sparkles className="w-4 h-4" />
                        {t("account.exploreAndBook")}
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </motion.div>
                  ) : (
                    <div className="space-y-4">
                      {[...activeUser.bookings]
                        .sort((a, b) => {
                          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                          if (timeA !== timeB) return timeB - timeA;
                          return b.id.localeCompare(a.id);
                        })
                        .map((booking) => (
                        <motion.div
                          key={booking.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="rounded-2xl border border-border bg-card p-4 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm"
                        >
                          <div>
                            <div className="flex items-center gap-3 mb-2">
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-bold ${
                                  booking.status === "Accepted" || booking.status === "OnTheWay" || booking.status === "Started"
                                    ? "bg-teal-500/10 text-teal-600 dark:text-teal-400"
                                    : booking.status === "Requested" || booking.status === "Upcoming"
                                    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                    : booking.status === "Completed"
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                    : "bg-rose-500/10 text-rose-600"
                                }`}
                              >
                                {t(`account.statuses.${booking.status}`) || booking.status}
                              </span>
                              <span className="text-xs font-mono font-bold text-muted-foreground">
                                ID: {booking.id}
                              </span>
                            </div>
                            <h3 className="text-lg font-bold text-foreground">{booking.service}</h3>
                             <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                              <User className="h-3.5 w-3.5 text-blue-600" />
                              {t("account.provider")}: <span className="font-semibold text-foreground mr-1">{booking.provider}</span>
                              {booking.providerId && (
                                <Link
                                  href={`/provider-profile/${booking.providerId}`}
                                  className="text-[10px] text-blue-600 hover:text-blue-700 font-bold hover:underline bg-blue-50 dark:bg-blue-950/30 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                                >
                                  {t("account.viewProfile")}
                                </Link>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 text-blue-600" />
                              {t("account.scheduled")}: <span className="font-semibold text-foreground">{booking.date}</span>
                            </p>
                          </div>

                          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 w-full md:w-auto mt-2 md:mt-0 justify-start md:justify-end">
                            {/* Communication Actions: Call & Chat */}
                            <div className="flex items-center gap-2 w-full sm:w-auto">
                              <CallButton
                                bookingId={booking.id}
                                bookingStatus={booking.status}
                                title={t("account.callProvider")}
                                className="h-11 w-11 min-h-[44px] min-w-[44px] shrink-0"
                              />
                              <ChatButton
                                customerId={activeUser.id}
                                providerId={booking.providerId || ""}
                                bookingId={booking.id}
                                peerName={booking.provider || "Service Provider"}
                                serviceName={booking.service}
                                bookingStatus={booking.status}
                                title={t("account.chatWithProvider")}
                                className="flex-1 sm:flex-initial h-11 min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                              />
                            </div>

                            {["Accepted", "OnTheWay", "Started"].includes(booking.status) && (
                              <Link
                                href={`/bookings/${booking.id}`}
                                className="w-full sm:w-auto h-11 min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                              >
                                <Radio className="w-3.5 h-3.5 animate-pulse text-white" />
                                <span>Track Live Order</span>
                              </Link>
                            )}

                            {["Upcoming", "Requested", "Accepted", "OnTheWay", "Started"].includes(booking.status) ? (
                              <div className="flex items-center gap-2 w-full sm:w-auto">
                                <button
                                  onClick={() => {
                                    setRescheduleBookingId(booking.id);
                                    setShowRescheduleModal(true);
                                  }}
                                  className="flex-1 sm:flex-initial h-11 min-h-[44px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white text-sm font-semibold transition-colors cursor-pointer inline-flex items-center justify-center shadow-sm"
                                >
                                  {t("account.reschedule")}
                                </button>
                                <button
                                  onClick={() => handleCancelBooking(booking.id)}
                                  className="flex-1 sm:flex-initial h-11 min-h-[44px] px-4 py-2 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm font-semibold hover:bg-rose-500 hover:text-white transition-colors cursor-pointer inline-flex items-center justify-center"
                                >
                                  {t("account.cancel")}
                                </button>
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                                <button
                                  onClick={() => handleRebook(booking.service)}
                                  className="flex-1 sm:flex-initial h-11 min-h-[44px] px-3 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white text-sm font-semibold transition-colors cursor-pointer inline-flex items-center justify-center shadow-sm whitespace-nowrap"
                                >
                                  {t("account.rebook")}
                                </button>
                                {(booking.status === "Completed" || booking.status === "ReviewSubmitted") && (
                                  (() => {
                                    // If this booking has already been reviewed, show read-only status.
                                    const hasReviewed =
                                      booking.status === "ReviewSubmitted" ||
                                      (booking.rating !== undefined &&
                                        booking.rating !== null &&
                                        Number(booking.rating) > 0);

                                    if (hasReviewed) {
                                      return (
                                        <span className="flex-1 sm:flex-initial h-11 min-h-[44px] px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-sm font-semibold flex items-center justify-center gap-1.5 shadow-sm whitespace-nowrap">
                                          <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500 shrink-0" />
                                          <span>
                                            {booking.rating ? `${booking.rating}/5 Rated` : "Reviewed"}
                                          </span>
                                        </span>
                                      );
                                    }

                                    // 2. If it is Completed, check if they previously reviewed the same service
                                    const previouslyReviewed = activeUser.bookings?.find(
                                      (b) => b.service === booking.service && (b.status === "ReviewSubmitted" || (b.rating !== undefined && b.rating !== null && Number(b.rating) > 0))
                                    );
                                    if (previouslyReviewed) {
                                      return (
                                        <button
                                          onClick={() => handleRateService(previouslyReviewed.id, previouslyReviewed.rating || 5, previouslyReviewed.reviewComment || "", booking.id)}
                                          className="flex-1 sm:flex-initial h-11 min-h-[44px] px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm whitespace-nowrap"
                                        >
                                          <Star className="h-3.5 w-3.5 shrink-0" /> <span>{t("account.editReview")}</span>
                                        </button>
                                      );
                                    }
                                    // 3. Otherwise, show "Rate Service"
                                    return (
                                      <button
                                        onClick={() => handleRateService(booking.id, 5, "", booking.id)}
                                        className="flex-1 sm:flex-initial h-11 min-h-[44px] px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm whitespace-nowrap"
                                      >
                                        <Star className="h-3.5 w-3.5 shrink-0" /> <span>{t("account.rateService")}</span>
                                      </button>
                                    );
                                  })()
                                )}
                                {(booking.status === "Completed" || booking.status === "ReviewSubmitted") && (
                                  <button
                                    onClick={() => handleDeleteBooking(booking.id)}
                                    className="flex-1 sm:flex-initial h-11 min-h-[44px] px-3 py-2 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-600 dark:text-rose-400 text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                                    title="Delete Completed Service Record"
                                    aria-label="Delete Completed Service Record"
                                  >
                                    <Trash2 className="h-3.5 w-3.5 shrink-0" />
                                    <span>Delete</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: SAVED ADDRESSES */}
              {activeTab === "addresses" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-bold text-foreground">{t("account.savedAddresses")}</h2>
                      <p className="text-sm text-muted-foreground">{t("account.manageLocations")}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAddressModal(true)}
                      className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs sm:text-sm font-bold hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-md cursor-pointer"
                    >
                      <Plus className="h-4 w-4" /> {t("account.addPinnedLocation")}
                    </button>
                  </div>

                  {/* Add Location Modal with LocationPicker */}
                  <AnimatePresence>
                    {showAddressModal && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
                      >
                        <div className="w-full max-w-2xl my-auto">
                          <LocationPicker
                            onConfirm={async (location: ConfirmedLocationData) => {
                              await addAddress({
                                type: location.type,
                                text: location.text,
                                latitude: location.latitude,
                                longitude: location.longitude,
                                placeId: location.placeId,
                                locationAccuracy: location.locationAccuracy,
                                houseNumber: location.houseNumber,
                                buildingName: location.buildingName,
                                floor: location.floor,
                                landmark: location.landmark,
                                locality: location.locality,
                                city: location.city,
                                state: location.state,
                                pincode: location.pincode,
                                deliveryInstructions: location.deliveryInstructions
                              });
                              setShowAddressModal(false);
                            }}
                            onCancel={() => setShowAddressModal(false)}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {!activeUser.addresses || activeUser.addresses.length === 0 ? (
                    <div className="rounded-3xl border border-border bg-card p-8 text-center space-y-3">
                      <MapPin className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                      <p className="text-sm font-semibold text-foreground">{t("account.noSavedAddressesTitle")}</p>
                      <p className="text-xs text-muted-foreground">{t("account.noSavedAddressesDesc")}</p>
                    </div>
                  ) : (
                    <div className="grid sm:grid-cols-2 gap-4">
                      {activeUser.addresses.map((addr) => {
                        const isPinned = typeof addr.latitude === "number" && typeof addr.longitude === "number";
                        return (
                          <div
                            key={addr.id}
                            className="rounded-2xl border border-border bg-card p-5 relative shadow-sm hover:border-blue-600/40 transition-all flex flex-col justify-between gap-3"
                          >
                            <div>
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 text-xs font-bold">
                                    {addr.type === "Home" ? <HomeIcon className="h-3.5 w-3.5" /> : <Building className="h-3.5 w-3.5" />}
                                    {addr.type}
                                  </span>
                                  {isPinned ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-[10px] font-bold">
                                      <CheckCircle2 className="h-3 w-3" /> {t("account.pinned")}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 text-[10px] font-bold">
                                      <AlertCircle className="h-3 w-3" /> {t("account.notPinned")}
                                    </span>
                                  )}
                                </div>

                                <button
                                  type="button"
                                  onClick={() => deleteAddress(addr.id)}
                                  className="text-muted-foreground hover:text-rose-600 p-1 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer"
                                  title="Delete address"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>

                              <p className="text-sm text-foreground font-semibold leading-relaxed">{addr.text}</p>

                              {addr.landmark && (
                                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 font-medium">
                                  {t("account.landmark")}: {addr.landmark}
                                </p>
                              )}

                              {isPinned && addr.latitude && addr.longitude && (
                                <p className="text-[10px] font-mono text-muted-foreground mt-2">
                                  GPS: {Number(addr.latitude).toFixed(6)}, {Number(addr.longitude).toFixed(6)}
                                </p>
                              )}
                            </div>

                            {!isPinned && (
                              <button
                                type="button"
                                onClick={() => setShowAddressModal(true)}
                                className="w-full mt-2 py-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1"
                              >
                                <MapPin className="w-3.5 h-3.5" /> {t("account.pinExactLocation")}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: PROFILE SETTINGS */}
              {activeTab === "profile" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-foreground">{t("account.profileSettings")}</h2>
                    <p className="text-sm text-muted-foreground">{t("account.updateDetails")}</p>
                  </div>

                  {saveSuccess && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-5 h-5 shrink-0" />
                      <span>{t("account.profileUpdated")}</span>
                    </motion.div>
                  )}

                  <div className="rounded-3xl border border-border bg-card p-6 md:p-8 space-y-6 max-w-2xl shadow-sm">
                    <form onSubmit={handleSaveProfile} className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                          {t("account.fullName")}
                        </label>
                        <input
                          type="text"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Your Full Name"
                          className="w-full px-4 py-3 border border-border rounded-xl bg-background focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm text-foreground outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                          {t("account.mobileNumber")}
                        </label>
                        <input
                          type="tel"
                          maxLength={10}
                          value={phone}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, "");
                            if (val.length <= 10) {
                              setPhone(val);
                            }
                          }}
                          placeholder="9876543210"
                          className="w-full px-4 py-3 border border-border rounded-xl bg-background focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm text-foreground outline-none"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            {t("account.emailAddress")}
                          </label>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-semibold">
                            <Lock className="w-3 h-3 text-amber-500" /> {t("account.cannotBeChanged")}
                          </span>
                        </div>
                        <input
                          type="email"
                          disabled
                          readOnly
                          value={activeUser.email}
                          className="w-full px-4 py-3 border border-border/80 rounded-xl bg-muted/60 text-muted-foreground font-mono text-xs cursor-not-allowed outline-none select-none"
                        />
                      </div>

                      <div className="pt-2">
                        <button
                          type="submit"
                          className="px-6 py-3 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 shadow-md shadow-blue-600/25 transition-all cursor-pointer"
                        >
                          {t("account.saveProfileChanges")}
                        </button>
                      </div>
                    </form>

                    {/* Global App Language Selection */}
                    <div className="pt-6 border-t border-border/60 space-y-3">
                      <div>
                        <h4 className="text-sm font-bold text-foreground">🌐 App Language Preference</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">Select your preferred language. Changes apply globally across all pages instantly.</p>
                      </div>
                      <LanguageSelector variant="full" />
                    </div>

                    {/* Clean Logout Section Inside Profile Settings */}
                    <div className="pt-6 border-t border-border/60">
                      <div className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <h4 className="text-sm font-bold text-rose-600 dark:text-rose-400">{t("account.accountSession")}</h4>
                          <p className="text-xs text-muted-foreground mt-0.5">{t("account.signOutDesc")}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            logout();
                            router.push("/");
                            router.refresh();
                          }}
                          className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
                        >
                          <LogOut className="w-4 h-4" />
                          {t("common.signOut")}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: JOB APPLICATIONS & ACTIONS */}
              {activeTab === "applications" && (
                <div className="space-y-6">
                  {activeUser.role === "job_provider" ? (
                    <>
                      <div>
                        <h2 className="text-2xl font-bold text-foreground">Employer Job Portal Actions</h2>
                        <p className="text-sm text-muted-foreground">Manage your published jobs, candidates, interviews, and business profile.</p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        <Link
                          href="/jobprovider/post-job"
                          className="p-5 rounded-2xl border border-border bg-card shadow-sm hover:shadow-md hover:border-blue-500/50 transition-all flex flex-col justify-between group"
                        >
                          <div className="space-y-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold">
                              <Plus className="h-5 w-5" />
                            </div>
                            <h3 className="font-bold text-base text-foreground group-hover:text-blue-600 transition-colors">
                              Post a New Job
                            </h3>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              Publish a new opening to local job seekers across Belagavi & North Karnataka.
                            </p>
                          </div>
                          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs font-semibold text-blue-600">
                            <span>Post Job Now</span>
                            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                          </div>
                        </Link>

                        <Link
                          href="/jobprovider/jobs"
                          className="p-5 rounded-2xl border border-border bg-card shadow-sm hover:shadow-md hover:border-blue-500/50 transition-all flex flex-col justify-between group"
                        >
                          <div className="space-y-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center font-bold">
                              <Briefcase className="h-5 w-5" />
                            </div>
                            <h3 className="font-bold text-base text-foreground group-hover:text-indigo-600 transition-colors">
                              Manage Job Listings
                            </h3>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              View, edit, or close active job postings and check total applicants.
                            </p>
                          </div>
                          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs font-semibold text-indigo-600">
                            <span>View Listings</span>
                            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                          </div>
                        </Link>

                        <Link
                          href="/jobprovider/candidates"
                          className="p-5 rounded-2xl border border-border bg-card shadow-sm hover:shadow-md hover:border-blue-500/50 transition-all flex flex-col justify-between group"
                        >
                          <div className="space-y-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
                              <Users className="h-5 w-5" />
                            </div>
                            <h3 className="font-bold text-base text-foreground group-hover:text-emerald-600 transition-colors">
                              Review Applicants
                            </h3>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              Download candidate resumes, shortlist, send assessment links, or schedule interviews.
                            </p>
                          </div>
                          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs font-semibold text-emerald-600">
                            <span>Review Candidates</span>
                            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                          </div>
                        </Link>

                        <Link
                          href="/jobprovider/messages"
                          className="p-5 rounded-2xl border border-border bg-card shadow-sm hover:shadow-md hover:border-blue-500/50 transition-all flex flex-col justify-between group"
                        >
                          <div className="space-y-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
                              <Mail className="h-5 w-5" />
                            </div>
                            <h3 className="font-bold text-base text-foreground group-hover:text-amber-600 transition-colors">
                              Employer Messages Inbox
                            </h3>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              Read candidate inquiries sent to your job contact email and reply directly.
                            </p>
                          </div>
                          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs font-semibold text-amber-600">
                            <span>Open Inbox</span>
                            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                          </div>
                        </Link>

                        <Link
                          href="/jobprovider/interviews"
                          className="p-5 rounded-2xl border border-border bg-card shadow-sm hover:shadow-md hover:border-blue-500/50 transition-all flex flex-col justify-between group"
                        >
                          <div className="space-y-3">
                            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center font-bold">
                              <Calendar className="h-5 w-5" />
                            </div>
                            <h3 className="font-bold text-base text-foreground group-hover:text-purple-600 transition-colors">
                              Scheduled Interviews
                            </h3>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              Track upcoming in-person and video interviews scheduled with candidates.
                            </p>
                          </div>
                          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs font-semibold text-purple-600">
                            <span>View Schedule</span>
                            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                          </div>
                        </Link>

                        <Link
                          href="/jobprovider/business-profile"
                          className="p-5 rounded-2xl border border-border bg-card shadow-sm hover:shadow-md hover:border-blue-500/50 transition-all flex flex-col justify-between group"
                        >
                          <div className="space-y-3">
                            <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-600 flex items-center justify-center font-bold">
                              <Building className="h-5 w-5" />
                            </div>
                            <h3 className="font-bold text-base text-foreground group-hover:text-sky-600 transition-colors">
                              Business Profile
                            </h3>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              Update your company name, logo, location, website, and company description.
                            </p>
                          </div>
                          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs font-semibold text-sky-600">
                            <span>Edit Profile</span>
                            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                          </div>
                        </Link>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <h2 className="text-2xl font-bold text-foreground">My Job Applications & Actions</h2>
                        <p className="text-sm text-muted-foreground">Track your applied positions, assessment links, and interview schedules.</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-6 rounded-3xl border border-border bg-card shadow-sm space-y-4 flex flex-col justify-between">
                          <div className="space-y-3">
                            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold">
                              <Briefcase className="h-6 w-6" />
                            </div>
                            <h3 className="text-lg font-bold text-foreground">My Job Applications Portal</h3>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              View your application timeline status (Shortlisted, Assessment Sent, Interview Scheduled) and open direct employer mail options.
                            </p>
                          </div>

                          <Link
                            href="/jobs/applications"
                            className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2"
                          >
                            <Briefcase className="h-4 w-4" /> Open Applications Portal <ArrowRight className="h-4 w-4" />
                          </Link>
                        </div>

                        <div className="p-6 rounded-3xl border border-border bg-card shadow-sm space-y-4 flex flex-col justify-between">
                          <div className="space-y-3">
                            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
                              <Sparkles className="h-6 w-6" />
                            </div>
                            <h3 className="text-lg font-bold text-foreground">Explore Open Opportunities</h3>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              Search verified job listings from local employers in Belagavi and surrounding districts. Filter by work mode, category, and salary.
                            </p>
                          </div>

                          <Link
                            href="/jobs"
                            className="w-full py-3 px-4 rounded-xl border border-border bg-muted/50 hover:bg-muted text-foreground font-bold text-xs transition-all flex items-center justify-center gap-2"
                          >
                            <ArrowRight className="h-4 w-4 text-emerald-600" /> Browse All Job Openings
                          </Link>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Reschedule Modal Overlay */}
      <AnimatePresence>
        {showRescheduleModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-card border border-border rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-5 text-foreground"
            >
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <h3 className="font-heading text-lg font-bold text-foreground">{t("account.rescheduleBooking")}</h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowRescheduleModal(false);
                    setRescheduleBookingId(null);
                  }}
                  className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                  title="Close reschedule modal"
                >
                  <Trash2 className="w-4 h-4 rotate-45" />
                </button>
              </div>

              <form onSubmit={handleRescheduleSubmit} className="space-y-5">
                <TimeSlotPicker
                  selectedDate={rescheduleDate}
                  onDateChange={(d) => setRescheduleDate(d)}
                  selectedTime={rescheduleTime}
                  onTimeChange={(t) => setRescheduleTime(t)}
                />

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRescheduleModal(false);
                      setRescheduleBookingId(null);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted cursor-pointer"
                  >
                    {t("account.cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={isRescheduling || !rescheduleDate || !rescheduleTime}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all cursor-pointer shadow-md disabled:opacity-50"
                  >
                    {isRescheduling ? t("account.rescheduling") : t("account.confirmReschedule")}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rate & Review Modal */}
      <AnimatePresence>
        {showRateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-card w-full max-w-md rounded-2xl border border-border p-6 shadow-2xl relative overflow-hidden text-xs"
            >
              <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
                <h3 className="font-heading text-sm font-bold text-foreground">
                  {t("account.rateYourExperience")}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowRateModal(false);
                    setRateBookingId(null);
                  }}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleRateServiceSubmit} className="space-y-5">
                {/* Star Picker */}
                <div className="space-y-1.5 text-center">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {t("account.rating")}
                  </label>
                  <div className="flex items-center justify-center gap-2 py-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setSelectedRating(star)}
                        className="p-1 hover:scale-110 transition-transform cursor-pointer"
                      >
                        <Star
                          className={`h-7 w-7 ${
                            star <= selectedRating
                              ? "fill-[#D4A017] text-[#D4A017]"
                              : "text-muted-foreground/30"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Review Textarea */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {t("account.yourReview")}
                  </label>
                  <textarea
                    rows={4}
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder={t("account.writeReviewPlaceholder")}
                    className="w-full px-4 py-3 border border-border rounded-xl bg-background text-xs text-foreground focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRateModal(false);
                      setRateBookingId(null);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted cursor-pointer"
                  >
                    {t("account.cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingReview}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all cursor-pointer shadow-md disabled:opacity-50"
                  >
                    {isSubmittingReview ? t("account.submitting") : t("account.submitReview")}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {/* Structured Cancellation Modal */}
        {showCancelModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-card w-full max-w-md rounded-2xl border border-border p-6 shadow-2xl relative overflow-hidden text-xs space-y-4"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="font-heading text-sm font-bold text-foreground">
                  Cancel Booking
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowCancelModal(false);
                    setCancelBookingId(null);
                  }}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleCancelBookingSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-foreground block">
                    Why are you cancelling?
                  </label>
                  {[
                    "Schedule changed",
                    "Provider unavailable",
                    "Customer unavailable",
                    "Booked by mistake",
                    "Unable to contact",
                    "Other"
                  ].map((reason) => (
                    <label
                      key={reason}
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                        cancellationReason === reason
                          ? "border-blue-600 bg-blue-500/10 font-bold text-foreground"
                          : "border-border bg-card text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <input
                        type="radio"
                        name="accountCancellationReason"
                        value={reason}
                        checked={cancellationReason === reason}
                        onChange={(e) => setCancellationReason(e.target.value)}
                        className="text-blue-600 focus:ring-blue-600"
                      />
                      <span>{reason}</span>
                    </label>
                  ))}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground block">
                    Tell us more (optional):
                  </label>
                  <textarea
                    rows={2}
                    value={cancellationNote}
                    onChange={(e) => setCancellationNote(e.target.value)}
                    placeholder="Provide additional details..."
                    className="w-full px-3 py-2 border border-border rounded-xl bg-background text-xs text-foreground focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCancelModal(false);
                      setCancelBookingId(null);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted cursor-pointer"
                  >
                    Keep Booking
                  </button>
                  <button
                    type="submit"
                    disabled={isCancelling}
                    className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all cursor-pointer shadow-md disabled:opacity-50"
                  >
                    {isCancelling ? "Cancelling..." : "Confirm Cancellation"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Footer />
    </main>
  );
}
