export type InvoiceStatus = 'paid' | 'pending' | 'overdue' | 'draft';

export interface Client {
  id: string;
  name: string;
  email: string;
  company: string;
  phone: string;
  address: string;
  avatar?: string;
  totalPaid: number;
  totalOutstanding: number;
  invoiceCount: number;
  lastPayment?: Date;
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  clientId: string;
  client: Client;
  status: InvoiceStatus;
  issueDate: Date;
  dueDate: Date;
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  taxRate: number;
  discount: number;
  total: number;
  paidAmount: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentRecord {
  id: string;
  invoiceId: string;
  amount: number;
  method: 'credit_card' | 'bank_transfer' | 'paypal' | 'cash' | 'check';
  date: Date;
  reference?: string;
  notes?: string;
}

export interface InvoiceStats {
  totalRevenue: number;
  totalPending: number;
  totalOverdue: number;
  totalDraft: number;
  invoiceCount: number;
  paidCount: number;
  pendingCount: number;
  overdueCount: number;
  avgPaymentTime: number; // days
  collectionRate: number; // percentage
}
