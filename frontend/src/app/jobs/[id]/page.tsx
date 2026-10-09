"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Briefcase,
  MapPin,
  Clock,
  Building2,
  Calendar,
  Users,
  GraduationCap,
  ArrowLeft,
  CheckCircle2,
  Share2,
  Send,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  X,
  FileText,
  Mail,
  Upload,
  Loader2,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { getAuthToken } from "@/lib/jwt";

interface JobDetail {
  id: string;
  job_provider_id: string;
  title: string;
  category: string;
  job_type: string;
  work_mode: string;
  location: string;
  salary_type: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  salary_text: string | null;
  openings: number;
  experience_required: string | null;
  education_required: string | null;
  description: string;
  responsibilities: string | null;
  requirements: string | null;
  perks_benefits: string | null;
  deadline: string | null;
  status: string;
  views_count: number;
  is_boosted: boolean;
  created_at: string;
  company_name: string;
  company_industry: string | null;
  company_size: string | null;
  company_city: string | null;
  company_address: string | null;
  company_website: string | null;
  about_company: string | null;
  company_logo: string | null;
  applicants_count: number;
}

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params?.id as string;
  const { currentUser } = useAuthStore();

  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasApplied, setHasApplied] = useState(false);
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Apply form state
  const [applicantName, setApplicantName] = useState(currentUser?.name || "");
  const [applicantEmail, setApplicantEmail] = useState(currentUser?.email || "");
  const [applicantPhone, setApplicantPhone] = useState(currentUser?.phone || "");
  const [experience, setExperience] = useState("");
  const [applicantLocation, setApplicantLocation] = useState("Belagavi");
  const [coverNote, setCoverNote] = useState("");

  // Resume upload state
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [uploadedResumeData, setUploadedResumeData] = useState<{
    resumePath: string;
    filename: string;
    mime: string;
    size: number;
  } | null>(null);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Contact Employer Modal state
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactEmail, setContactEmail] = useState<string | null>(null);
  const [contactSubject, setContactSubject] = useState("");
  const [contactBody, setContactBody] = useState("");
  const [sendingContact, setSendingContact] = useState(false);
  const [contactSuccess, setContactSuccess] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    fetchJobDetail();
  }, [jobId]);

  useEffect(() => {
    if (currentUser) {
      if (!applicantName && currentUser.name) setApplicantName(currentUser.name);
      if (!applicantEmail && currentUser.email) setApplicantEmail(currentUser.email);
      if (!applicantPhone && currentUser.phone) setApplicantPhone(currentUser.phone);
    }
  }, [currentUser]);

  const fetchJobDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/jobs/${jobId}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) {
        if (res.status === 404) setError("Job listing not found or has been closed.");
        else setError("Failed to load job details.");
        return;
      }
      const data = await res.json();
      setJob(data.job);
      if (data.userContext?.hasApplied) {
        setHasApplied(true);
      }
      if (data.job?.contact_email) {
        setContactEmail(data.job.contact_email);
      }
    } catch (err: any) {
      console.error("Fetch job error:", err);
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setUploadError("File size exceeds maximum allowed limit of 5 MB");
      return;
    }

    const validExtensions = ["pdf", "doc", "docx"];
    const fileExt = file.name.split(".").pop()?.toLowerCase();
    if (!fileExt || !validExtensions.includes(fileExt)) {
      setUploadError("Invalid file extension. Please select a PDF, DOC, or DOCX document.");
      return;
    }

    setResumeFile(file);
    setUploadError(null);
    setUploadingResume(true);

    try {
      const token = getAuthToken();
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/jobs/resume-upload", {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to upload resume");
      }

      setUploadedResumeData({
        resumePath: data.resumePath,
        filename: data.filename || file.name,
        mime: data.mime || file.type,
        size: data.size || file.size,
      });
    } catch (err: any) {
      console.error("Resume upload error:", err);
      setUploadError(err.message || "Failed to upload resume");
      setResumeFile(null);
    } finally {
      setUploadingResume(false);
    }
  };

  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      router.push(`/login?redirect=/jobs/${jobId}`);
      return;
    }

    if (!uploadedResumeData) {
      setSubmitError("Please select and upload a valid PDF or DOCX resume document before submitting.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const token = getAuthToken();
      const res = await fetch(`/api/jobs/${jobId}/applications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          candidateName: applicantName,
          candidateEmail: applicantEmail,
          candidatePhone: applicantPhone,
          experience,
          location: applicantLocation,
          resumePath: uploadedResumeData.resumePath,
          resumeFilename: uploadedResumeData.filename,
          resumeMime: uploadedResumeData.mime,
          resumeSize: uploadedResumeData.size,
          coverNote,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || "Failed to submit application");
        return;
      }

      setSubmitSuccess(true);
      setHasApplied(true);
      setTimeout(() => {
        setApplyModalOpen(false);
        setSubmitSuccess(false);
      }, 2000);
    } catch (err: any) {
      console.error("Apply error:", err);
      setSubmitError("Failed to connect to application service");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendInAppContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendingContact(true);
    setContactError(null);

    try {
      const token = getAuthToken();
      const res = await fetch(`/api/jobs/${jobId}/contact`, {
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
      if (!res.ok) throw new Error(data.error || "Failed to send message to employer");

      setContactSuccess(true);
      setTimeout(() => {
        setContactModalOpen(false);
        setContactSuccess(false);
        setContactSubject("");
        setContactBody("");
      }, 2000);
    } catch (err: any) {
      console.error("Contact employer error:", err);
      setContactError(err.message || "Failed to send message");
    } finally {
      setSendingContact(false);
    }
  };

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatSalary = (j: JobDetail) => {
    if (j.salary_text) return j.salary_text;
    if (j.salary_min && j.salary_max) {
      return `₹${Number(j.salary_min).toLocaleString()} - ₹${Number(j.salary_max).toLocaleString()} / month`;
    }
    if (j.salary_min) return `₹${Number(j.salary_min).toLocaleString()} / month`;
    return j.salary_type || "Competitive";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-muted/10 py-16 flex justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-muted/10 py-16 px-4">
        <div className="max-w-md mx-auto text-center space-y-4 bg-white dark:bg-card p-8 rounded-2xl border border-border shadow-sm">
          <AlertCircle className="h-12 w-12 text-rose-500 mx-auto" />
          <h2 className="text-xl font-bold text-foreground">{error || "Job not found"}</h2>
          <p className="text-xs text-muted-foreground">The job post you are looking for may have expired or been removed.</p>
          <Link
            href="/jobs"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-xs shadow-sm hover:bg-blue-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Job Listings
          </Link>
        </div>
      </div>
    );
  }

  const encodedSubject = encodeURIComponent(`Inquiry regarding ${job.title}`);
  const encodedBody = encodeURIComponent(`Hi ${job.company_name},\n\nI have a query regarding the job opening for ${job.title}...\n\n`);
  const effectiveContactEmail = contactEmail || "contact@belconnect.com";

  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(effectiveContactEmail)}&su=${encodedSubject}&body=${encodedBody}`;
  const mailtoUrl = `mailto:${encodeURIComponent(effectiveContactEmail)}?subject=${encodedSubject}&body=${encodedBody}`;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-muted/10 text-foreground pb-20">
      {/* Top Navigation Bar */}
      <div className="border-b border-border bg-white dark:bg-card">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link
            href="/jobs"
            className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to all jobs
          </Link>

          <div className="flex items-center gap-2">
            {currentUser && (
              <button
                onClick={() => {
                  setContactSubject(`Inquiry regarding ${job.title}`);
                  setContactModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-xs font-semibold text-blue-600 hover:bg-blue-500/20 transition-colors"
              >
                <Mail className="h-3.5 w-3.5" /> Contact Employer
              </button>
            )}
            <button
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-xs font-semibold hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <Share2 className="h-3.5 w-3.5" />
              {copied ? "Link Copied!" : "Share Job"}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* Job Header Card */}
        <div className="rounded-3xl border border-border bg-white dark:bg-card p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
            <div className="flex items-start gap-5">
              <div className="w-16 h-16 rounded-2xl border border-border bg-slate-50 dark:bg-muted flex items-center justify-center font-bold text-2xl text-blue-600 shrink-0 overflow-hidden shadow-sm">
                {job.company_logo ? (
                  <img src={job.company_logo} alt={job.company_name} className="w-full h-full object-cover" />
                ) : (
                  job.company_name.charAt(0).toUpperCase()
                )}
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" /> {job.company_name}
                  </span>
                  <span className="text-muted-foreground/40">•</span>
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {job.location}
                  </span>
                </div>

                <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground">{job.title}</h1>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20">
                    {job.job_type}
                  </span>
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                    {job.work_mode}
                  </span>
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                    {job.category}
                  </span>
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                    {formatSalary(job)}
                  </span>
                </div>
              </div>
            </div>

            {/* Apply Action Button */}
            <div className="flex flex-col sm:items-end gap-2 shrink-0">
              {hasApplied ? (
                <div className="px-6 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 font-bold text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Application Submitted
                </div>
              ) : (
                <button
                  onClick={() => {
                    if (!currentUser) {
                      router.push(`/login?redirect=/jobs/${jobId}`);
                    } else {
                      setApplyModalOpen(true);
                    }
                  }}
                  className="px-8 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Send className="h-4 w-4" /> Apply for this Position
                </button>
              )}

              <p className="text-[11px] text-muted-foreground text-center sm:text-right">
                {job.applicants_count} candidates applied · {job.views_count} views
              </p>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 border-t border-border">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Briefcase className="h-3 w-3" /> Experience
              </span>
              <p className="text-xs sm:text-sm font-bold text-foreground">
                {job.experience_required || "Not specified"}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <GraduationCap className="h-3 w-3" /> Education
              </span>
              <p className="text-xs sm:text-sm font-bold text-foreground">
                {job.education_required || "Any background"}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3" /> Openings
              </span>
              <p className="text-xs sm:text-sm font-bold text-foreground">
                {job.openings} {job.openings === 1 ? "Opening" : "Openings"}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Apply By
              </span>
              <p className="text-xs sm:text-sm font-bold text-foreground">
                {job.deadline ? new Date(job.deadline).toLocaleDateString() : "Open until filled"}
              </p>
            </div>
          </div>
        </div>

        {/* Details & About Company Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-2xl border border-border bg-white dark:bg-card p-6 shadow-sm space-y-4">
              <h2 className="text-base sm:text-lg font-bold text-foreground">About the Role</h2>
              <div className="text-xs sm:text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {job.description}
              </div>
            </div>

            {job.responsibilities && (
              <div className="rounded-2xl border border-border bg-white dark:bg-card p-6 shadow-sm space-y-4">
                <h2 className="text-base sm:text-lg font-bold text-foreground">Key Responsibilities</h2>
                <div className="text-xs sm:text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                  {job.responsibilities}
                </div>
              </div>
            )}

            {job.requirements && (
              <div className="rounded-2xl border border-border bg-white dark:bg-card p-6 shadow-sm space-y-4">
                <h2 className="text-base sm:text-lg font-bold text-foreground">Requirements & Qualifications</h2>
                <div className="text-xs sm:text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                  {job.requirements}
                </div>
              </div>
            )}

            {job.perks_benefits && (
              <div className="rounded-2xl border border-border bg-white dark:bg-card p-6 shadow-sm space-y-4">
                <h2 className="text-base sm:text-lg font-bold text-foreground">Perks & Benefits</h2>
                <div className="text-xs sm:text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                  {job.perks_benefits}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-border bg-white dark:bg-card p-6 shadow-sm space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">{job.company_name}</h3>
                  <p className="text-xs text-muted-foreground">{job.company_city || "Belagavi, Karnataka"}</p>
                </div>
              </div>

              {job.about_company ? (
                <p className="text-xs text-muted-foreground leading-relaxed">{job.about_company}</p>
              ) : (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Offering local career opportunities across Belagavi and surrounding districts.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Application Modal */}
      <AnimatePresence>
        {applyModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-white dark:bg-card border border-border rounded-3xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto"
            >
              <button
                onClick={() => setApplyModalOpen(false)}
                className="absolute top-5 right-5 p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="space-y-1 mb-5">
                <h3 className="text-xl font-bold text-foreground">Apply for {job.title}</h3>
                <p className="text-xs text-muted-foreground">
                  at <span className="font-semibold text-foreground">{job.company_name}</span>
                </p>
              </div>

              {submitSuccess ? (
                <div className="py-12 text-center space-y-3">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                  <h4 className="text-lg font-bold text-foreground">Application Sent!</h4>
                  <p className="text-xs text-muted-foreground">
                    Your resume and application have been delivered to {job.company_name}.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleApplySubmit} className="space-y-4">
                  {submitError && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs font-medium">
                      {submitError}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1">Full Name *</label>
                    <input
                      type="text"
                      required
                      value={applicantName}
                      onChange={(e) => setApplicantName(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/40 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-foreground mb-1">Email *</label>
                      <input
                        type="email"
                        required
                        value={applicantEmail}
                        onChange={(e) => setApplicantEmail(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/40 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-foreground mb-1">Phone Number</label>
                      <input
                        type="tel"
                        value={applicantPhone}
                        onChange={(e) => setApplicantPhone(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/40 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-blue-600"
                        placeholder="+91 9876543210"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-foreground mb-1">Experience</label>
                      <input
                        type="text"
                        value={experience}
                        onChange={(e) => setExperience(e.target.value)}
                        placeholder="e.g. 3 years in wiring"
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/40 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-foreground mb-1">Current City / Area</label>
                      <input
                        type="text"
                        value={applicantLocation}
                        onChange={(e) => setApplicantLocation(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/40 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>

                  {/* Resume Upload Field */}
                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1">
                      Upload Resume (PDF/DOC/DOCX, max 5 MB) *
                    </label>
                    <div className="relative border-2 border-dashed border-border rounded-xl p-4 text-center bg-muted/30 hover:bg-muted/50 transition-colors">
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        onChange={handleFileChange}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      />
                      <div className="flex flex-col items-center justify-center space-y-1">
                        {uploadingResume ? (
                          <div className="flex items-center gap-2 text-xs text-blue-600 font-semibold">
                            <Loader2 className="h-4 w-4 animate-spin" /> Verifying & Uploading Resume…
                          </div>
                        ) : uploadedResumeData ? (
                          <div className="flex items-center gap-2 text-xs text-emerald-600 font-semibold">
                            <CheckCircle2 className="h-4 w-4" /> {uploadedResumeData.filename} (Uploaded)
                          </div>
                        ) : (
                          <>
                            <Upload className="h-6 w-6 text-muted-foreground" />
                            <span className="text-xs font-semibold text-foreground">Click to upload resume document</span>
                            <span className="text-[10px] text-muted-foreground">PDF, DOC, DOCX up to 5 MB</span>
                          </>
                        )}
                      </div>
                    </div>
                    {uploadError && (
                      <p className="text-[11px] text-rose-500 font-medium mt-1">{uploadError}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1">Cover Note / Brief Message</label>
                    <textarea
                      rows={3}
                      value={coverNote}
                      onChange={(e) => setCoverNote(e.target.value)}
                      placeholder="Explain why you are a great fit for this position..."
                      className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/40 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setApplyModalOpen(false)}
                      className="px-4 py-2.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting || uploadingResume || !uploadedResumeData}
                      className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {submitting ? "Submitting..." : "Submit Application"}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Contact Employer Modal */}
      <AnimatePresence>
        {contactModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white dark:bg-card border border-border rounded-3xl p-6 shadow-2xl relative space-y-4"
            >
              <button
                onClick={() => setContactModalOpen(false)}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="border-b border-border pb-3">
                <h3 className="font-bold text-lg text-foreground">Contact Employer</h3>
                <p className="text-xs text-muted-foreground">{job.company_name} · {job.title}</p>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Choose Contact Method</p>
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={gmailUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 p-3 rounded-xl border border-border hover:bg-muted text-xs font-bold text-foreground transition-colors"
                  >
                    <Mail className="h-4 w-4 text-red-500" /> Open in Gmail
                  </a>
                  <a
                    href={mailtoUrl}
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
                    {contactError && (
                      <p className="text-xs text-rose-500 font-medium">{contactError}</p>
                    )}
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
                      {sendingContact ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4" /> Send from BelConnect</>}
                    </button>
                  </form>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
