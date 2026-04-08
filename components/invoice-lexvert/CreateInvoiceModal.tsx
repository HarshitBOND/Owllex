import { useState, useEffect } from 'react';
import { Client, Invoice, InvoiceItem } from '@/components/types/invoice';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { CalendarIcon, Plus, Trash2, Save, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CreateInvoiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: Client[];
  onSave: (invoiceData: any) => void;
  onSaveAndSend: (invoiceData: any) => void;
  editInvoice?: Invoice | null;
}

export function CreateInvoiceModal({
  open,
  onOpenChange,
  clients,
  onSave,
  onSaveAndSend,
  editInvoice,
}: CreateInvoiceModalProps) {
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [issueDate, setIssueDate] = useState<Date>(new Date());
  const [dueDate, setDueDate] = useState<Date>(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  );
  const [items, setItems] = useState<Omit<InvoiceItem, 'id'>[]>([
    { description: '', quantity: 1, rate: 0, amount: 0 },
  ]);
  const [taxRate, setTaxRate] = useState(10);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState('');

  // Pre-fill form when editing an existing invoice
  useEffect(() => {
    if (open && editInvoice) {
      setSelectedClient(editInvoice.clientId || '');
      setIssueDate(new Date(editInvoice.issueDate));
      setDueDate(new Date(editInvoice.dueDate));
      setItems(editInvoice.items.map(i => ({ description: i.description, quantity: i.quantity, rate: i.rate, amount: i.amount })));
      setTaxRate(editInvoice.taxRate || 0);
      setDiscount(editInvoice.discount || 0);
      setNotes(editInvoice.notes || '');
    } else if (open && !editInvoice) {
      resetForm();
    }
  }, [open, editInvoice]);

  const addItem = () => {
    setItems([...items, { description: '', quantity: 1, rate: 0, amount: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof Omit<InvoiceItem, 'id'>, value: string | number) => {
    const newItems = [...items];
    if (field === 'description') {
      newItems[index][field] = value as string;
    } else {
      newItems[index][field] = Number(value);
    }
    newItems[index].amount = newItems[index].quantity * newItems[index].rate;
    setItems(newItems);
  };

  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const tax = (subtotal - discount) * (taxRate / 100);
  const total = subtotal - discount + tax;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const handleSave = async (send: boolean = false) => {
    const invoiceData = {
      ...(editInvoice ? { id: editInvoice.id } : {}),
      clientId: selectedClient,
      issueDate,
      dueDate,
      items: items.map((item, i) => ({ ...item, id: `item-${i}` })),
      taxRate,
      discount,
      notes,
      subtotal,
      tax,
      total,
    };
    
    try {
      if (send) {
        await onSaveAndSend(invoiceData);
      } else {
        await onSave(invoiceData);
      }
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save invoice:', error);
      // Don't close modal on error
    }
  };

  const resetForm = () => {
    setSelectedClient('');
    setIssueDate(new Date());
    setDueDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
    setItems([{ description: '', quantity: 1, rate: 0, amount: 0 }]);
    setTaxRate(10);
    setDiscount(0);
    setNotes('');
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetForm();
      onOpenChange(isOpen);
    }}>
      <DialogContent className="max-w-6xl w-[95vw] max-h-[90vh] overflow-y-auto p-4 sm:p-8">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-2xl font-bold">{editInvoice ? `Edit Invoice — ${editInvoice.invoiceNumber}` : 'Create New Invoice'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 sm:space-y-6 py-2 sm:py-4">
          {/* Client & Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="space-y-1.5 sm:space-y-2">
              <Label className="text-xs sm:text-sm">Client</Label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name} - {client.company}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <Label className="text-xs sm:text-sm">Issue Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !issueDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {issueDate ? format(issueDate, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={issueDate}
                    onSelect={(date) => date && setIssueDate(date)}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <Label className="text-xs sm:text-sm">Due Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !dueDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={(date) => date && setDueDate(date)}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm sm:text-base font-semibold">Line Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItem} className="h-7 sm:h-8 text-xs sm:text-sm">
                <Plus className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                Add
              </Button>
            </div>

            <div className="space-y-2 sm:space-y-3">
              {/* Desktop header */}
              <div className="hidden sm:grid grid-cols-12 gap-2 text-sm font-medium text-muted-foreground px-1">
                <div className="col-span-5">Description</div>
                <div className="col-span-2 text-right">Qty</div>
                <div className="col-span-2 text-right">Rate</div>
                <div className="col-span-2 text-right">Amount</div>
                <div className="col-span-1"></div>
              </div>
              
              {items.map((item, index) => (
                <div key={index} className="space-y-2 sm:space-y-0 p-2 sm:p-0 border sm:border-0 rounded-lg sm:rounded-none">
                  {/* Mobile layout */}
                  <div className="sm:hidden space-y-2">
                    <Input
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => updateItem(index, 'description', e.target.value)}
                      className="h-8 text-xs border-2 border-primary/20 focus:border-primary bg-muted/30"
                    />
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Qty</Label>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                          className="h-8 text-xs border-2 border-primary/20 focus:border-primary bg-muted/30"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Rate</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.rate}
                          onChange={(e) => updateItem(index, 'rate', e.target.value)}
                          className="h-8 text-xs border-2 border-primary/20 focus:border-primary bg-muted/30"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Amount</Label>
                        <div className="h-8 flex items-center text-xs font-medium">
                          {formatCurrency(item.amount)}
                        </div>
                      </div>
                      <div className="flex items-end justify-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeItem(index)}
                          disabled={items.length === 1}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  {/* Desktop layout */}
                  <div className="hidden sm:grid grid-cols-12 gap-2 items-center">
                    <Input
                      className="col-span-5 border-2 border-primary/20 focus:border-primary bg-muted/30"
                      placeholder="Item description"
                      value={item.description}
                      onChange={(e) => updateItem(index, 'description', e.target.value)}
                    />
                    <Input
                      className="col-span-2 text-right border-2 border-primary/20 focus:border-primary bg-muted/30"
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                    />
                    <Input
                      className="col-span-2 text-right border-2 border-primary/20 focus:border-primary bg-muted/30"
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.rate}
                      onChange={(e) => updateItem(index, 'rate', e.target.value)}
                    />
                    <div className="col-span-2 text-right font-medium">
                      {formatCurrency(item.amount)}
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removeItem(index)}
                        disabled={items.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-full max-w-sm space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Discount</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  className="w-24 text-right border-2 border-primary/20 focus:border-primary bg-muted/30"
                />
              </div>
              
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Tax Rate (%)</span>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={taxRate}
                  onChange={(e) => setTaxRate(Number(e.target.value))}
                  className="w-24 text-right border-2 border-primary/20 focus:border-primary bg-muted/30"
                />
              </div>
              
              <div className="flex justify-between text-muted-foreground">
                <span>Tax Amount</span>
                <span>{formatCurrency(tax)}</span>
              </div>
              
              <div className="flex justify-between text-lg font-bold border-t pt-3">
                <span>Total</span>
                <span className="text-primary">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              placeholder="Add any notes or payment instructions..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto h-9 sm:h-10 text-xs sm:text-sm">
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => handleSave(false)} className="w-full sm:w-auto h-9 sm:h-10 text-xs sm:text-sm">
            <Save className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
            {editInvoice ? 'Save Changes' : 'Save Draft'}
          </Button>
          {!editInvoice && (
            <Button onClick={() => handleSave(true)} disabled={!selectedClient} className="w-full sm:w-auto h-9 sm:h-10 text-xs sm:text-sm">
              <Send className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Save & Send
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
