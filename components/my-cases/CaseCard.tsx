import { motion } from "framer-motion";
import { Calendar, User, ChevronRight, AlertTriangle, MapPin, Gavel } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CaseData, statusConfig, getCaseStatus } from "./CaseData";
import { parseCourtDate } from "@/lib/utils";

interface CaseCardProps {
  caseData: CaseData;
  view: "grid" | "list";
  index: number;
  onClick: () => void;
}

function getDaysUntil(date?: string): number | null {
  if (!date) return null;
  const d = parseCourtDate(date);
  if (!d) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

function formatDate(date?: string): string {
  if (!date) return "Not set";
  const d = parseCourtDate(date);
  if (!d) return date;
  return d.toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function CaseCard({ caseData, view, index, onClick }: CaseCardProps) {
  const daysUntil = getDaysUntil(caseData.courtDate);
  const caseStatus = getCaseStatus(caseData);
  const status = statusConfig[caseStatus] || statusConfig.active;

  if (view === "list") {
    return (
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.03 }}
        onClick={onClick}
        className="bg-card border-2 border-border rounded-lg px-4 py-3 hover:border-primary/30 hover:shadow-lg hover:scale-[1.005] transition-all cursor-pointer group flex flex-col sm:flex-row sm:items-center gap-3"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-sm text-foreground truncate group-hover:text-primary transition-colors">
              {caseData.caseTitle}
            </h3>
            <Badge variant="outline" className={`text-[10px] shrink-0 ${status.className}`}>
              {status.label}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span className="font-mono">{caseData.caseNo}</span>
            {caseData.courtName && (
              <>
                <span className="text-border">|</span>
                <span className="truncate">{caseData.courtName}</span>
              </>
            )}
            {caseData.advocate && (
              <>
                <span className="text-border">|</span>
                <span className="truncate">{caseData.advocate}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-5 text-xs shrink-0">
          {caseData.courtDate && (
            <div className="text-right">
              <p className="text-muted-foreground text-[10px]">Next Hearing</p>
              <p className={`font-medium ${daysUntil !== null && daysUntil <= 3 && daysUntil >= 0 ? "text-destructive" : "text-foreground"}`}>
                {daysUntil !== null && daysUntil <= 0 ? "Today" : daysUntil !== null ? `${daysUntil}d` : "—"}
              </p>
            </div>
          )}
          {caseData.caseStage && (
            <div className="text-right">
              <p className="text-muted-foreground text-[10px]">Stage</p>
              <p className="font-medium text-foreground truncate max-w-[100px]">{caseData.caseStage}</p>
            </div>
          )}
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={onClick}
      className="bg-card border-2 border-border rounded-xl overflow-hidden hover:border-primary/30 hover:shadow-lg hover:scale-[1.01] transition-all cursor-pointer group"
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
              {caseData.caseTitle}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">{caseData.caseNo}</p>
          </div>
          <Badge variant="outline" className={`text-[10px] shrink-0 ${status.className}`}>
            {status.label}
          </Badge>
        </div>

        {/* Court + Advocate */}
        <div className="flex flex-col gap-1 text-xs text-muted-foreground mb-3">
          {caseData.courtName && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{caseData.courtName}</span>
            </span>
          )}
          {caseData.advocate && (
            <span className="flex items-center gap-1.5">
              <Gavel className="h-3 w-3 shrink-0" />
              <span className="truncate">{caseData.advocate}</span>
            </span>
          )}
        </div>

        {/* Court Date */}
        {caseData.courtDate && (
          <div className={`rounded-lg p-3 mb-3 border-2 ${daysUntil !== null && daysUntil >= 0 && daysUntil <= 3 ? "bg-destructive/5 border-destructive/20" : "bg-violet-50/50 dark:bg-violet-500/10 border-violet-100 dark:border-violet-500/20"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className={`h-4 w-4 ${daysUntil !== null && daysUntil >= 0 && daysUntil <= 3 ? "text-destructive" : "text-violet-600 dark:text-violet-400"}`} />
                <div>
                  <p className="text-[10px] text-muted-foreground font-medium">Next Hearing</p>
                  <p className="text-sm font-bold text-foreground">{formatDate(caseData.courtDate)}</p>
                </div>
              </div>
              {daysUntil !== null && daysUntil <= 0 ? (
                <span className="flex items-center gap-1 text-xs text-destructive font-bold px-2.5 py-1 bg-red-100 dark:bg-red-500/20 rounded-full">
                  <AlertTriangle className="h-3 w-3" /> TODAY
                </span>
              ) : daysUntil !== null ? (
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${daysUntil <= 3 ? "bg-red-100 dark:bg-red-500/20 text-destructive" : daysUntil <= 7 ? "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400" : "bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-400"}`}>
                  {daysUntil}d left
                </span>
              ) : null}
            </div>
          </div>
        )}

        {/* Bottom: Stage + Status */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {caseData.caseStage && (
            <span className="truncate">Stage: {caseData.caseStage}</span>
          )}
          {caseData.status && (
            <span className="text-foreground/70 font-medium truncate">{caseData.status}</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
