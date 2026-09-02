import { motion } from "framer-motion";
import {
  Phone, Mail, Building, Scale,
  ChevronRight, Calendar
} from "lucide-react";
import { Client } from "./types";

interface ClientCardProps {
  client: Client;
  index: number;
  isSelected: boolean;
  onClick: () => void;
}

const ClientCard = ({ client, index, isSelected, onClick }: ClientCardProps) => {
  const initials = (client.name || "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const caseCount = client.cases?.length || 0;
  const addedDate = client.createdAt
    ? new Date(client.createdAt).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })
    : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      onClick={onClick}
      className={`group relative bg-card rounded-xl border cursor-pointer transition-all duration-300 ${
        isSelected
          ? "border-primary shadow-md ring-1 ring-primary/30"
          : "border-border hover:border-primary/40 hover:shadow-md"
      }`}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div className="shrink-0 w-11 h-11 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
            <span className="text-sm font-semibold text-primary">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base text-foreground truncate group-hover:text-primary transition-colors">
              {client.salutation ? `${client.salutation} ` : ""}{client.name}
            </h3>
            {client.company && (
              <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                <Building className="h-3 w-3" />
                {client.company}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${
              caseCount > 0
                ? "bg-brand-500/10 text-brand-600 border-brand-200"
                : "bg-muted text-muted-foreground border-border"
            }`}>
              {caseCount} case{caseCount !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Contact info */}
        <div className="grid grid-cols-1 gap-1.5 text-xs mb-3">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Mail className="h-3 w-3 shrink-0" />
            <span className="truncate">{client.email}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Phone className="h-3 w-3 shrink-0" />
            <span>{client.contact}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {addedDate && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Added {addedDate}
              </span>
            )}
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
      </div>
    </motion.div>
  );
};

export default ClientCard;
