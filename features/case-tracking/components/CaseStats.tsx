import { motion } from "framer-motion";
import { Briefcase, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { CaseData, getCaseStatus } from "./CaseData";
import { parseCourtDate } from "@/lib/utils";

interface CaseStatsProps {
  cases: CaseData[];
}

export function CaseStats({ cases }: CaseStatsProps) {
  const activeCases = cases.filter((c) => getCaseStatus(c) === "active").length;
  const urgentCases = cases.filter((c) => getCaseStatus(c) === "urgent").length;
  const pendingCases = cases.filter((c) => getCaseStatus(c) === "pending").length;
  const upcomingHearings = cases.filter((c) => {
    if (!c.courtDate) return false;
    const d = parseCourtDate(c.courtDate);
    if (!d) return false;
    const diff = d.getTime() - Date.now();
    return diff >= 0 && diff < 7 * 86400000;
  }).length;

  const stats = [
    {
      icon: Briefcase,
      label: "Total Cases",
      value: cases.length,
      color: "text-primary",
    },
    {
      icon: CheckCircle2,
      label: "Active",
      value: activeCases,
      color: "text-brand-600 dark:text-brand-400",
    },
    {
      icon: AlertTriangle,
      label: "Urgent",
      value: urgentCases,
      color: urgentCases > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground",
    },
    {
      icon: Clock,
      label: "Hearings This Week",
      value: upcomingHearings,
      color: upcomingHearings > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 + i * 0.04 }}
          className="bg-card border border-border rounded-lg p-3.5"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </div>
          <p className="text-xl font-semibold text-foreground">{stat.value}</p>
        </motion.div>
      ))}
    </div>
  );
}
