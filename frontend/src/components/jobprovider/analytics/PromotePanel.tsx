"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Zap, Rocket, Share2, Megaphone, Loader2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { panelVariants } from "../mockData";
import { getAuthToken } from "@/lib/jwt";

export function PromotePanel() {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchJobs() {
      try {
        setLoading(true);
        const token = getAuthToken();
        const res = await fetch("/api/jobprovider/jobs?status=active", {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        const data = await res.json();
        if (res.ok) setJobs(data.jobs || []);
      } catch (err) {
        console.error("PromotePanel fetch jobs error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchJobs();
  }, []);

  const plans = [
    {
      icon: Zap,
      title: "Featured Listing",
      desc: "Highlighted with a 'Featured' badge. Shown at the top of category search results.",
      duration: "7 days",
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
      popular: false,
    },
    {
      icon: Rocket,
      title: "Top of Search",
      desc: "Your job appears at position #1 across all relevant searches in your city.",
      duration: "7 days",
      color: "text-primary",
      bg: "bg-primary/10",
      border: "border-primary/30",
      popular: true,
    },
    {
      icon: Share2,
      title: "Social Boost",
      desc: "We share your listing across our WhatsApp groups, Instagram & Facebook pages.",
      duration: "1 post",
      color: "text-violet-500",
      bg: "bg-violet-500/10",
      border: "border-violet-500/30",
      popular: false,
    },
  ];

  return (
    <motion.div {...panelVariants}>
      <div className="mb-6">
        <h3 className="font-semibold text-xl text-foreground">{t("jobprovider.promoteYourJobs")}</h3>
        <p className="text-sm text-muted-foreground mt-0.5">{t("jobprovider.reachMoreCandidates")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {plans.map((plan) => (
          <div
            key={plan.title}
            className={`relative rounded-2xl border p-6 flex flex-col ${
              plan.popular
                ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
                : "border-border bg-card"
            }`}
          >
            {plan.popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-primary text-primary-foreground">
                {t("jobprovider.mostPopular")}
              </span>
            )}
            <div className={`p-3 rounded-xl ${plan.bg} ${plan.color} w-fit mb-4`}>
              <plan.icon className="h-6 w-6" />
            </div>
            <h4 className="font-bold text-foreground mb-2">{plan.title}</h4>
            <p className="text-sm text-muted-foreground flex-1 mb-4">{plan.desc}</p>
            <div className="flex items-baseline gap-1 mb-4">
              <span className="text-sm font-bold text-primary">{plan.duration} promotion</span>
            </div>
            <button
              onClick={() => alert("Promotion plan activated!")}
              className={`w-full py-2.5 text-sm font-semibold rounded-xl transition-all ${
                plan.popular
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border border-border bg-card text-foreground hover:bg-muted"
              }`}
            >
              {t("jobprovider.activateBoost")}
            </button>
          </div>
        ))}
      </div>

      {/* Apply to specific job */}
      <div className="rounded-2xl border border-border bg-card shadow-sm p-6">
        <h4 className="font-semibold text-foreground mb-4">{t("jobprovider.applyPromotionToJob")}</h4>
        {loading ? (
          <div className="p-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading jobs…
          </div>
        ) : jobs.length === 0 ? (
          <p className="text-xs text-muted-foreground">No active jobs available to promote.</p>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between p-4 rounded-xl border border-border hover:bg-muted/30 transition-colors"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">{job.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {job.location} · {job.applicants_count || 0} {t("jobprovider.applicants")}
                  </p>
                </div>
                <button
                  onClick={() => alert(`Boost requested for ${job.title}`)}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-amber-500/30 bg-amber-500/5 text-amber-600 hover:bg-amber-500/10 transition-colors"
                >
                  <Megaphone className="h-3.5 w-3.5" /> {t("jobprovider.promote")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
