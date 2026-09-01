"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Scale, UserPlus, Loader2, Users, Clock, AlertCircle,
  FileUp, Search, SlidersHorizontal, ArrowUpDown, LayoutGrid, List,
  Phone, Mail, Building, ChevronRight, Calendar, MoreHorizontal,
  Eye, Pencil, Trash2, Receipt, ClipboardList, X, ExternalLink,
  FileText, TrendingUp
} from "lucide-react";
import { Client, FilterStatus, SortField } from "./types";
import { useRouter } from "next/navigation";
import { parseCourtDate } from "@/lib/utils";
import { AlertPopup } from "@/components/common/AlertPopup";
import Navbar from "@/components/layout/navbar";

const statusOptions: { value: FilterStatus; label: string }[] = [
  { value: "all", label: "All Clients" },
  { value: "with-cases", label: "With Cases" },
  { value: "no-cases", label: "No Cases" },
];

const sortOptions: { value: SortField; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "createdAt", label: "Recently Added" },
  { value: "cases", label: "Most Cases" },
];

const isAutoCreatedClient = (client: Client) => {
  return (client.email || "").endsWith("@autoclient.ravenslaw.local") || client.contact === "0000000000";
};

const ClientDashboard = () => {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [sortField, setSortField] = useState<SortField>("name");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showFilters, setShowFilters] = useState(false);

  // Upcoming hearings across all clients
  const upcomingHearings = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const hearings: { clientName: string; caseTitle: string; caseNo: string; courtDate: string; courtName?: string; caseId: string; daysUntil: number; parsedDate: Date }[] = [];
    clients.forEach((client) => {
      (client.cases || []).forEach((c: any) => {
        if (!c.courtDate) return;
        const d = parseCourtDate(c.courtDate);
        if (!d || d < now) return;
        const daysUntil = Math.ceil((d.getTime() - now.getTime()) / 86400000);
        hearings.push({
          clientName: client.name,
          caseTitle: c.caseTitle || c.caseNo,
          caseNo: c.caseNo,
          courtDate: c.courtDate,
          courtName: c.courtName,
          caseId: c._id,
          daysUntil,
          parsedDate: d,
        });
      });
    });
    return hearings.sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());
  }, [clients]);

  const fetchClients = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/userdetails/clients");
      const data = await res.json();
      setClients(data?.userClients?.clients || []);
    } catch {
      console.error("Failed to fetch clients");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const handleDeleteClient = async (clientId: string) => {
    try {
      const res = await fetch(`/api/userdetails/clients?id=${clientId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setClients(prev => prev.filter(c => c._id !== clientId));
      if (selectedClient?._id === clientId) setSelectedClient(null);
    } catch (error) {
      console.error(error);
    }
  };

  const handleExport = () => {
    const csv = [
      "Name,Email,Phone,Company,Cases,Added",
      ...filteredClients.map(c =>
        `"${c.name}","${c.email}","${c.contact}","${c.company || ''}","${c.cases?.length || 0}","${c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ''}"`
      )
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "clients.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const filteredClients = useMemo(() => {
    let result = [...clients];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          (c.name || "").toLowerCase().includes(q) ||
          (c.email || "").toLowerCase().includes(q) ||
          (c.company || "").toLowerCase().includes(q) ||
          (c.contact || "").toLowerCase().includes(q)
      );
    }
    if (filterStatus === "with-cases") result = result.filter((c) => c.cases && c.cases.length > 0);
    else if (filterStatus === "no-cases") result = result.filter((c) => !c.cases || c.cases.length === 0);

    result.sort((a, b) => {
      switch (sortField) {
        case "name": return (a.name || "").localeCompare(b.name || "");
        case "createdAt": return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        case "cases": return (b.cases?.length || 0) - (a.cases?.length || 0);
        default: return 0;
      }
    });
    return result;
  }, [searchQuery, filterStatus, sortField, clients]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading clients...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-4">
          <Navbar location="My Clients" />
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/15 rounded-lg border border-primary/30">
                <Scale className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="font-display text-xl sm:text-2xl font-bold text-foreground">
                  Client Management
                </h1>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  {clients.length} client{clients.length !== 1 ? "s" : ""} &middot; {upcomingHearings.length} upcoming hearing{upcomingHearings.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push("/case-tracking")}
                className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors"
              >
                <Scale className="h-3.5 w-3.5" /> My Cases
              </button>
              <button
                onClick={handleExport}
                className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-border bg-secondary text-secondary-foreground hover:bg-muted transition-colors"
              >
                <FileUp className="h-3.5 w-3.5" /> Export
              </button>
              <button
                onClick={() => router.push("/my-clients/add")}
                className="px-3 sm:px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-2"
              >
                <UserPlus className="h-4 w-4" />
                <span className="hidden sm:inline">Add Client</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 md:px-6 py-5 space-y-5">
        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Clients", value: clients.length, icon: Users, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-500/10" },
            { label: "With Cases", value: clients.filter((c) => c.cases?.length > 0).length, icon: Scale, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-500/10" },
            { label: "No Cases Yet", value: clients.filter((c) => !c.cases?.length).length, icon: AlertCircle, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-500/10" },
            { label: "Upcoming Hearings", value: upcomingHearings.length, icon: Clock, color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-500/10" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-card rounded-xl border border-border p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-2">
                <div className={`p-1.5 rounded-lg ${stat.bg}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </div>
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Upcoming Hearings Widget */}
        {upcomingHearings.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-card rounded-xl border border-violet-200 dark:border-violet-500/30 p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-violet-600" />
                <h3 className="text-sm font-semibold text-foreground">Upcoming Client Hearings</h3>
              </div>
              <span className="text-xs text-muted-foreground">{upcomingHearings.length} total</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {upcomingHearings.slice(0, 6).map((h, i) => (
                <div
                  key={`${h.caseId}-${i}`}
                  className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all border ${
                    h.daysUntil <= 7
                      ? "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 hover:border-red-300"
                      : "bg-violet-50/50 dark:bg-violet-500/5 border-violet-100 dark:border-violet-500/20 hover:border-violet-200"
                  }`}
                  onClick={() => router.push(`/case-tracking/view/${h.caseId}`)}
                >
                  <div className={`flex flex-col items-center justify-center rounded-lg px-2 py-1.5 min-w-[44px] ${
                    h.daysUntil <= 7 ? "bg-red-100 dark:bg-red-500/20" : "bg-violet-100 dark:bg-violet-500/20"
                  }`}>
                    <span className={`text-[10px] font-medium ${h.daysUntil <= 7 ? "text-red-600 dark:text-red-400" : "text-violet-600 dark:text-violet-400"}`}>
                      {h.parsedDate.toLocaleDateString('en-US', { month: 'short' })}
                    </span>
                    <span className={`text-sm font-bold ${h.daysUntil <= 7 ? "text-red-700 dark:text-red-400" : "text-violet-700 dark:text-violet-400"}`}>
                      {h.parsedDate.getDate()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-xs text-foreground truncate">{h.caseTitle}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{h.clientName}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {h.daysUntil <= 7 && <AlertCircle className="h-3 w-3 text-red-500" />}
                      <span className={`text-[10px] font-medium ${h.daysUntil <= 7 ? "text-red-600" : "text-muted-foreground"}`}>
                        {h.daysUntil === 0 ? "Today" : h.daysUntil === 1 ? "Tomorrow" : `${h.daysUntil} days`}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {upcomingHearings.length > 6 && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                +{upcomingHearings.length - 6} more hearings
              </p>
            )}
          </motion.div>
        )}

        {/* Search & Filters */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search clients by name, email, company, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                  showFilters
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-foreground border-border hover:border-primary/50"
                }`}
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span className="hidden sm:inline">Filters</span>
              </button>
              <div className="flex items-center border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-2.5 transition-colors ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-2.5 transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Filter controls */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center py-2">
                  <div className="flex flex-wrap gap-1.5">
                    {statusOptions.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setFilterStatus(opt.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          filterStatus === opt.value
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "bg-card text-muted-foreground hover:text-foreground border border-border"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <div className="hidden sm:block w-px h-6 bg-border" />
                  <div className="flex items-center gap-2">
                    <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                    <select
                      value={sortField}
                      onChange={(e) => setSortField(e.target.value as SortField)}
                      className="bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {sortOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {filteredClients.length} client{filteredClients.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Client list + Detail */}
        <div className="flex gap-5">
          <div className={`flex-1 min-w-0 ${selectedClient ? "hidden lg:block" : ""}`}>
            {filteredClients.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-16 bg-card rounded-xl border border-border"
              >
                <Users className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-lg font-semibold text-foreground">No clients found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {clients.length === 0
                    ? "No cases yet. Add a case in My Cases to auto-create a minimal client, or add one manually."
                    : "Try adjusting your search or filters"}
                </p>
                {clients.length === 0 && (
                  <div className="flex items-center justify-center gap-3 mt-4">
                    <button
                      onClick={() => router.push("/my-clients/add")}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold"
                    >
                      <UserPlus className="h-4 w-4 inline mr-2" />
                      Add Client
                    </button>
                    <button
                      onClick={() => router.push("/case-tracking")}
                      className="px-4 py-2 border border-border rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
                    >
                      <Scale className="h-4 w-4 inline mr-2" />
                      Go to My Cases
                    </button>
                  </div>
                )}
              </motion.div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-3">
                {filteredClients.map((client, i) => (
                  <ClientCardEnhanced
                    key={client._id}
                    client={client}
                    index={i}
                    isSelected={selectedClient?._id === client._id}
                    onClick={() => setSelectedClient(client)}
                    onView={() => router.push(`/my-clients/view/${client._id}`)}
                    onEdit={() => router.push(`/my-clients/edit/${client._id}`)}
                    onDelete={() => handleDeleteClient(client._id)}
                    onInvoice={() => router.push(`/invoices`)}
                    onTask={() => router.push(`/tasks`)}
                  />
                ))}
              </div>
            ) : (
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="grid grid-cols-[1fr_1fr_100px_80px_60px] gap-4 px-4 py-3 bg-muted/50 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <span>Client</span>
                  <span>Contact</span>
                  <span>Cases</span>
                  <span>Added</span>
                  <span></span>
                </div>
                {filteredClients.map((client, i) => (
                  <ClientListRow
                    key={client._id}
                    client={client}
                    index={i}
                    isSelected={selectedClient?._id === client._id}
                    onClick={() => setSelectedClient(client)}
                    onView={() => router.push(`/my-clients/view/${client._id}`)}
                    onEdit={() => router.push(`/my-clients/edit/${client._id}`)}
                    onDelete={() => handleDeleteClient(client._id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Detail Panel */}
          {selectedClient && (
            <ClientDetailPanel
              client={selectedClient}
              onClose={() => setSelectedClient(null)}
              onRefresh={fetchClients}
            />
          )}
        </div>
      </main>
    </div>
  );
};

/* ============ Enhanced Client Card ============ */
interface CardProps {
  client: Client;
  index: number;
  isSelected: boolean;
  onClick: () => void;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onInvoice: () => void;
  onTask: () => void;
}

const ClientCardEnhanced = ({ client, index, isSelected, onClick, onView, onEdit, onDelete }: CardProps) => {
  const initials = (client.name || "U").split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  const caseCount = client.cases?.length || 0;
  const noteCount = client.notes?.length || 0;
  const needsDetails = isAutoCreatedClient(client);
  const addedDate = client.createdAt
    ? new Date(client.createdAt).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })
    : "";
  const [showActions, setShowActions] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.3 }}
      onClick={onClick}
      className={`group relative bg-card rounded-xl border cursor-pointer transition-all duration-200 ${
        isSelected
          ? "border-primary shadow-lg ring-1 ring-primary/30"
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
              {client.salutation ? `${client.salutation.charAt(0).toUpperCase() + client.salutation.slice(1)}. ` : ""}{client.name}
            </h3>
            {client.company && (
              <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                <Building className="h-3 w-3" />
                {client.company}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <div className="flex items-center gap-1">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                caseCount > 0
                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-200 dark:border-emerald-500/30"
                  : "bg-muted text-muted-foreground border-border"
              }`}>
                {caseCount} case{caseCount !== 1 ? "s" : ""}
              </span>
              {needsDetails && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-amber-500/10 text-amber-700 border-amber-200 dark:border-amber-500/30">
                  Needs details
                </span>
              )}
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowActions(!showActions); }}
                  className="p-1 rounded hover:bg-muted transition-colors"
                >
                  <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                </button>
                {showActions && (
                  <div
                    className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg py-1 z-20 min-w-[140px]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button onClick={() => { onView(); setShowActions(false); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted transition-colors">
                      <Eye className="h-3.5 w-3.5" /> View Details
                    </button>
                    <button onClick={() => { onEdit(); setShowActions(false); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted transition-colors">
                      <Pencil className="h-3.5 w-3.5" /> {needsDetails ? "Add Client Details" : "Edit Client"}
                    </button>
                    <hr className="my-1 border-border" />
                    <AlertPopup type="delete" handleFunction={onDelete}>
                      <button className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </AlertPopup>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Contact info */}
        <div className="grid grid-cols-1 gap-1.5 text-xs mb-3">
          {client.email && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{client.email}</span>
            </div>
          )}
          {client.contact && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Phone className="h-3 w-3 shrink-0" />
              <span>{client.contact}</span>
            </div>
          )}
        </div>

        {/* Footer with quick stats */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            {addedDate && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {addedDate}
              </span>
            )}
            {noteCount > 0 && (
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {noteCount} note{noteCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
      </div>
    </motion.div>
  );
};

/* ============ Client List Row ============ */
interface ListRowProps {
  client: Client;
  index: number;
  isSelected: boolean;
  onClick: () => void;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const ClientListRow = ({ client, index, isSelected, onClick, onView, onEdit, onDelete }: ListRowProps) => {
  const initials = (client.name || "U").split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  const caseCount = client.cases?.length || 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.02 }}
      onClick={onClick}
      className={`grid grid-cols-[1fr_1fr_100px_80px_60px] gap-4 items-center px-4 py-3 cursor-pointer transition-all border-b border-border last:border-b-0 ${
        isSelected ? "bg-primary/5" : "hover:bg-muted/50"
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-xs font-semibold text-primary">{initials}</span>
        </div>
        <div className="min-w-0">
          <p className="font-medium text-sm text-foreground truncate">{client.name}</p>
          {client.company && <p className="text-xs text-muted-foreground truncate">{client.company}</p>}
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-sm text-foreground truncate">{client.email}</p>
        <p className="text-xs text-muted-foreground">{client.contact}</p>
      </div>
      <div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          caseCount > 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-muted text-muted-foreground"
        }`}>
          {caseCount} case{caseCount !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="text-xs text-muted-foreground">
        {client.createdAt ? new Date(client.createdAt).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "-"}
      </div>
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <button onClick={onView} className="p-1.5 rounded hover:bg-muted transition-colors" title="View">
          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <button onClick={onEdit} className="p-1.5 rounded hover:bg-muted transition-colors" title="Edit">
          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    </motion.div>
  );
};

/* ============ Client Detail Panel ============ */
interface DetailPanelProps {
  client: Client;
  onClose: () => void;
  onRefresh: () => void;
}

const ClientDetailPanel = ({ client, onClose, onRefresh }: DetailPanelProps) => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"overview" | "cases" | "invoices" | "tasks">("overview");
  const needsDetails = isAutoCreatedClient(client);

  const initials = (client.name || "U").split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  const caseCount = client.cases?.length || 0;
  const noteCount = client.notes?.length || 0;
  const addedDate = client.createdAt
    ? new Date(client.createdAt).toLocaleDateString("en-IN", { month: "long", year: "numeric" })
    : "";

  const fullAddress = client.address
    ? [client.address.building, client.address.street, client.address.city, client.address.state, client.address.pincode]
        .filter(Boolean).join(", ")
    : "";

  const upcomingHearings = useMemo(() => {
    if (!client?.cases) return [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return client.cases
      .filter((c: any) => { const d = parseCourtDate(c.courtDate); return d !== null && d >= now; })
      .sort((a: any, b: any) => {
        const da = parseCourtDate(a.courtDate)!;
        const db = parseCourtDate(b.courtDate)!;
        return da.getTime() - db.getTime();
      })
      .slice(0, 5)
      .map((c: any) => {
        const d = parseCourtDate(c.courtDate)!;
        return { ...c, daysUntil: Math.ceil((d.getTime() - now.getTime()) / 86400000) };
      });
  }, [client]);

  const tabs = [
    { key: "overview", label: "Overview", icon: Users },
    { key: "cases", label: `Cases (${caseCount})`, icon: Scale },
    { key: "invoices", label: "Invoices", icon: Receipt },
    { key: "tasks", label: "Tasks", icon: ClipboardList },
  ] as const;

  return (
    <AnimatePresence>
      {client && (
        <>
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
            className="fixed right-0 top-0 bottom-0 w-full sm:w-[440px] lg:relative lg:w-auto lg:min-w-[400px] lg:max-w-[440px] bg-card border-l border-border z-50 lg:z-auto overflow-y-auto"
          >
            {/* Header */}
            <div className="sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border p-4 z-10">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/15 border-2 border-primary/40 flex items-center justify-center">
                    <span className="text-lg font-bold text-primary">{initials}</span>
                  </div>
                  <div>
                    <h2 className="font-semibold text-lg text-foreground">
                      {client.salutation ? `${client.salutation.charAt(0).toUpperCase() + client.salutation.slice(1)}. ` : ""}{client.name}
                    </h2>
                    {client.company && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Building className="h-3 w-3" />
                        {client.company}
                      </p>
                    )}
                  </div>
                </div>
                <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted transition-colors">
                  <X className="h-5 w-5 text-muted-foreground" />
                </button>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { icon: Eye, label: "View", color: "text-blue-500", action: () => router.push(`/my-clients/view/${client._id}`) },
                  { icon: Pencil, label: "Edit", color: "text-amber-500", action: () => router.push(`/my-clients/edit/${client._id}`) },
                  { icon: Receipt, label: "Invoice", color: "text-emerald-500", action: () => router.push(`/invoices`) },
                  { icon: ClipboardList, label: "Task", color: "text-violet-500", action: () => router.push(`/tasks`) },
                ].map((action) => (
                  <button
                    key={action.label}
                    onClick={action.action}
                    className="flex flex-col items-center gap-1 p-2 rounded-lg bg-secondary hover:bg-muted border border-border transition-all hover:border-primary/30"
                  >
                    <action.icon className={`h-4 w-4 ${action.color}`} />
                    <span className="text-[10px] font-medium text-foreground">{action.label}</span>
                  </button>
                ))}
              </div>

              {needsDetails && (
                <div className="mt-3 p-2.5 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30">
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    Auto-created from a case. Add phone/email details to fully use notifications, invoices, and other client workflows.
                  </p>
                  <button
                    onClick={() => router.push(`/my-clients/edit/${client._id}`)}
                    className="mt-2 px-2.5 py-1 text-[11px] rounded-md bg-amber-600 text-white hover:bg-amber-700 transition-colors"
                  >
                    Add Details
                  </button>
                </div>
              )}

              {/* Tabs */}
              <div className="flex gap-1 mt-3 bg-muted/50 rounded-lg p-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                      activeTab === tab.key
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <tab.icon className="h-3 w-3" />
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Overview Tab */}
              {activeTab === "overview" && (
                <>
                  <Section title="Contact Information">
                    {client.email && <InfoRow icon={Mail} label="Email" value={client.email} />}
                    {client.contact && <InfoRow icon={Phone} label="Phone" value={client.contact} />}
                    {client.contactAlt && <InfoRow icon={Phone} label="Alt Phone" value={client.contactAlt} />}
                    {fullAddress && <InfoRow icon={ExternalLink} label="Address" value={fullAddress} />}
                  </Section>

                  {(client.company || client.gstin) && (
                    <Section title="Business Details">
                      {client.company && <InfoRow icon={Building} label="Company" value={client.company} />}
                      {client.gstin && <InfoRow icon={TrendingUp} label="GSTIN" value={client.gstin} />}
                      {client.group && <InfoRow icon={Users} label="Group" value={client.group} />}
                    </Section>
                  )}

                  {/* Quick Stats */}
                  <Section title="Quick Summary">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-lg text-center border border-blue-100 dark:border-blue-500/20">
                        <p className="text-lg font-bold text-blue-600">{caseCount}</p>
                        <p className="text-[10px] text-blue-600/80">Cases</p>
                      </div>
                      <div className="p-3 bg-amber-50 dark:bg-amber-500/10 rounded-lg text-center border border-amber-100 dark:border-amber-500/20">
                        <p className="text-lg font-bold text-amber-600">{noteCount}</p>
                        <p className="text-[10px] text-amber-600/80">Notes</p>
                      </div>
                      <div className="p-3 bg-violet-50 dark:bg-violet-500/10 rounded-lg text-center border border-violet-100 dark:border-violet-500/20">
                        <p className="text-lg font-bold text-violet-600">{upcomingHearings.length}</p>
                        <p className="text-[10px] text-violet-600/80">Hearings</p>
                      </div>
                    </div>
                  </Section>

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
                              <span className={`text-[10px] font-medium ${c.daysUntil <= 7 ? "text-red-600" : "text-muted-foreground"}`}>
                                {c.daysUntil === 0 ? "Today!" : c.daysUntil === 1 ? "Tomorrow" : `In ${c.daysUntil} days`}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

                  {client.customFields && client.customFields.length > 0 && client.customFields.some(f => f.name) && (
                    <Section title="Additional Details">
                      {client.customFields.filter(f => f.name).map((field, i) => (
                        <InfoRow key={i} icon={FileText} label={field.name} value={field.value} />
                      ))}
                    </Section>
                  )}

                  {addedDate && (
                    <div className="pt-3 border-t border-border">
                      <p className="text-xs text-muted-foreground text-center">Client since {addedDate}</p>
                    </div>
                  )}
                </>
              )}

              {/* Cases Tab */}
              {activeTab === "cases" && (
                <div className="space-y-2">
                  {caseCount > 0 ? (
                    client.cases.map((c: any) => (
                      <div
                        key={c._id}
                        onClick={() => router.push(`/case-tracking/view/${c._id}`)}
                        className="p-3 bg-secondary rounded-lg border border-border cursor-pointer hover:border-primary/40 transition-all"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-foreground truncate">{c.caseTitle || c.caseNo}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{c.caseNo}</p>
                          </div>
                          {c.status && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                              c.status?.toLowerCase() === "disposed" ? "bg-red-100 text-red-700" :
                              c.status?.toLowerCase() === "pending" ? "bg-amber-100 text-amber-700" :
                              "bg-emerald-100 text-emerald-700"
                            }`}>
                              {c.status}
                            </span>
                          )}
                        </div>
                        {c.courtName && <p className="text-[11px] text-muted-foreground mt-1">{c.courtName}</p>}
                        {c.courtDate && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Next: {c.courtDate}
                          </p>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8">
                      <Scale className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No cases linked</p>
                      <button
                        onClick={() => router.push("/case-tracking")}
                        className="mt-2 text-xs text-primary font-medium hover:underline"
                      >
                        Link from Cases
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Invoices Tab */}
              {activeTab === "invoices" && (
                <div className="text-center py-8">
                  <Receipt className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Manage invoices for this client</p>
                  <button
                    onClick={() => router.push("/invoices")}
                    className="mt-2 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
                  >
                    Go to Invoices
                  </button>
                </div>
              )}

              {/* Tasks Tab */}
              {activeTab === "tasks" && (
                <div className="text-center py-8">
                  <ClipboardList className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Manage tasks related to this client</p>
                  <button
                    onClick={() => router.push("/tasks")}
                    className="mt-2 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
                  >
                    Go to Tasks
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

/* ============ Helper Components ============ */
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{title}</h3>
    <div className="space-y-1.5">{children}</div>
  </div>
);

const InfoRow = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) => (
  <div className="flex items-start gap-2 py-1">
    <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
    <span className="text-xs text-muted-foreground w-16 shrink-0">{label}</span>
    <span className="text-sm text-foreground break-words">{value}</span>
  </div>
);

export default ClientDashboard;
