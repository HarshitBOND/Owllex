export interface ClientAddress {
  building?: string;
  street?: string;
  city?: string;
  district?: string;
  state?: string;
  pincode?: string;
  country?: string;
}

export interface Client {
  _id: string;
  salutation: string;
  name: string;
  email: string;
  contact: string;
  contactAlt?: string;
  company?: string;
  group?: string;
  gstin?: string;
  address?: ClientAddress;
  cases: any[];
  notes: any[];
  customFields?: { name: string; value: string }[];
  createdAt: string;
  updatedAt: string;
}

export type SortField = "name" | "createdAt" | "cases";
export type FilterStatus = "all" | "with-cases" | "no-cases";
