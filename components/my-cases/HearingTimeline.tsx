import { motion } from "framer-motion";
import { Calendar, MapPin, ChevronRight, Gavel } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CaseData, statusConfig, getCaseStatus } from "./CaseData";
import { parseCourtDate } from "@/lib/utils";

interface HearingTimelineProps {
  cases: CaseData[];
  onSelect: (c: CaseData) => void;
}

function formatDate(date?: string) {
  if (!date) return "Not set";
  const d = parseCourtDate(date);
  if (!d) return date;
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getDaysUntil(date?: string) {
  if (!date) return null;
  const d = parseCourtDate(date);
  if (!d) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

export function HearingTimeline({ cases, onSelect }: HearingTimelineProps) {
  const sorted = [...cases]
    .filter((c) => c.courtDate)
    .sort(
      (a, b) => (parseCourtDate(a.courtDate!)?.getTime() || 0) - (parseCourtDate(b.courtDate!)?.getTime() || 0)
    );

  return (
    <div className="relative">
      <div className="absolute left-4 sm:left-6 top-0 bottom-0 w-0.5 bg-border" />

      <div className="space-y-4">
        {sorted.map((c, i) => {
          const days = getDaysUntil(c.courtDate);
          const isUrgent = days !== null && days >= 0 && days <= 3;
          const caseStatus = getCaseStatus(c);
          const status = statusConfig[caseStatus] || statusConfig.active;

          return (
            <motion.div
              key={c._id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
              onClick={() => onSelect(c)}
              className="relative pl-10 sm:pl-14 cursor-pointer group"
            >
              <div
                className={`absolute left-2.5 sm:left-4.5 top-4 w-3 h-3 rounded-full border-2 border-card z-10 ${
                  isUrgent ? "bg-destructive" : "bg-primary"
                }`}
              />

              <div className="bg-card border border-border rounded-xl p-4 shadow-sm hover:shadow-card-hover transition-all group-hover:border-primary/30">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${isUrgent ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}
                      >
                        {days !== null && days <= 0 ? "TODAY" : days !== null ? `In ${days} days` : "No date"}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] ${status.className}`}>
                        {status.label}
                      </Badge>
                    </div>
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                      {c.caseTitle}
                    </h3>
                    <p className="text-xs text-muted-foreground font-mono">{c.caseNo}</p>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatDate(c.courtDate)}
                    </div>
                    {c.courtName && (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        <span className="truncate max-w-[120px]">{c.courtName}</span>
                      </div>
                    )}
                    {c.advocate && (
                      <div className="flex items-center gap-1">
                        <Gavel className="h-3.5 w-3.5" />
                        <span className="truncate max-w-[120px]">{c.advocate}</span>
                      </div>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
