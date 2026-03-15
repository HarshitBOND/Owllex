"use client"

import { useState } from 'react';
import { Invoice } from '@/components/types/invoice';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { format } from 'date-fns';
import { CalendarIcon, CreditCard, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

interface AddPaymentModalProps {
  invoice: Invoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPaymentAdded: (invoiceId: string, payment: { amount: number; method: string; date: Date; reference?: string; notes?: string }) => Promise<void>;
}

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'check', label: 'Check' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'upi', label: 'UPI' },
  { value: 'other', label: 'Other' },
];

export function AddPaymentModal({ invoice, open, onOpenChange, onPaymentAdded }: AddPaymentModalProps) {
  const [amount, setAmount] = useState<string>('');
  const [method, setMethod] = useState<string>('bank_transfer');
  const [date, setDate] = useState<Date>(new Date());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  if (!invoice) return null;

  const balance = invoice.total - invoice.paidAmount;
  const parsedAmount = parseFloat(amount) || 0;

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(val);

  const handleSetBalance = () => setAmount(balance.toFixed(2));

  const handleSubmit = async () => {
    if (!parsedAmount || parsedAmount <= 0) return;
    setSaving(true);
    try {
      await onPaymentAdded(invoice.id, {
        amount: parsedAmount,
        method,
        date,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      // reset
      setAmount('');
      setMethod('bank_transfer');
      setDate(new Date());
      setReference('');
      setNotes('');
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <CreditCard className="h-5 w-5 text-primary" />
            Record Payment
          </DialogTitle>
        </DialogHeader>

        {/* Invoice summary */}
        <div className="rounded-lg bg-muted/50 border p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Invoice</span>
            <span className="font-semibold">{invoice.invoiceNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Client</span>
            <span className="font-medium">{invoice.client.name}</span>
          </div>
          <Separator className="my-1" />
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Amount</span>
            <span className="font-medium">{formatCurrency(invoice.total)}</span>
          </div>
          {invoice.paidAmount > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>Already Paid</span>
              <span className="font-medium">-{formatCurrency(invoice.paidAmount)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-base">
            <span>Balance Due</span>
            <span className={balance <= 0 ? 'text-emerald-600' : 'text-foreground'}>{formatCurrency(balance)}</span>
          </div>
        </div>

        <div className="space-y-4 py-2">
          {/* Amount */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="pay-amount">Payment Amount *</Label>
              <button
                type="button"
                onClick={handleSetBalance}
                className="text-xs text-primary hover:underline"
              >
                Pay full balance ({formatCurrency(balance)})
              </button>
            </div>
            <Input
              id="pay-amount"
              type="number"
              min="0.01"
              step="0.01"
              max={balance}
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="border-2 focus:border-primary"
            />
            {parsedAmount > balance && (
              <p className="text-xs text-destructive">Amount exceeds balance due</p>
            )}
          </div>

          {/* Method */}
          <div className="space-y-1.5">
            <Label>Payment Method *</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="border-2 focus:border-primary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <Label>Payment Date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn('w-full justify-start text-left font-normal border-2 focus:border-primary', !date && 'text-muted-foreground')}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, 'PPP') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={date} onSelect={d => d && setDate(d)} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          {/* Reference */}
          <div className="space-y-1.5">
            <Label htmlFor="pay-ref">Reference / Transaction ID <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input
              id="pay-ref"
              placeholder="e.g. UTR number, cheque number..."
              value={reference}
              onChange={e => setReference(e.target.value)}
              className="border-2 focus:border-primary"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="pay-notes">Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea
              id="pay-notes"
              placeholder="Any additional notes..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="border-2 focus:border-primary resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !parsedAmount || parsedAmount <= 0 || parsedAmount > balance}
            className="gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            Record Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
