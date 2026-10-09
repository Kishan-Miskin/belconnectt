"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Briefcase,
  MapPin,
  Clock,
  Building2,
  Calendar,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Mail,
  Loader2,
  ArrowLeft,
  FileText,
  Send,
  X,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { getAuthToken } from "@/lib/jwt";

interface TimelineEvent {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  created_at: string;
}

interface Interview {
  id: string;
  interview_date: string;
  interview_time: string;
  interview_mode: string;
  meeting_link: string | null;
  location_details: string | null;
  status: string;
  notes: string | null;
}

interface CandidateApplication {
  id: string;
  job_id: string;
  candidate_name: string;
  candidate_email: string;
  status: string;
  status_updated_at: string | null;
  created_at: string;
  job_title: string;
  job_category: string;
  job_type: string;
  work_mode: string;
  job_location: string;
  contact_email: string | null;
  company_name: string;
  company_logo: string | null;
  assessment_url: string | null;
  assessment_instructions: string | null;
  assessment_due_at: string | null;
  events: TimelineEvent[];
  interview: Interview | null;
}

export default function MyApplicationsPage() {
  const router = useRouter();
  const { currentUser } = useAuthStore();

  const [applications, setApplications] = useState<CandidateApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Contact Modal
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState<CandidateApplication | null>(null);
  const [contactSubject, setContactSubject] = useState("");
  const [contactBody, setContactBody] = useState("");
  const [sendingContact, setSendingContact] = useState(false);
  const [contactSuccess, setContactSuccess] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  useEffect(() => {
    fetchApplications();
  }, []);

  const fetchApplications = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = getAuthToken();
      const res = await fetch("/api/jobs/applications", {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load applications");

      setApplications(data.applications || []);
    } catch (err: any) {
      console.error("Fetch candidate applications error:", err);
      setError(err.message || "Failed to load your job applications");
    } finally {
      setLoading(false);
    }
  };

  const openContactModal = (app: CandidateApplication) => {
    setSelectedApp(app);
    setContactSubject(`Inquiry regarding application for ${app.job_title}`);
    setContactBody("");
    setContactError(null);
    setContactSuccess(false);
    setContactModalOpen(true);
  };

  const handleSendInAppContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp) return;

    setSendingContact(true);
    setContactError(null);

    try {
      const token = getAuthToken();
      const res = await fetch(`/api/jobs/${selectedApp.job_id}/contact`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          subject: contactSubject,
          body: contactBody,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send message");

      setContactSuccess(true);
      setTimeout(() => {
        setContactModalOpen(false);
        setContactSuccess(false);
      }, 1500);
    } catch (err: any) {
      setContactError(err.message || "Failed to send message");
    } finally {
      setSendingContact(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "new":
        return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      case "shortlisted":
        return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
      case "assessment_sent":
        return "bg-purple-500/10 text-purple-600 border-purple-500/20";
      case "interview_scheduled":
        return "bg-indigo-500/10 text-indigo-600 border-indigo-500/20";
      case "hired":
        return "bg-emerald-500/20 text-emerald-700 border-emerald-500/30";
      case "rejected":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-muted/10 text-foreground pb-20">
      {/* Header */}
      <div className="border-b border-border bg-white dark:bg-card">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-between">
          <div>
            <Link
              href="/jobs"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground mb-2"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Jobs
            </Link>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground">My Job Applications</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Track status timeline, assessment links, and scheduled interviews
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading your applications…
          </div>
        ) : error ? (
          <div className="p-6 text-center text-red-500 rounded-2xl border border-red-500/20 bg-red-500/5">
            {error}
          </div>
        ) : applications.length === 0 ? (
          <div className="p-16 text-center rounded-3xl border border-border bg-white dark:bg-card space-y-4">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto opacity-40" />
            <h3 className="text-lg font-bold text-foreground">No Applications Yet</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              You haven&apos;t submitted any job applications yet. Browse active openings and apply to start your career journey.
            </p>
            <Link
              href="/jobs"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 transition-colors shadow-sm"
            >
              Browse Open Jobs
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {applications.map((app) => {
              const statusText = app.status.replace("_", " ").toUpperCase();
              const badgeStyle = getStatusBadge(app.status);

              const effectiveEmail = app.contact_email || "contact@belconnect.com";
              const encodedSubject = encodeURIComponent(`Inquiry regarding application for ${app.job_title}`);
              const encodedBody = encodeURIComponent(`Hi ${app.company_name},\n\nI am writing to inquire about my application for ${app.job_title}...\n\n`);
              const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(effectiveEmail)}&su=${encodedSubject}&body=${encodedBody}`;
              const mailtoUrl = `mailto:${encodeURIComponent(effectiveEmail)}?subject=${encodedSubject}&body=${encodedBody}`;

              return (
                <div
                  key={app.id}
                  className="rounded-3xl border border-border bg-white dark:bg-card p-6 shadow-sm space-y-5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[10px] font-extrabold uppercase px-3 py-1 rounded-full border ${badgeStyle}`}>
                          ● {statusText}
                        </span>
                        <span className="text-xs text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full">
                          {app.job_type}
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {app.job_location}
                        </span>
                      </div>

                      <h3 className="text-xl font-bold text-foreground">{app.job_title}</h3>
                      <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
                        <Building2 className="h-4 w-4" /> {app.company_name}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                      <button
                        onClick={() => openContactModal(app)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border bg-card text-foreground hover:bg-muted font-bold text-xs transition-colors"
                      >
                        <Mail className="h-3.5 w-3.5" /> Contact Employer
                      </button>
                    </div>
                  </div>

                  {/* Status Timeline */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-muted/30 border border-border space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Application Status Timeline</p>
                    <div className="flex items-center gap-3 overflow-x-auto pb-1 text-xs">
                      {["new", "shortlisted", "assessment_sent", "interview_scheduled", "hired"].map((step, idx) => {
                        const isReached =
                          app.status === step ||
                          (app.status === "shortlisted" && step === "new") ||
                          (app.status === "assessment_sent" && ["new", "shortlisted"].includes(step)) ||
                          (app.status === "interview_scheduled" && ["new", "shortlisted", "assessment_sent"].includes(step)) ||
                          (app.status === "hired");

                        return (
                          <div key={step} className="flex items-center gap-2 shrink-0">
                            <div
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                isReached
                                  ? "bg-blue-600 text-white"
                                  : "bg-muted text-muted-foreground border border-border"
                              }`}
                            >
                              {idx + 1}
                            </div>
                            <span className={`capitalize font-semibold ${isReached ? "text-foreground" : "text-muted-foreground"}`}>
                              {step.replace("_", " ")}
                            </span>
                            {idx < 4 && <div className="w-6 h-0.5 bg-border" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Assessment Link Card */}
                  {app.assessment_url && (
                    <div className="p-4 rounded-2xl border border-purple-500/30 bg-purple-500/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold uppercase tracking-wider text-purple-700 dark:text-purple-400">
                          Assessment Link Received
                        </span>
                        {app.assessment_due_at && (
                          <span className="text-xs font-semibold text-purple-600">
                            Due: {new Date(app.assessment_due_at).toLocaleString()}
                          </span>
                        )}
                      </div>
                      {app.assessment_instructions && (
                        <p className="text-xs text-foreground/90">{app.assessment_instructions}</p>
                      )}
                      <div className="pt-1">
                        <a
                          href={app.assessment_url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-sm transition-all"
                        >
                          Start Assessment <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Scheduled Interview Card */}
                  {app.interview && (
                    <div className="p-4 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                          Scheduled Interview Details
                        </span>
                        <span className="text-xs font-bold text-indigo-600">
                          {app.interview.interview_mode}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-foreground font-medium">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-4 w-4 text-indigo-600" />
                          <span>Date: {app.interview.interview_date} at {app.interview.interview_time}</span>
                        </div>
                        {app.interview.location_details && (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-4 w-4 text-indigo-600" />
                            <span>Venue: {app.interview.location_details}</span>
                          </div>
                        )}
                      </div>
                      {app.interview.meeting_link && (
                        <div className="pt-2">
                          <a
                            href={app.interview.meeting_link.startsWith("http") ? app.interview.meeting_link : `https://${app.interview.meeting_link}`}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition-colors"
                          >
                            Join Interview Link <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      )}
                      {app.interview.notes && (
                        <p className="text-xs text-muted-foreground pt-1">
                          <strong>Note:</strong> {app.interview.notes}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Contact Employer Modal */}
      {contactModalOpen && selectedApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-card border border-border rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4 relative">
            <button
              onClick={() => setContactModalOpen(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground p-2"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="border-b border-border pb-3">
              <h3 className="font-bold text-lg text-foreground">Contact Employer</h3>
              <p className="text-xs text-muted-foreground">{selectedApp.company_name} · {selectedApp.job_title}</p>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Choose Method</p>
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(selectedApp.contact_email || 'contact@belconnect.com')}&su=${encodeURIComponent(`Inquiry: ${selectedApp.job_title}`)}&body=${encodeURIComponent(`Hi ${selectedApp.company_name},\n\n`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 p-3 rounded-xl border border-border hover:bg-muted text-xs font-bold text-foreground transition-colors"
                >
                  <Mail className="h-4 w-4 text-red-500" /> Open in Gmail
                </a>
                <a
                  href={`mailto:${encodeURIComponent(selectedApp.contact_email || 'contact@belconnect.com')}?subject=${encodeURIComponent(`Inquiry: ${selectedApp.job_title}`)}`}
                  className="flex items-center justify-center gap-2 p-3 rounded-xl border border-border hover:bg-muted text-xs font-bold text-foreground transition-colors"
                >
                  <Mail className="h-4 w-4 text-blue-500" /> Mail App
                </a>
              </div>

              <div className="relative my-3">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
                <div className="relative flex justify-center text-[10px] uppercase font-bold text-muted-foreground bg-white dark:bg-card px-2">
                  Or Send via BelConnect
                </div>
              </div>

              {contactSuccess ? (
                <div className="p-4 text-center text-xs font-bold text-emerald-600 bg-emerald-500/10 rounded-xl">
                  Message sent to employer!
                </div>
              ) : (
                <form onSubmit={handleSendInAppContact} className="space-y-3">
                  {contactError && <p className="text-xs text-rose-500">{contactError}</p>}
                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1">Subject</label>
                    <input
                      type="text"
                      required
                      maxLength={200}
                      value={contactSubject}
                      onChange={(e) => setContactSubject(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-muted/40 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1">Message Body</label>
                    <textarea
                      required
                      rows={4}
                      maxLength={5000}
                      value={contactBody}
                      onChange={(e) => setContactBody(e.target.value)}
                      placeholder="Write your message here..."
                      className="w-full px-3 py-2 rounded-xl border border-border bg-muted/40 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={sendingContact}
                    className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {sendingContact ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4" /> Send Message</>}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
