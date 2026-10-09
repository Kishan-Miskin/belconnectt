"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Search,
  Filter,
  FileText,
  MapPin,
  Briefcase,
  Clock,
  Mail,
  Phone,
  MessageSquare,
  BookmarkCheck,
  CheckCircle2,
  XCircle,
  Eye,
  X,
  ArrowLeft,
  Download,
  Calendar,
  Send,
  Loader2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { appStatusColors, panelVariants } from "../mockData";
import { AvatarCircle } from "../common/AvatarCircle";
import { getAuthToken } from "@/lib/jwt";

export function ApplicationsPanel() {
  const { t } = useTranslation();
  const router = useRouter();

  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<any | null>(null);

  // Dialog states
  const [showAssessmentModal, setShowAssessmentModal] = useState(false);
  const [assessmentUrl, setAssessmentUrl] = useState("");
  const [assessmentDueDate, setAssessmentDueDate] = useState("");
  const [assessmentInstructions, setAssessmentInstructions] = useState("");
  const [assessmentSending, setAssessmentSending] = useState(false);

  const [showInterviewModal, setShowInterviewModal] = useState(false);
  const [interviewDate, setInterviewDate] = useState("");
  const [interviewTime, setInterviewTime] = useState("");
  const [interviewMode, setInterviewMode] = useState("In-person");
  const [interviewLocation, setInterviewLocation] = useState("");
  const [interviewNotes, setInterviewNotes] = useState("");
  const [interviewScheduling, setInterviewScheduling] = useState(false);

  const fetchCandidates = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = getAuthToken();
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (searchQuery.trim()) params.set("q", searchQuery.trim());

      const res = await fetch(`/api/jobprovider/candidates?${params.toString()}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch candidates");

      setCandidates(data.candidates || []);
      if (selected) {
        const updatedSel = data.candidates?.find((c: any) => c.id === selected.id);
        if (updatedSel) setSelected(updatedSel);
      }
    } catch (err: any) {
      console.error("Fetch candidates error:", err);
      setError(err.message || "Failed to load candidate applications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCandidates();
  }, [statusFilter, searchQuery]);

  const updateStatus = async (appId: string, newStatus: string) => {
    try {
      const token = getAuthToken();
      const res = await fetch("/api/jobprovider/candidates", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ applicationId: appId, status: newStatus }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update status");

      setCandidates((prev) =>
        prev.map((c) => (c.id === appId ? { ...c, status: newStatus } : c))
      );
      if (selected?.id === appId) {
        setSelected((prev: any) => (prev ? { ...prev, status: newStatus } : null));
      }
    } catch (err: any) {
      alert(err.message || "Failed to update candidate status");
    }
  };

  const handleSendAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;

    try {
      setAssessmentSending(true);
      const token = getAuthToken();
      const res = await fetch(`/api/jobprovider/candidates/${selected.id}/assessment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          assessmentUrl,
          dueAt: assessmentDueDate || undefined,
          instructions: assessmentInstructions || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send assessment");

      alert("Assessment link sent to candidate!");
      setShowAssessmentModal(false);
      setAssessmentUrl("");
      setAssessmentDueDate("");
      setAssessmentInstructions("");
      fetchCandidates();
    } catch (err: any) {
      alert(err.message || "Failed to send assessment");
    } finally {
      setAssessmentSending(false);
    }
  };

  const handleScheduleInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;

    try {
      setInterviewScheduling(true);
      const token = getAuthToken();
      const res = await fetch("/api/jobprovider/interviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          applicationId: selected.id,
          interviewDate,
          interviewTime,
          interviewMode,
          locationDetails: interviewLocation || undefined,
          notes: interviewNotes || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to schedule interview");

      alert("Interview scheduled successfully!");
      setShowInterviewModal(false);
      setInterviewDate("");
      setInterviewTime("");
      setInterviewLocation("");
      setInterviewNotes("");
      fetchCandidates();
    } catch (err: any) {
      alert(err.message || "Failed to schedule interview");
    } finally {
      setInterviewScheduling(false);
    }
  };

  const filterOptions = [
    { label: t("jobprovider.all"), value: "all" },
    { label: t("jobprovider.new"), value: "new" },
    { label: t("jobprovider.shortlisted"), value: "shortlisted" },
    { label: "Assessment Sent", value: "assessment_sent" },
    { label: "Interview Scheduled", value: "interview_scheduled" },
    { label: "Hired", value: "hired" },
    { label: t("jobprovider.rejected"), value: "rejected" },
  ];

  return (
    <motion.div {...panelVariants}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h3 className="font-semibold text-xl text-foreground">{t("jobprovider.applicationsReceived")}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {candidates.length} {t("jobprovider.totalAppsAcrossJobs")}
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search candidates..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-xl bg-card text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap mb-5 overflow-x-auto pb-1 scrollbar-none">
        {filterOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-all shrink-0 ${
              statusFilter === opt.value
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading candidate applications…
        </div>
      ) : error ? (
        <div className="p-6 text-center text-red-500 rounded-2xl border border-red-500/20 bg-red-500/5">
          {error}
        </div>
      ) : (
        <div className={`grid gap-4 ${selected ? "grid-cols-1 lg:grid-cols-5" : "grid-cols-1"}`}>
          {/* Applicant list */}
          <div className={`space-y-3 ${selected ? "hidden lg:block lg:col-span-2" : "block"}`}>
            {candidates.map((app) => {
              const statusKey = app.status as keyof typeof appStatusColors;
              const statusStyle =
                appStatusColors[statusKey] || "bg-blue-500/10 text-blue-600 border-blue-500/20";
              const initials = (app.candidate_name || "C")
                .split(" ")
                .map((n: string) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();

              return (
                <div
                  key={app.id}
                  onClick={() => setSelected(app)}
                  className={`rounded-2xl border p-4 cursor-pointer transition-all hover:shadow-md ${
                    selected?.id === app.id ? "border-primary bg-primary/5" : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <AvatarCircle initials={initials} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className="text-sm font-bold text-foreground truncate">{app.candidate_name}</p>
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0 ${statusStyle}`}>
                          {app.status.replace("_", " ")}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{app.job_title}</p>
                      <div className="flex flex-wrap gap-2.5 sm:gap-3 mt-2 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {app.location || "Belagavi"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Briefcase className="h-3 w-3" />
                          {app.experience || "N/A"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {app.created_at ? new Date(app.created_at).toLocaleDateString() : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {candidates.length === 0 && (
              <div className="p-10 text-center border-2 border-dashed border-border rounded-2xl">
                <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No candidate applications found</p>
              </div>
            )}
          </div>

          {/* Candidate detail drawer */}
          {selected && (
            <AnimatePresence mode="wait">
              <motion.div
                key={selected.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="lg:col-span-3 rounded-2xl border border-border bg-card shadow-sm p-4 sm:p-6"
              >
                <div className="flex items-start justify-between mb-5 gap-3">
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <button
                      onClick={() => setSelected(null)}
                      className="p-1.5 rounded-lg border border-border text-muted-foreground lg:hidden shrink-0"
                      title="Back to list"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <AvatarCircle
                      initials={(selected.candidate_name || "C")
                        .split(" ")
                        .map((n: string) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                      size="lg"
                    />
                    <div className="min-w-0">
                      <h4 className="text-lg sm:text-xl font-bold text-foreground truncate">{selected.candidate_name}</h4>
                      <p className="text-xs sm:text-sm text-muted-foreground truncate">
                        {selected.experience ? `${selected.experience} experience` : "Candidate"}
                      </p>
                      <p className="text-xs text-primary font-medium mt-0.5 truncate">
                        Applied for: {selected.job_title}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-3 mb-5">
                  <div className="flex items-center gap-3 text-xs sm:text-sm text-foreground">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                    {selected.location || "Belagavi"}
                  </div>
                  <div className="flex items-center gap-3 text-xs sm:text-sm text-foreground">
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                    {selected.candidate_email}
                  </div>
                  {selected.candidate_phone && (
                    <div className="flex items-center gap-3 text-xs sm:text-sm text-foreground">
                      <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                      {selected.candidate_phone}
                    </div>
                  )}
                </div>

                {/* Resume Download & Cover Note */}
                <div className="p-4 rounded-xl bg-muted/50 text-xs sm:text-sm text-muted-foreground mb-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-foreground">Resume File</p>
                    <a
                      href={`/api/jobs/applications/${selected.id}/resume`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" /> Download Resume
                    </a>
                  </div>
                  {selected.cover_note && (
                    <div className="pt-2 border-t border-border">
                      <p className="font-medium text-foreground mb-1">Cover Note</p>
                      <p className="leading-relaxed whitespace-pre-line">{selected.cover_note}</p>
                    </div>
                  )}
                </div>

                {/* Status transitions */}
                <div className="mb-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    {t("jobprovider.updateStatus")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => updateStatus(selected.id, "shortlisted")}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                        selected.status === "shortlisted"
                          ? "bg-emerald-500/20 text-emerald-600 border-emerald-500/40"
                          : "border-border bg-card text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <BookmarkCheck className="inline h-3.5 w-3.5 mr-1" /> Shortlist
                    </button>
                    <button
                      onClick={() => updateStatus(selected.id, "hired")}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                        selected.status === "hired"
                          ? "bg-purple-500/20 text-purple-600 border-purple-500/40"
                          : "border-border bg-card text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <CheckCircle2 className="inline h-3.5 w-3.5 mr-1 text-purple-600" /> Hire Candidate
                    </button>
                    <button
                      onClick={() => updateStatus(selected.id, "rejected")}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                        selected.status === "rejected"
                          ? "bg-red-500/20 text-red-500 border-red-500/40"
                          : "border-border bg-card text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <XCircle className="inline h-3.5 w-3.5 mr-1" /> Reject
                    </button>
                  </div>
                </div>

                {/* Additional Employer Actions */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-border">
                  <button
                    onClick={() => setShowAssessmentModal(true)}
                    className="flex items-center justify-center gap-2 py-2.5 px-4 text-xs sm:text-sm font-semibold rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors"
                  >
                    <Send className="h-4 w-4" /> Send Assessment Link
                  </button>
                  <button
                    onClick={() => setShowInterviewModal(true)}
                    className="flex items-center justify-center gap-2 py-2.5 px-4 text-xs sm:text-sm font-semibold rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 transition-colors"
                  >
                    <Calendar className="h-4 w-4" /> Schedule Interview
                  </button>
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      )}

      {/* Assessment Modal */}
      {showAssessmentModal && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h4 className="font-semibold text-lg text-foreground">Send Assessment Link</h4>
              <button onClick={() => setShowAssessmentModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSendAssessment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Assessment URL (HTTPS only) *</label>
                <input
                  type="url"
                  required
                  pattern="https://.*"
                  value={assessmentUrl}
                  onChange={(e) => setAssessmentUrl(e.target.value)}
                  placeholder="https://forms.google.com/..."
                  className="w-full px-3 py-2 border border-border rounded-xl bg-muted/50 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Due Date & Time (Optional)</label>
                <input
                  type="datetime-local"
                  value={assessmentDueDate}
                  onChange={(e) => setAssessmentDueDate(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-xl bg-muted/50 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Instructions for Candidate (Optional)</label>
                <textarea
                  rows={3}
                  value={assessmentInstructions}
                  onChange={(e) => setAssessmentInstructions(e.target.value)}
                  placeholder="e.g. Please complete the test within 45 minutes without closing the browser..."
                  className="w-full px-3 py-2 border border-border rounded-xl bg-muted/50 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAssessmentModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-border text-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assessmentSending}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5"
                >
                  {assessmentSending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Assessment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Schedule Interview Modal */}
      {showInterviewModal && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h4 className="font-semibold text-lg text-foreground">Schedule Interview</h4>
              <button onClick={() => setShowInterviewModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleScheduleInterview} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={interviewDate}
                    onChange={(e) => setInterviewDate(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-xl bg-muted/50 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">Time *</label>
                  <input
                    type="time"
                    required
                    value={interviewTime}
                    onChange={(e) => setInterviewTime(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-xl bg-muted/50 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Interview Mode</label>
                <select
                  value={interviewMode}
                  onChange={(e) => setInterviewMode(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-xl bg-muted/50 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="In-person">In-person (Venue)</option>
                  <option value="Video">Video Call</option>
                  <option value="Phone">Phone Interview</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Venue Address / Location Details</label>
                <textarea
                  rows={2}
                  value={interviewLocation}
                  onChange={(e) => setInterviewLocation(e.target.value)}
                  placeholder="e.g. Office #402, CityCenter Plaza, College Road, Belagavi. Contact Person: Mr. Patil (+91 9876543210)"
                  className="w-full px-3 py-2 border border-border rounded-xl bg-muted/50 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Notes / Preparation Instructions (Optional)</label>
                <input
                  type="text"
                  value={interviewNotes}
                  onChange={(e) => setInterviewNotes(e.target.value)}
                  placeholder="e.g. Please bring original certificates and ID proof"
                  className="w-full px-3 py-2 border border-border rounded-xl bg-muted/50 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInterviewModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-border text-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={interviewScheduling}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5"
                >
                  {interviewScheduling ? <Loader2 className="h-4 w-4 animate-spin" /> : "Schedule Interview"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </motion.div>
  );
}
