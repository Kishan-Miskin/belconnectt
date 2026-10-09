"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  Users,
  Plus,
  ChevronRight,
  Clock,
  Calendar,
  Building2,
  CheckCircle2,
  FileText,
  UserCheck,
  Award,
  Loader2,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { panelVariants } from "../mockData";
import { getAuthToken } from "@/lib/jwt";

export function OverviewPanel() {
  const router = useRouter();
  const { currentUser } = useAuthStore();
  const firstName = currentUser?.name ? currentUser.name.split(" ")[0] : "Employer";

  const [stats, setStats] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        setLoading(true);
        const token = getAuthToken();
        const res = await fetch("/api/jobprovider/stats", {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load dashboard metrics");

        setStats(data);
      } catch (err: any) {
        console.error("Overview stats error:", err);
        setError(err.message || "Failed to load stats");
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  const metrics = stats?.metrics || {
    activeJobs: 0,
    totalApplicants: 0,
    newApplicants: 0,
    interviewsScheduled: 0,
    candidatesHired: 0,
  };

  const employerMetrics = [
    {
      label: "ACTIVE JOB POSTS",
      value: String(metrics.activeJobs),
      sub: "Live on portal",
      icon: Briefcase,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-950/50",
    },
    {
      label: "TOTAL APPLICANTS",
      value: String(metrics.totalApplicants),
      sub: `${metrics.newApplicants} unreviewed`,
      icon: Users,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-950/50",
    },
    {
      label: "INTERVIEWS SCHEDULED",
      value: String(metrics.interviewsScheduled),
      sub: "Upcoming interviews",
      icon: Calendar,
      color: "text-violet-600 dark:text-violet-400",
      bg: "bg-violet-50 dark:bg-violet-950/50",
    },
    {
      label: "CANDIDATES HIRED",
      value: String(metrics.candidatesHired),
      sub: "Total positions filled",
      icon: Award,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-950/50",
    },
  ];

  const recentApplications = stats?.recentApplications || [];
  const activeJobListings = stats?.activeJobListings || [];
  const upcomingInterviews = stats?.upcomingInterviews || [];

  return (
    <motion.div {...panelVariants} className="space-y-6 sm:space-y-8">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
            Welcome back, {firstName}.
          </h1>
          <p className="text-xs sm:text-sm md:text-base text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Employer Dashboard · Manage job posts, review candidates, and conduct interviews.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/jobprovider/post-job")}
            className="px-5 py-2.5 sm:py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <Plus className="h-4 w-4 stroke-[3]" /> Post a New Job
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading employer statistics…
        </div>
      ) : error ? (
        <div className="p-6 text-center text-red-500 rounded-2xl border border-red-500/20 bg-red-500/5">
          {error}
        </div>
      ) : (
        <>
          {/* 4 KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {employerMetrics.map((m) => (
              <div
                key={m.label}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card p-4 sm:p-5 shadow-sm space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] sm:text-xs font-extrabold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
                    {m.label}
                  </span>
                  <div className={`p-2 rounded-xl ${m.bg} ${m.color}`}>
                    <m.icon className="h-4 w-4" />
                  </div>
                </div>

                <div>
                  <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                    {m.value}
                  </p>
                  <p className="text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    {m.sub}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Action Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => router.push("/jobprovider/post-job")}
              className="p-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-between group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-white/20 text-white">
                  <Plus className="h-5 w-5 stroke-[3]" />
                </div>
                <div className="text-left">
                  <span className="block text-xs font-medium text-blue-100 uppercase tracking-wider">Step 1</span>
                  <span className="block text-sm font-bold">Post a New Job</span>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              onClick={() => router.push("/jobprovider/candidates")}
              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card text-slate-900 dark:text-white font-bold text-sm hover:border-violet-500/50 hover:bg-violet-50/30 dark:hover:bg-violet-950/20 transition-all flex items-center justify-between group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
                  <Calendar className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <span className="block text-xs font-medium text-slate-400 uppercase tracking-wider">Step 2</span>
                  <span className="block text-sm font-bold">Interview Candidates</span>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-400 group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              onClick={() => router.push("/jobprovider/candidates")}
              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card text-slate-900 dark:text-white font-bold text-sm hover:border-emerald-500/50 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20 transition-all flex items-center justify-between group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <span className="block text-xs font-medium text-slate-400 uppercase tracking-wider">Step 3</span>
                  <span className="block text-sm font-bold">Hire Top Talent</span>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-400 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          {/* Main Dashboard Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
            {/* Left Column */}
            <div className="lg:col-span-7 space-y-6">
              {/* Recent Applications Card */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />
                    <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                      Recent Candidate Applications
                    </h3>
                  </div>
                  <button
                    onClick={() => router.push("/jobprovider/candidates")}
                    className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    View All <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recentApplications.map((app: any) => (
                    <div
                      key={app.id}
                      onClick={() => router.push("/jobprovider/candidates")}
                      className="flex items-center gap-3.5 px-4 sm:px-5 py-3.5 sm:py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                    >
                      <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-base flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                        {app.candidate_name ? app.candidate_name.trim().charAt(0).toUpperCase() : "A"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                            {app.candidate_name}
                          </h4>
                          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border shrink-0 bg-blue-500/10 text-blue-600 border-blue-500/20">
                            {app.status}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                            {app.job_title}
                          </span>
                          <span className="text-slate-300 dark:text-slate-600 hidden sm:inline">•</span>
                          <span className="hidden sm:inline">{app.experience || "N/A"}</span>
                        </div>
                      </div>
                    </div>
                  ))}

                  {recentApplications.length === 0 && (
                    <div className="p-8 text-center text-xs text-muted-foreground">
                      No candidate applications yet
                    </div>
                  )}
                </div>
              </div>

              {/* Active Job Listings Overview */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />
                    <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                      Active Job Listings Overview
                    </h3>
                  </div>
                  <button
                    onClick={() => router.push("/jobprovider/jobs")}
                    className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    Manage Jobs <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="space-y-3">
                  {activeJobListings.map((job: any) => (
                    <div
                      key={job.id}
                      onClick={() => router.push("/jobprovider/jobs")}
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-500/40 bg-slate-50/40 dark:bg-slate-900/30 transition-all cursor-pointer space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                            {job.title}
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                            {job.location} • {job.salary_text || "Competitive"}
                          </p>
                        </div>
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border shrink-0 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                          {job.status}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-2.5 border-t border-slate-200/60 dark:border-slate-800/60 text-xs">
                        <span className="font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5" /> {job.applicants_count || 0} Candidate Applications
                        </span>
                        <span className="text-[11px] font-semibold text-slate-400 hover:text-blue-600 transition-colors flex items-center gap-0.5">
                          Manage <ChevronRight className="h-3 w-3" />
                        </span>
                      </div>
                    </div>
                  ))}

                  {activeJobListings.length === 0 && (
                    <div className="p-8 text-center text-xs text-muted-foreground">
                      No active jobs currently posted
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="lg:col-span-5 space-y-6">
              {/* Upcoming Interviews */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />
                    <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                      Upcoming Candidate Interviews
                    </h3>
                  </div>
                </div>

                <div className="space-y-3">
                  {upcomingInterviews.map((item: any) => (
                    <div
                      key={item.id}
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                            {item.candidate_name}
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                            Interview for <span className="font-medium text-slate-700 dark:text-slate-300">{item.job_title}</span>
                          </p>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
                          {item.interview_mode}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                          {item.interview_date} at {item.interview_time}
                        </span>
                      </div>
                    </div>
                  ))}

                  {upcomingInterviews.length === 0 && (
                    <div className="p-8 text-center text-xs text-muted-foreground">
                      No upcoming interviews scheduled
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}
