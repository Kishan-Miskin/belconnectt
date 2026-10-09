"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  PlusCircle,
  MapPin,
  Clock,
  DollarSign,
  AlertCircle,
  Eye,
  Pause,
  Play,
  Megaphone,
  Trash2,
  Loader2,
  Briefcase,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { statusColors, panelVariants } from "../mockData";
import { getAuthToken } from "@/lib/jwt";

export function MyJobsPanel() {
  const { t } = useTranslation();
  const router = useRouter();

  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = getAuthToken();
      const res = await fetch("/api/jobprovider/jobs", {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load jobs");
      }

      setJobs(data.jobs || []);
    } catch (err: any) {
      console.error("Fetch employer jobs error:", err);
      setError(err.message || "Failed to load employer jobs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const toggleStatus = async (jobId: string, currentStatus: string) => {
    const nextStatus = currentStatus === "active" ? "closed" : "active";
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update job status");
      }

      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, status: nextStatus } : j))
      );
    } catch (err: any) {
      console.error("Toggle status error:", err);
      alert(err.message || "Failed to update status");
    }
  };

  const deleteJob = async (jobId: string) => {
    if (!confirm("Are you sure you want to delete this job listing?")) return;
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete job");
      }

      setJobs((prev) => prev.filter((j) => j.id !== jobId));
    } catch (err: any) {
      console.error("Delete job error:", err);
      alert(err.message || "Failed to delete job");
    }
  };

  return (
    <motion.div {...panelVariants} className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-xl text-foreground">{t("jobprovider.myJobListings")}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">{t("jobprovider.managePostedJobs")}</p>
        </div>
        <button
          onClick={() => router.push("/jobprovider/post-job")}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <PlusCircle className="h-4 w-4" /> {t("jobprovider.postNewJob")}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading job listings…
        </div>
      ) : error ? (
        <div className="p-6 text-center text-red-500 rounded-2xl border border-red-500/20 bg-red-500/5">
          {error}
        </div>
      ) : jobs.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-border bg-card">
          <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-40" />
          <h4 className="text-lg font-semibold text-foreground">No jobs posted yet</h4>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Click &quot;Post New Job&quot; above to create your first job listing and start receiving candidates.
          </p>
        </div>
      ) : (
        jobs.map((job) => {
          const statusKey = (job.status || "active") as keyof typeof statusColors;
          const statusStyle = statusColors[statusKey] || "bg-zinc-500/10 text-zinc-500 border-zinc-500/20";

          return (
            <div
              key={job.id}
              className="rounded-2xl border border-border bg-card p-5 shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${statusStyle}`}>
                      ● {job.status}
                    </span>
                    <span className="text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">
                      {job.job_type || job.type || "Full-time"}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">{job.id}</span>
                  </div>
                  <h4 className="text-lg font-bold text-foreground mb-1">{job.title}</h4>
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {job.location}
                    </span>
                    <span className="flex items-center gap-1">
                      <DollarSign className="h-3.5 w-3.5" />
                      {job.salary_text || job.salary || "Competitive"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      Posted {job.created_at ? new Date(job.created_at).toLocaleDateString() : "recently"}
                    </span>
                    {job.deadline && (
                      <span className="flex items-center gap-1">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Deadline: {new Date(job.deadline).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col sm:items-end gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-foreground">
                      {job.applicants_count ?? job.applicants ?? 0}
                    </span>
                    <span className="text-xs text-muted-foreground">{t("jobprovider.applicants")}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => router.push(`/jobprovider/candidates?job_id=${job.id}`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5" /> {t("jobprovider.viewApps")}
                    </button>
                    <button
                      onClick={() => toggleStatus(job.id, job.status)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors"
                    >
                      {job.status === "active" ? (
                        <>
                          <Pause className="h-3.5 w-3.5" /> Close Job
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5" /> Re-open Job
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => router.push("/jobprovider/post-job")}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-500/30 bg-amber-500/5 text-amber-600 hover:bg-amber-500/10 transition-colors"
                    >
                      <Megaphone className="h-3.5 w-3.5" /> Boost Job
                    </button>
                    <button
                      onClick={() => deleteJob(job.id)}
                      className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}
    </motion.div>
  );
}
