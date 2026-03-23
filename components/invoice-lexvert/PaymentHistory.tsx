import { PaymentRecord, Invoice } from '@/components/types/invoice';
import { format } from 'date-fns';
import { CreditCard, Building2, Wallet, Banknote, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaymentHistoryProps {
  payments: PaymentRecord[];
  invoices: Invoice[];
}

const methodIcons: Record<PaymentRecord['method'], typeof CreditCard> = {
  credit_card: CreditCard,
  bank_transfer: Building2,
  paypal: Wallet,
  cash: Banknote,
  check: Receipt,
  upi: Wallet,
  other: Receipt,
};

const methodLabels: Record<PaymentRecord['method'], string> = {
  credit_card: 'Credit Card',
  bank_transfer: 'Bank Transfer',
  paypal: 'PayPal',
  cash: 'Cash',
  check: 'Check',
  upi: 'UPI',
  other: 'Other',
};

export function PaymentHistory({ payments, invoices }: PaymentHistoryProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getInvoice = (invoiceId: string) => {
    return invoices.find((inv) => inv.id === invoiceId);
  };

  if (payments.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">No payment records yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 sm:space-y-4">
      {payments.map((payment, index) => {
        const invoice = getInvoice(payment.invoiceId);
        const Icon = methodIcons[payment.method];
        
        return (
          <div
            key={payment.id}
            className={cn(
              'flex items-center gap-2 sm:gap-4 rounded-lg border bg-card p-2.5 sm:p-4 transition-all duration-300 hover:shadow-md',
              'animate-fade-in'
            )}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className="flex h-9 w-9 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shrink-0">
              <Icon className="h-4 w-4 sm:h-6 sm:w-6" />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sm sm:text-base font-amethysta">{formatCurrency(payment.amount)}</p>
                  <p className="text-xs sm:text-sm text-muted-foreground truncate font-outfit">
                    {invoice?.invoiceNumber} • {invoice?.client.name}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs sm:text-sm font-medium">{methodLabels[payment.method]}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">
                    {format(new Date(payment.date), 'MMM dd')}
                  </p>
                </div>
              </div>
              {payment.reference && (
                <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs text-muted-foreground font-mono truncate">
                  Ref: {payment.reference}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
