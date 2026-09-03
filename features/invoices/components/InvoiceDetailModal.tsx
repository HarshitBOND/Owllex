import { Invoice, PaymentRecord } from '@/features/invoices/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/features/invoices/components/StatusBadge';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import {
  Download,
  Send,
  Printer,
  Edit,
  Building2,
  Mail,
  Phone,
  MapPin,
  Calendar,
  CreditCard,
  FileText,
  PlusCircle,
  Banknote,
  Wallet,
  Receipt,
  Vault,
} from 'lucide-react';

interface InvoiceDetailModalProps {
  invoice: Invoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (invoice: Invoice) => void;
  onSend: (invoice: Invoice) => void;
  onDownload: (invoice: Invoice) => void;
  onSaveToVault: (invoice: Invoice) => void;
  onMarkAsPaid: (invoice: Invoice) => void;
  onRecordPayment: (invoice: Invoice) => void;
}

const methodLabels: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  credit_card: 'Credit Card',
  check: 'Check',
  paypal: 'PayPal',
  upi: 'UPI',
  other: 'Other',
};

export function InvoiceDetailModal({
  invoice,
  open,
  onOpenChange,
  onEdit,
  onSend,
  onDownload,
  onSaveToVault,
  onMarkAsPaid,
  onRecordPayment,
}: InvoiceDetailModalProps) {
  if (!invoice) return null;

  const payments: PaymentRecord[] = (invoice as any).payments || [];

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(amount);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-8">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <DialogTitle className="text-lg sm:text-2xl font-bold font-amethysta">
                {invoice.invoiceNumber}
              </DialogTitle>
              <StatusBadge status={invoice.status} />
            </div>
          </div>
          <DialogDescription>
            View and manage invoice details, payments, and actions
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 sm:space-y-6">
          {/* Actions - Scrollable on mobile */}
          <div className="flex flex-wrap gap-1.5 sm:gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            <Button variant="outline" size="sm" onClick={() => onEdit(invoice)} className="h-8 sm:h-9 text-xs sm:text-sm shrink-0">
              <Edit className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
              Edit
            </Button>
            <Button variant="outline" size="sm" onClick={() => onSend(invoice)} className="h-8 sm:h-9 text-xs sm:text-sm shrink-0">
              <Send className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
              Send
            </Button>
            <Button variant="outline" size="sm" className="h-8 sm:h-9 text-xs sm:text-sm shrink-0" onClick={() => onDownload(invoice)}>
              <Download className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
              PDF
            </Button>
            <Button variant="outline" size="sm" className="h-8 sm:h-9 text-xs sm:text-sm shrink-0" onClick={() => onSaveToVault(invoice)}>
              <Vault className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
              Save to Vault
            </Button>
            <Button variant="outline" size="sm" className="h-8 sm:h-9 text-xs sm:text-sm shrink-0" onClick={() => window.print()}>
              <Printer className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
              Print
            </Button>
            {invoice.status !== 'paid' && (
              <Button size="sm" variant="outline" onClick={() => onRecordPayment(invoice)} className="h-8 sm:h-9 text-xs sm:text-sm border-brand-300 text-brand-700 hover:bg-brand-50 shrink-0">
                <PlusCircle className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">Record</span> Pay
              </Button>
            )}
            {invoice.status !== 'paid' && invoice.status !== 'draft' && (
              <Button size="sm" onClick={() => onMarkAsPaid(invoice)} className="h-8 sm:h-9 text-xs sm:text-sm shrink-0 sm:ml-auto">
                <CreditCard className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                Paid
              </Button>
            )}
          </div>

          <Separator />

          {/* Client & Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div className="space-y-2 sm:space-y-4">
              <h3 className="font-semibold text-sm sm:text-lg flex items-center gap-1.5 sm:gap-2">
                <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                Bill To
              </h3>
              <div className="space-y-1 sm:space-y-2 text-xs sm:text-sm">
                <p className="font-semibold text-sm sm:text-base">{invoice.client.name}</p>
                <p className="text-muted-foreground">{invoice.client.company}</p>
                <p className="flex items-center gap-1.5 sm:gap-2 text-muted-foreground">
                  <Mail className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="truncate">{invoice.client.email}</span>
                </p>
                <p className="flex items-center gap-1.5 sm:gap-2 text-muted-foreground">
                  <Phone className="h-3 w-3 sm:h-4 sm:w-4" />
                  {invoice.client.phone}
                </p>
                <p className="flex items-start gap-1.5 sm:gap-2 text-muted-foreground">
                  <MapPin className="h-3 w-3 sm:h-4 sm:w-4 mt-0.5 shrink-0" />
                  <span className="line-clamp-2">{invoice.client.address}</span>
                </p>
              </div>
            </div>

            <div className="space-y-2 sm:space-y-4">
              <h3 className="font-semibold text-sm sm:text-lg flex items-center gap-1.5 sm:gap-2">
                <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                Invoice Details
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:gap-4 text-xs sm:text-sm">
                <div>
                  <p className="text-muted-foreground text-[10px] sm:text-sm">Issue Date</p>
                  <p className="font-medium">{format(new Date(invoice.issueDate), 'MMM dd, yyyy')}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[10px] sm:text-sm">Due Date</p>
                  <p className={`font-medium ${invoice.status === 'overdue' ? 'text-destructive' : ''}`}>
                    {format(new Date(invoice.dueDate), 'MMM dd, yyyy')}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[10px] sm:text-sm">Created</p>
                  <p className="font-medium">{format(new Date(invoice.createdAt), 'MMM dd, yyyy')}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[10px] sm:text-sm">Last Updated</p>
                  <p className="font-medium">{format(new Date(invoice.updatedAt), 'MMM dd, yyyy')}</p>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Line Items */}
          <div className="space-y-2 sm:space-y-4">
            <h3 className="font-semibold text-sm sm:text-lg flex items-center gap-1.5 sm:gap-2">
              <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              Items
            </h3>
            {/* Mobile card view for items */}
            <div className="sm:hidden space-y-2">
              {invoice.items.map((item) => (
                <div key={item.id} className="border rounded-lg p-2.5 text-xs">
                  <p className="font-medium mb-1">{item.description}</p>
                  <div className="flex justify-between text-muted-foreground">
                    <span>{item.quantity} × {formatCurrency(item.rate)}</span>
                    <span className="font-semibold text-foreground">{formatCurrency(item.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden sm:block rounded-lg border overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium">Description</th>
                    <th className="px-4 py-3 text-right text-sm font-medium">Qty</th>
                    <th className="px-4 py-3 text-right text-sm font-medium">Rate</th>
                    <th className="px-4 py-3 text-right text-sm font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {invoice.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3 text-sm">{item.description}</td>
                      <td className="px-4 py-3 text-sm text-right">{item.quantity}</td>
                      <td className="px-4 py-3 text-sm text-right">{formatCurrency(item.rate)}</td>
                      <td className="px-4 py-3 text-sm text-right font-medium">{formatCurrency(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-full max-w-xs space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(invoice.subtotal)}</span>
              </div>
              {invoice.discount > 0 && (
                <div className="flex justify-between text-sm text-brand-600">
                  <span>Discount</span>
                  <span>-{formatCurrency(invoice.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax ({invoice.taxRate}%)</span>
                <span>{formatCurrency(invoice.tax)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span className="text-primary">{formatCurrency(invoice.total)}</span>
              </div>
              {invoice.paidAmount > 0 && (
                <>
                  <div className="flex justify-between text-sm text-brand-600">
                    <span>Paid</span>
                    <span>-{formatCurrency(invoice.paidAmount)}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>Balance Due</span>
                    <span>{formatCurrency(invoice.total - invoice.paidAmount)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <>
              <Separator />
              <div className="space-y-2">
                <h3 className="font-semibold">Notes</h3>
                <p className="text-sm text-muted-foreground">{invoice.notes}</p>
              </div>
            </>
          )}

          {/* Payment History */}
          {payments.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <h3 className="font-semibold text-sm sm:text-base flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-primary" />
                  Payment History ({payments.length})
                </h3>
                <div className="space-y-2">
                  {payments.map((p: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/30 text-xs sm:text-sm">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-md bg-brand-50 border border-brand-100">
                          <Banknote className="h-3.5 w-3.5 text-brand-600" />
                        </div>
                        <div>
                          <p className="font-medium">{methodLabels[p.method] || p.method}</p>
                          <p className="text-muted-foreground text-[11px]">
                            {format(new Date(p.date), 'MMM dd, yyyy')}
                            {p.reference ? ` · ${p.reference}` : ''}
                          </p>
                        </div>
                      </div>
                      <span className="font-semibold text-brand-600">+{formatCurrency(p.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
