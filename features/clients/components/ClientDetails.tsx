import { motion, AnimatePresence } from "framer-motion";
import {
  X, Phone, Mail, MapPin, Calendar, Scale, Building,
  StickyNote, Briefcase, Hash, Clock, AlertCircle
} from "lucide-react";
import { Client } from "./types";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { parseCourtDate } from "@/lib/utils";

interface ClientDetailProps {
  client: Client | null;
  onClose: () => void;
}

const ClientDetail = ({ client, onClose }: ClientDetailProps) => {
  const router = useRouter();

  const upcomingHearings = useMemo(() => {
    if (!client?.cases) return [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return client.cases
      .filter((c: any) => {
        const d = parseCourtDate(c.courtDate);
        return d !== null && d >= now;
      })
      .sort((a: any, b: any) => {
        const da = parseCourtDate(a.courtDate)!;
        const db = parseCourtDate(b.courtDate)!;
        return da.getTime() - db.getTime();
      })
      .slice(0, 3)
      .map((c: any) => {
        const d = parseCourtDate(c.courtDate)!;
        const daysUntil = Math.ceil((d.getTime() - now.getTime()) / 86400000);
        return { ...c, daysUntil };
      });
  }, [client]);

  if (!client) return null;

  const initials = (client.name || "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const caseCount = client.cases?.length || 0;
  const addedDate = client.createdAt
    ? new Date(client.createdAt).toLocaleDateString("en-IN", { month: "long", year: "numeric" })
    : "";

  const fullAddress = client.address
    ? [client.address.street, client.address.city, client.address.state, client.address.pincode]
        .filter(Boolean)
        .join(", ")
    : "";

  return (
    <AnimatePresence>
      {client && (
        <>
          {/* Mobile overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-background/80 z-40 lg:hidden"
          />
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3 }}
            className="fixed right-0 top-0 bottom-0 w-full sm:w-[420px] lg:relative lg:w-auto lg:min-w-[380px] lg:max-w-[420px] bg-card border-l border-border z-50 lg:z-auto overflow-y-auto"
          >
            {/* Header */}
            <div className="sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border p-4 z-10">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-primary/15 border-2 border-primary/40 flex items-center justify-center">
                    <span className="text-lg font-bold text-primary">{initials}</span>
                  </div>
                  <div>
                    <h2 className="font-semibold text-xl text-foreground">
                      {client.salutation ? `${client.salutation} ` : ""}{client.name}
                    </h2>
                    {client.company && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Building className="h-3 w-3" />
                        {client.company}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-md hover:bg-muted transition-colors"
                >
                  <X className="h-5 w-5 text-muted-foreground" />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-5">
              {/* Quick Actions */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { icon: Phone, label: "Call", color: "text-blue-500", href: `tel:${client.contact}` },
                  { icon: Mail, label: "Email", color: "text-purple-500", href: `mailto:${client.email}` },
                  { icon: Calendar, label: "Schedule", color: "text-brand-600", href: "#" },
                ].map((action) => (
                  <a
                    key={action.label}
                    href={action.href}
                    className="flex flex-col items-center gap-1 p-3 rounded-lg bg-secondary hover:bg-muted border border-border transition-all hover:border-primary/30"
                  >
                    <action.icon className={`h-4 w-4 ${action.color}`} />
                    <span className="text-[11px] font-medium text-foreground">{action.label}</span>
                  </a>
                ))}
              </div>

              {/* Contact Info */}
              <Section title="Contact Information">
                <InfoRow icon={Mail} label="Email" value={client.email} />
                <InfoRow icon={Phone} label="Phone" value={client.contact} />
                {client.alternateContact && (
                  <InfoRow icon={Phone} label="Alternate" value={client.alternateContact} />
                )}
                {fullAddress && <InfoRow icon={MapPin} label="Address" value={fullAddress} />}
              </Section>

              {/* Business Info */}
              {(client.company || client.gstin) && (
                <Section title="Business Details">
                  {client.company && <InfoRow icon={Building} label="Company" value={client.company} />}
                  {client.gstin && <InfoRow icon={Hash} label="GSTIN" value={client.gstin} />}
                </Section>
              )}

              {/* Cases */}
              <Section title="Cases">
                <div className="flex items-center justify-between p-3 bg-secondary rounded-lg border border-border">
                  <div className="flex items-center gap-2">
                    <Scale className="h-4 w-4 text-primary" />
                    <span className="text-sm text-foreground font-medium">
                      {caseCount} Case{caseCount !== 1 ? "s" : ""} Linked
                    </span>
                  </div>
                  {caseCount > 0 && (
                    <span className="text-xs text-primary font-medium">View All</span>
                  )}
                </div>
              </Section>

              {/* Upcoming Hearings */}
              {upcomingHearings.length > 0 && (
                <Section title="Upcoming Hearings">
                  <div className="space-y-2">
                    {upcomingHearings.map((c: any, i: number) => (
                      <div
                        key={c._id || i}
                        className={`flex items-start gap-2.5 p-2.5 rounded-lg cursor-pointer transition-all border ${
                          c.daysUntil <= 7
                            ? "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30"
                            : "bg-violet-50/50 dark:bg-violet-500/5 border-violet-100 dark:border-violet-500/20"
                        }`}
                        onClick={() => c._id && router.push(`/case-tracking/view/${c._id}`)}
                      >
                        <div className={`flex flex-col items-center justify-center rounded-md px-2 py-1 min-w-[40px] ${
                          c.daysUntil <= 7 ? "bg-red-100 dark:bg-red-500/20" : "bg-violet-100 dark:bg-violet-500/20"
                        }`}>
                          <span className={`text-[9px] font-medium ${c.daysUntil <= 7 ? "text-red-600" : "text-violet-600"}`}>
                            {(parseCourtDate(c.courtDate) || new Date()).toLocaleDateString('en-US', { month: 'short' })}
                          </span>
                          <span className={`text-sm font-bold ${c.daysUntil <= 7 ? "text-red-700" : "text-violet-700"}`}>
                            {(parseCourtDate(c.courtDate) || new Date()).getDate()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-xs text-foreground truncate">{c.caseTitle || c.caseNo}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{c.courtName || 'Court not specified'}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            {c.daysUntil <= 7 && <AlertCircle className="h-2.5 w-2.5 text-red-500" />}
                            <span className={`text-[10px] font-medium ${c.daysUntil <= 7 ? "text-red-600" : "text-muted-foreground"}`}>
                              {c.daysUntil === 0 ? "Today!" : c.daysUntil === 1 ? "Tomorrow" : `In ${c.daysUntil} days`}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Notes */}
              {client.notes && client.notes.length > 0 && (
                <Section title="Notes">
                  <div className="space-y-2">
                    {client.notes.map((noteId: string, i: number) => (
                      <div key={noteId} className="flex items-start gap-2 p-2 bg-secondary rounded-lg border border-border">
                        <StickyNote className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                        <span className="text-sm text-secondary-foreground">Note #{i + 1}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Custom Fields */}
              {client.customFields && client.customFields.length > 0 && (
                <Section title="Additional Details">
                  {client.customFields.map((field, i) => (
                    <InfoRow key={i} icon={Briefcase} label={field.name} value={field.value} />
                  ))}
                </Section>
              )}

              {/* Footer */}
              {addedDate && (
                <div className="pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground text-center">
                    Client since {addedDate}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{title}</h3>
    <div className="space-y-1.5">{children}</div>
  </div>
);

const InfoRow = ({ icon: Icon, label, value, highlight }: { icon: React.ElementType; label: string; value: string; highlight?: boolean }) => (
  <div className="flex items-center gap-2 py-1">
    <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
    <span className="text-xs text-muted-foreground w-20 shrink-0">{label}</span>
    <span className={`text-sm truncate ${highlight ? "text-warning font-medium" : "text-foreground"}`}>{value}</span>
  </div>
);

export default ClientDetail;
