"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { 
  Briefcase, 
  FileText, 
  BookmarkCheck, 
  MessageSquare, 
  Settings, 
  Building2, 
  PlusCircle, 
  ArrowRight
} from "lucide-react";

interface JobProviderSearchDropdownProps {
  query: string;
  isOpen: boolean;
  onClose: () => void;
  onSelectPanel?: (panel: string) => void;
}

const JOB_PROVIDER_PAGES = [
  { panel: "post-job", label: "Post a New Job", keywords: ["post job", "create job", "hiring", "opening"], desc: "Publish new job openings for local candidates", icon: PlusCircle },
  { panel: "my-jobs", label: "My Job Listings", keywords: ["my jobs", "listings", "active jobs", "vacancies"], desc: "Manage your active and paused job posts", icon: Briefcase },
  { panel: "applications", label: "Candidate Applications", keywords: ["applications", "resumes", "candidates", "applicants"], desc: "Review incoming resumes and job applications", icon: FileText },
  { panel: "shortlisted", label: "Shortlisted Candidates", keywords: ["shortlisted", "saved candidates", "favorites"], desc: "View bookmarked and top candidates", icon: BookmarkCheck },
  { panel: "messages", label: "Employer Messages", keywords: ["messages", "chat", "interviews", "candidates"], desc: "Direct messaging with job applicants", icon: MessageSquare },
  { panel: "business-profile", label: "Business Profile Settings", keywords: ["business profile", "company profile", "settings"], desc: "Update company logo, description & contact info", icon: Building2 },
  { panel: "settings", label: "Account Settings", keywords: ["settings", "preferences", "account"], desc: "Notification and account preferences", icon: Settings },
];

export function JobProviderSearchDropdown({ query, isOpen, onClose, onSelectPanel }: JobProviderSearchDropdownProps) {
  const router = useRouter();

  if (!isOpen || !query.trim()) return null;

  const queryTrimmed = query.trim().toLowerCase();

  const matchingPages = JOB_PROVIDER_PAGES.filter((p) =>
    p.label.toLowerCase().includes(queryTrimmed) ||
    p.keywords.some((k) => k.includes(queryTrimmed))
  );

  const handleItemClick = (panelKey: string) => {
    if (onSelectPanel) {
      onSelectPanel(panelKey);
    } else {
      router.push("/jobprovider");
    }
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.15 }}
        className="absolute left-0 right-0 top-full mt-2 rounded-2xl border border-border bg-card shadow-2xl p-3 z-50 max-h-[80vh] overflow-y-auto space-y-3"
      >
        <div className="space-y-1.5 pt-1">
          <span className="text-[10px] font-extrabold text-amber-600 uppercase tracking-wider px-2 block">
            Job Provider Tools & Shortcuts
          </span>
          {matchingPages.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.label}
                onClick={() => handleItemClick(p.panel)}
                className="p-2.5 rounded-xl border border-border/70 bg-card hover:bg-blue-500/10 hover:border-blue-500/30 flex items-center justify-between text-xs font-bold text-foreground cursor-pointer transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 text-blue-600 shrink-0" />
                  <div>
                    <div>{p.label}</div>
                    <div className="text-[10px] font-normal text-muted-foreground">{p.desc}</div>
                  </div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            );
          })}
        </div>

        {matchingPages.length === 0 && (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No job provider tools matched &quot;<span className="font-bold text-foreground">{query}</span>&quot;.
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
