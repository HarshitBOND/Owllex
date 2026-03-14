import { Search, SlidersHorizontal, ArrowUpDown } from "lucide-react";
import { FilterStatus, SortField } from "./types";
import { useState } from "react";

interface ClientSearchProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filterStatus: FilterStatus;
  onFilterChange: (f: FilterStatus) => void;
  sortField: SortField;
  onSortChange: (s: SortField) => void;
  clientCount: number;
}

const statusOptions: { value: FilterStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "with-cases", label: "With Cases" },
  { value: "no-cases", label: "No Cases" },
];

const sortOptions: { value: SortField; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "createdAt", label: "Date Added" },
  { value: "cases", label: "Cases" },
];

const ClientSearch = ({
  searchQuery,
  onSearchChange,
  filterStatus,
  onFilterChange,
  sortField,
  onSortChange,
  clientCount,
}: ClientSearchProps) => {
  const [showFilters, setShowFilters] = useState(false);

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search clients by name, email, company, or contact..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-secondary border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
            showFilters
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-secondary text-secondary-foreground border-border hover:border-primary/50"
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span>Filters</span>
        </button>
      </div>

      {/* Filters row */}
      {showFilters && (
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center animate-fade-in">
          {/* Status filters */}
          <div className="flex flex-wrap gap-1.5">
            {statusOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onFilterChange(opt.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  filterStatus === opt.value
                    ? "bg-primary text-primary-foreground shadow-gold"
                    : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="hidden sm:block w-px h-6 bg-border" />

          {/* Sort */}
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={sortField}
              onChange={(e) => onSortChange(e.target.value as SortField)}
              className="bg-secondary border border-border rounded-md px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <span className="text-xs text-muted-foreground ml-auto">
            {clientCount} client{clientCount !== 1 ? "s" : ""}
          </span>
        </div>
      )}
    </div>
  );
};

export default ClientSearch;
