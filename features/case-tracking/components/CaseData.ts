// Types for the My Cases section connected to MongoDB via API

import { parseCourtDate } from "@/lib/utils";

export interface FilingDetail {
  srlNo: string;
  date: string;
  filingDetails: string;
}

export interface ListingDetail {
  srlNo: string;
  date: string;
  listingDetails: string;
}

export interface CaseData {
  _id: string;
  fileNo?: string;
  caseNo: string;
  cnrNo?: string;
  caseTitle: string;
  advocate: string;
  caseStage?: string;
  remarks?: string;
  links: string[];
  documents: string[];
  courtName?: string;
  courtValue?: string;
  courtRoom?: string;
  courtDate?: string;
  fillingAdvocate?: string;
  fillingDate?: string;
  status?: string;
  registrationDate?: string;
  filingDetails: FilingDetail[];
  listingDetails: ListingDetail[];
  notes: any[];
  clients: any[];
  tasks: any[];
}

export const statusConfig: Record<string, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-brand-500/10 text-brand-600 dark:bg-brand-400/15 dark:text-brand-400 border-brand-200 dark:border-brand-500/30' },
  pending: { label: 'Pending', className: 'bg-amber-500/10 text-amber-600 dark:bg-amber-400/15 dark:text-amber-400 border-amber-200 dark:border-amber-500/30' },
  closed: { label: 'Closed', className: 'bg-muted text-muted-foreground border-border' },
  disposed: { label: 'Disposed', className: 'bg-muted text-muted-foreground border-border' },
  urgent: { label: 'Urgent', className: 'bg-rose-500/10 text-rose-600 dark:bg-rose-400/15 dark:text-rose-400 border-rose-200 dark:border-rose-500/30' },
};

export function getCaseStatus(c: CaseData): string {
  if (c.status) {
    const s = c.status.toLowerCase();
    if (s.includes('disposed') || s.includes('closed')) return 'disposed';
    if (s.includes('pending')) return 'pending';
  }
  if (c.courtDate) {
    const d = parseCourtDate(c.courtDate);
    if (d) {
      const now = new Date();
      const diff = d.getTime() - now.getTime();
      const days = diff / 86400000;
      if (days >= 0 && days <= 3) return 'urgent';
    }
  }
  return 'active';
}
