import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Search, Filter, Plus, LayoutGrid, List,
  ChevronDown, Loader2, Briefcase, Scale
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel
} from "@/components/ui/dropdown-menu";
import { CaseData, getCaseStatus } from "./CaseData";
import { CaseCard } from "./CaseCard";
import { CaseStats } from "./CaseStats";
import { parseCourtDate } from "@/lib/utils";

type ViewMode = "grid" | "list";

export function MyCases() {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("grid");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [cases, setCases] = useState<CaseData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchCases();
  }, []);

  const fetchCases = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/userdetails/cases", { cache: "no-store" });
      if (!res.ok) {
        setError("Failed to load cases");
        return;
      }
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      const userCases = data?.userCases?.cases || [];
      setCases(userCases);
    } catch {
      setError("Failed to load cases");
    } finally {
      setLoading(false);
    }
  };

  const filteredCases = useMemo(() => {
    const result = cases.filter((c) => {
      const q = search.toLowerCase();
      const matchesSearch =
        (c.caseTitle || "").toLowerCase().includes(q) ||
        (c.caseNo || "").toLowerCase().includes(q) ||
        (c.advocate || "").toLowerCase().includes(q) ||
        (c.courtName || "").toLowerCase().includes(q);
      const caseStatus = getCaseStatus(c);
      const matchesStatus = statusFilter === "all" || caseStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });

    result.sort((a, b) => {
      const dateA = a.courtDate ? (parseCourtDate(a.courtDate)?.getTime() ?? Infinity) : Infinity;
      const dateB = b.courtDate ? (parseCourtDate(b.courtDate)?.getTime() ?? Infinity) : Infinity;
      return dateA - dateB;
    });

    return result;
  }, [search, statusFilter, cases]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading your cases...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Scale className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                  My Cases
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Track hearings, filings, and case progress
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => router.push("/case-tracking/add")}>
                <Search className="h-4 w-4" />
                <span className="hidden sm:inline">Find Case</span>
              </Button>
              <Button size="sm" className="bg-primary text-primary-foreground gap-1.5" onClick={() => router.push("/case-tracking/add")}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Add Case</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
        {/* Stats */}
        <CaseStats cases={cases} />

        {/* Search + Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by case title, number, advocate, or court..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-card border-border h-9 text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 h-9 text-xs">
                  <Filter className="h-3.5 w-3.5" />
                  {statusFilter === "all" ? "Status" : statusFilter}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setStatusFilter("all")}>All</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setStatusFilter("active")}>Active</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setStatusFilter("urgent")}>Urgent</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setStatusFilter("pending")}>Pending</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setStatusFilter("disposed")}>Disposed / Closed</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex items-center border border-border rounded-md overflow-hidden bg-card">
              {[
                { mode: "grid" as ViewMode, icon: LayoutGrid },
                { mode: "list" as ViewMode, icon: List },
              ].map(({ mode, icon: Icon }) => (
                <button
                  key={mode}
                  onClick={() => setView(mode)}
                  className={`p-1.5 transition-colors ${
                    view === mode
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Active Filters */}
        {statusFilter !== "all" && (
          <div className="flex items-center gap-2 mb-4">
            <Badge variant="secondary" className="gap-1 cursor-pointer text-xs" onClick={() => setStatusFilter("all")}>
              {statusFilter} ✕
            </Badge>
          </div>
        )}

        {/* Results count */}
        <p className="text-xs text-muted-foreground mb-3">
          {filteredCases.length} {filteredCases.length === 1 ? "case" : "cases"}{statusFilter !== "all" ? ` (filtered from ${cases.length})` : ""} · sorted by next hearing
        </p>

        {/* Cases */}
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={
              view === "grid"
                ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3"
                : "flex flex-col gap-2"
            }
          >
            {filteredCases.map((c, i) => (
              <CaseCard
                key={c._id}
                caseData={c}
                view={view}
                index={i}
                onClick={() => router.push(`/case-tracking/view/${c._id}`)}
              />
            ))}
          </motion.div>
        </AnimatePresence>

        {filteredCases.length === 0 && !error && (
          <div className="text-center py-16">
            <Briefcase className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground">No cases yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Add your first case to start tracking hearings, filings, and court dates
            </p>
            <div className="flex items-center justify-center gap-3 mt-5">
              <Button variant="outline" onClick={() => router.push("/case-tracking/add")}>
                <Search className="h-4 w-4 mr-2" />
                Search Court Database
              </Button>
              <Button onClick={() => router.push("/case-tracking/add")} className="bg-primary text-primary-foreground">
                <Plus className="h-4 w-4 mr-2" />
                Register a Case
              </Button>
            </div>
          </div>
        )}

        {error && (
          <div className="text-center py-16">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={fetchCases}>
              Retry
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default MyCases;
