import { useState, useMemo, useEffect, useCallback } from 'react';
import { Invoice, Client, PaymentRecord } from '@/components/types/invoice';
import { StatCard } from '@/components/invoice-lexvert/StatCard';
import { InvoiceList } from '@/components/invoice-lexvert/InvoiceList';
import { ClientList } from '@/components/invoice-lexvert/ClientList';
import { InvoiceDetailModal } from '@/components/invoice-lexvert/InvoiceDetailModal';
import { CreateInvoiceModal } from '@/components/invoice-lexvert/CreateInvoiceModal';
import { AddPaymentModal } from '@/components/invoice-lexvert/AddPaymentModal';
import { PaymentHistory } from '@/components/invoice-lexvert/PaymentHistory';
import { RevenueChart } from '@/components/invoice-lexvert/RevenueChart';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DollarSign, Clock, AlertTriangle, FileText, Plus, TrendingUp, Users, Receipt, Activity, ArrowUpRight, ArrowDownRight, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

function calculateStats(invoices: Invoice[]) {
  const paid = invoices.filter(i => i.status === 'paid');
  const pending = invoices.filter(i => i.status === 'pending');
  const overdue = invoices.filter(i => i.status === 'overdue');
  const draft = invoices.filter(i => i.status === 'draft');
  const totalRevenue = paid.reduce((sum, i) => sum + i.total, 0);
  const totalPending = pending.reduce((sum, i) => sum + i.total - i.paidAmount, 0);
  const totalOverdue = overdue.reduce((sum, i) => sum + i.total - i.paidAmount, 0);
  return {
    totalRevenue,
    totalPending,
    totalOverdue,
    totalDraft: draft.reduce((sum, i) => sum + i.total, 0),
    invoiceCount: invoices.length,
    paidCount: paid.length,
    pendingCount: pending.length,
    overdueCount: overdue.length,
    avgPaymentTime: paid.length > 0 ? 14 : 0,
    collectionRate: invoices.length > 0 ? Math.round((paid.length / invoices.length) * 100) : 0,
  };
}

export function InvoiceDashboard() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [realClients, setRealClients] = useState<Client[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  
  const stats = useMemo(() => calculateStats(invoices), [invoices]);

  // Fetch real clients from API
  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch('/api/userdetails/clients');
      const data = await res.json();
      const clientsList = data?.userClients?.clients || [];
      const mapped: Client[] = clientsList.map((c: any) => ({
        id: c._id,
        name: c.name || 'Unknown',
        email: c.email || '',
        company: c.company || '',
        phone: c.contact || '',
        address: c.address ? `${c.address.city || ''} ${c.address.state || ''}`.trim() : '',
        totalPaid: 0,
        totalOutstanding: 0,
        invoiceCount: 0,
      }));
      setRealClients(mapped);
    } catch {
      console.error('Failed to fetch clients');
    }
  }, []);

  // Fetch real invoices from API
  const fetchInvoices = useCallback(async () => {
    try {
      const res = await fetch('/api/userdetails/invoices');
      const data = await res.json();
      const invoicesList = data?.invoices || [];
      const mapped: Invoice[] = invoicesList.map((inv: any) => ({
        id: inv._id,
        invoiceNumber: inv.invoiceNumber,
        clientId: inv.clientId || '',
        client: {
          id: inv.clientId || '',
          name: inv.clientName || 'Unknown',
          email: inv.clientEmail || '',
          company: inv.clientCompany || '',
          phone: '',
          address: '',
          totalPaid: 0,
          totalOutstanding: 0,
          invoiceCount: 0,
        },
        status: inv.status,
        issueDate: new Date(inv.issueDate),
        dueDate: new Date(inv.dueDate),
        items: (inv.items || []).map((item: any, index: number) => ({
          id: item._id || item.id || `${inv._id}-item-${index}`,
          description: item.description || 'Item',
          quantity: Number(item.quantity || 0),
          rate: Number(item.rate || 0),
          amount: Number(item.amount || 0),
        })),
        subtotal: inv.subtotal,
        tax: inv.tax || 0,
        taxRate: inv.taxRate || 0,
        discount: inv.discount || 0,
        currency: inv.currency || 'USD',
        total: inv.total,
        paidAmount: inv.paidAmount || 0,
        payments: inv.payments || [],
        paymentLinkUrl: inv.paymentLinkUrl || null,
        sentAt: inv.sentAt ? new Date(inv.sentAt) : null,
        notes: inv.notes,
        createdAt: new Date(inv.createdAt),
        updatedAt: new Date(inv.updatedAt),
      }));
      setInvoices(mapped);
      // Flatten all payments from invoices to build the payments list
      const allPayments: PaymentRecord[] = invoicesList.flatMap((inv: any) =>
        (inv.payments || []).map((p: any) => ({
          id: p._id || `${inv._id}-${p.createdAt}`,
          invoiceId: inv._id,
          amount: p.amount,
          method: p.method,
          date: new Date(p.date),
          reference: p.reference,
          notes: p.notes,
        }))
      );
      setPayments(allPayments);
    } catch {
      console.error('Failed to fetch invoices');
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchClients(), fetchInvoices()]).finally(() => setLoading(false));
  }, [fetchClients, fetchInvoices]);

  // Update client stats based on invoices
  const clientsWithStats = useMemo(() => {
    return realClients.map(c => {
      const clientInvs = invoices.filter(i => i.clientId === c.id);
      const paid = clientInvs.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.total, 0);
      const outstanding = clientInvs.filter(i => i.status !== 'paid').reduce((sum, i) => sum + i.total - i.paidAmount, 0);
      return { ...c, totalPaid: paid, totalOutstanding: outstanding, invoiceCount: clientInvs.length };
    });
  }, [realClients, invoices]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const handleViewInvoice = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setIsDetailOpen(true);
  };

  const handleEditInvoice = (invoice: Invoice) => {
    setEditInvoice(invoice);
    setIsDetailOpen(false);
    setIsCreateOpen(true);
  };

  const handleRecordPayment = (invoice: Invoice) => {
    setPaymentInvoice(invoice);
    setIsDetailOpen(false);
    setIsPaymentOpen(true);
  };

  const handleAddPayment = async (invoiceId: string, payment: { amount: number; method: string; date: Date; reference?: string; notes?: string }) => {
    const res = await fetch(`/api/userdetails/invoices?id=${invoiceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payment),
    });
    if (!res.ok) throw new Error('Failed to record payment');
    await fetchInvoices();
    toast({ title: 'Payment Recorded', description: `Payment of ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(payment.amount)} recorded.` });
  };

  const handleDeleteInvoice = async (invoice: Invoice) => {
    try {
      await fetch(`/api/userdetails/invoices?id=${invoice.id}`, { method: 'DELETE' });
      setInvoices(prev => prev.filter(inv => inv.id !== invoice.id));
      toast({ title: 'Invoice Deleted', description: `${invoice.invoiceNumber} has been deleted.`, variant: 'destructive' });
    } catch {
      toast({ title: 'Error', description: 'Failed to delete invoice', variant: 'destructive' });
    }
  };

  const handleDownloadInvoice = async (invoice: Invoice) => {
    try {
      const response = await fetch(`/api/userdetails/invoices?id=${invoice.id}&format=pdf`);
      if (!response.ok) {
        throw new Error('Failed to download invoice PDF');
      }

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = `${invoice.invoiceNumber}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(downloadUrl);
    } catch {
      toast({ title: 'Error', description: 'Failed to download invoice PDF', variant: 'destructive' });
    }
  };

  const handleSendInvoice = async (invoice: Invoice) => {
    try {
      const response = await fetch(`/api/userdetails/invoices?id=${invoice.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'pending',
          sendEmail: true,
          createPaymentLink: true,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to send invoice');
      }

      await fetchInvoices();

      const emailSent = result?.email?.sent === true;
      const paymentLinkCreated = result?.paymentLink?.created === true;

      let description = `${invoice.invoiceNumber} marked as pending.`;
      if (emailSent && paymentLinkCreated) {
        description = `${invoice.invoiceNumber} emailed with payment link.`;
      } else if (emailSent) {
        description = `${invoice.invoiceNumber} emailed to client.`;
      } else if (paymentLinkCreated) {
        description = `${invoice.invoiceNumber} updated and payment link created.`;
      }

      toast({ title: 'Invoice Sent', description });
      setIsDetailOpen(false);
    } catch {
      toast({ title: 'Error', description: 'Failed to send invoice', variant: 'destructive' });
    }
  };

  const handleMarkAsPaid = async (invoice: Invoice) => {
    try {
      await fetch(`/api/userdetails/invoices?id=${invoice.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paid', paidAmount: invoice.total }),
      });
      setInvoices(prev => prev.map(inv => inv.id === invoice.id ? { ...inv, status: 'paid' as const, paidAmount: inv.total } : inv));
      toast({ title: 'Payment Recorded', description: `${invoice.invoiceNumber} has been marked as paid.` });
      setIsDetailOpen(false);
    } catch {
      toast({ title: 'Error', description: 'Failed to update invoice', variant: 'destructive' });
    }
  };

  const handleSaveInvoice = async (invoiceData: any) => {
    try {
      const client = clientsWithStats.find(c => c.id === invoiceData.clientId);
      if (!client) { toast({ title: 'Error', description: 'Please select a client', variant: 'destructive' }); return; }
      const payload = {
        clientId: invoiceData.clientId,
        clientName: client.name,
        clientEmail: client.email,
        clientCompany: client.company,
        issueDate: invoiceData.issueDate,
        dueDate: invoiceData.dueDate,
        items: invoiceData.items,
        subtotal: invoiceData.subtotal,
        tax: invoiceData.tax,
        taxRate: invoiceData.taxRate,
        discount: invoiceData.discount,
        total: invoiceData.total,
        notes: invoiceData.notes,
      };

      if (invoiceData.id) {
        // Edit existing invoice
        await fetch(`/api/userdetails/invoices?id=${invoiceData.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        setEditInvoice(null);
        await fetchInvoices();
        toast({ title: 'Invoice Updated', description: 'Invoice has been updated.' });
      } else {
        // Create new invoice
        const res = await fetch('/api/userdetails/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, status: 'draft', paidAmount: 0 }),
        });
        const data = await res.json();
        if (data.invoice) {
          await fetchInvoices();
          toast({ title: 'Invoice Created', description: 'Invoice saved as draft.' });
        }
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to save invoice', variant: 'destructive' });
    }
  };

  const handleSaveAndSend = async (invoiceData: any) => {
    try {
      const client = clientsWithStats.find(c => c.id === invoiceData.clientId);
      if (!client) return;
      const payload = {
        clientId: invoiceData.clientId,
        clientName: client.name,
        clientEmail: client.email,
        clientCompany: client.company,
        issueDate: invoiceData.issueDate,
        dueDate: invoiceData.dueDate,
        items: invoiceData.items,
        subtotal: invoiceData.subtotal,
        tax: invoiceData.tax,
        taxRate: invoiceData.taxRate,
        discount: invoiceData.discount,
        total: invoiceData.total,
        notes: invoiceData.notes,
      };

      let invoiceId = invoiceData.id as string | undefined;

      if (invoiceId) {
        const updateRes = await fetch(`/api/userdetails/invoices?id=${invoiceId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!updateRes.ok) {
          throw new Error('Failed to update invoice before sending');
        }
      } else {
        const createRes = await fetch('/api/userdetails/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, status: 'draft', paidAmount: 0 }),
        });
        const createData = await createRes.json();

        if (!createRes.ok || !createData?.invoice?._id) {
          throw new Error(createData?.error || 'Failed to create invoice');
        }

        invoiceId = createData.invoice._id;
      }

      const sendRes = await fetch(`/api/userdetails/invoices?id=${invoiceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'pending',
          sendEmail: true,
          createPaymentLink: true,
        }),
      });
      const sendData = await sendRes.json().catch(() => ({}));
      if (!sendRes.ok) {
        throw new Error(sendData?.error || 'Failed to send invoice');
      }

      await fetchInvoices();
      const emailSent = sendData?.email?.sent === true;
      toast({
        title: emailSent ? 'Invoice Sent' : 'Invoice Updated',
        description: emailSent
          ? `Invoice sent to ${client.name}`
          : `Invoice prepared for ${client.name}; email delivery not configured.`,
      });
    } catch {
      toast({ title: 'Error', description: 'Failed to create invoice', variant: 'destructive' });
    }
  };

    // Reset edit state when create modal closes
    const handleCreateModalClose = (isOpen: boolean) => {
      if (!isOpen) setEditInvoice(null);
      setIsCreateOpen(isOpen);
    };

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client);
  };

  const clientInvoices = selectedClient ? invoices.filter(inv => inv.clientId === selectedClient.id) : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-sidebar-primary" />
          <p className="text-sm text-gray-500">Loading your invoices...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Header Section with Title */}
      <div className="bg-white border-b border-gray-200 w-full mb-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Invoice Dashboard</h2>
              <p className="text-sm md:text-base text-muted-foreground mt-1">
                Track, manage, and monitor all your invoices and payments
              </p>
            </div>
            <Button 
              onClick={() => setIsCreateOpen(true)} 
              className="hidden md:flex gap-2 shadow-lg"
            >
              <Plus className="h-4 w-4" />
              New Invoice
            </Button>
          </div>
          <Button 
            onClick={() => setIsCreateOpen(true)} 
            className="md:hidden w-full gap-2"
          >
            <Plus className="h-4 w-4" />
            New Invoice
          </Button>
        </div>
      </div>

      {/* Stats Cards Grid - Stronger borders */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        <div className="bg-white rounded-xl border-2 border-emerald-200 p-4 md:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.1)] transition-all duration-300 cursor-pointer group">
          <div className="flex items-start justify-between mb-3">
            <div className="p-2 rounded-lg bg-emerald-50">
              <DollarSign className="h-5 w-5 text-emerald-600" />
            </div>
            <TrendingUp className="h-4 w-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
          </div>
          <p className="text-2xl md:text-3xl font-bold text-gray-900">{formatCurrency(stats.totalRevenue)}</p>
          <p className="text-sm font-semibold text-gray-700 mt-1">Total Revenue</p>
          <p className="text-xs text-gray-500 hidden md:block">{stats.paidCount} invoices paid</p>
        </div>

        <div className="bg-white rounded-xl border-2 border-amber-200 p-4 md:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.1)] transition-all duration-300 cursor-pointer group">
          <div className="flex items-start justify-between mb-3">
            <div className="p-2 rounded-lg bg-amber-50">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <TrendingUp className="h-4 w-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
          </div>
          <p className="text-2xl md:text-3xl font-bold text-gray-900">{formatCurrency(stats.totalPending)}</p>
          <p className="text-sm font-semibold text-gray-700 mt-1">Pending Amount</p>
          <p className="text-xs text-gray-500 hidden md:block">{stats.pendingCount} invoices pending</p>
        </div>

        <div className="bg-white rounded-xl border-2 border-rose-200 p-4 md:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.1)] transition-all duration-300 cursor-pointer group">
          <div className="flex items-start justify-between mb-3">
            <div className="p-2 rounded-lg bg-rose-50">
              <AlertTriangle className="h-5 w-5 text-rose-600" />
            </div>
            <TrendingUp className="h-4 w-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
          </div>
          <p className="text-2xl md:text-3xl font-bold text-gray-900">{formatCurrency(stats.totalOverdue)}</p>
          <p className="text-sm font-semibold text-gray-700 mt-1">Overdue Amount</p>
          <p className="text-xs text-gray-500 hidden md:block">{stats.overdueCount} invoices overdue</p>
        </div>

        <div className="bg-white rounded-xl border-2 border-blue-200 p-4 md:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.1)] transition-all duration-300 cursor-pointer group">
          <div className="flex items-start justify-between mb-3">
            <div className="p-2 rounded-lg bg-blue-50">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <TrendingUp className="h-4 w-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
          </div>
          <p className="text-2xl md:text-3xl font-bold text-gray-900">{stats.invoiceCount}</p>
          <p className="text-sm font-semibold text-gray-700 mt-1">Total Invoices</p>
          <p className="text-xs text-gray-500 hidden md:block">{stats.collectionRate.toFixed(0)}% collection rate</p>
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-6">
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4 md:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:shadow-md transition-all duration-300">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
              <ArrowUpRight className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-lg md:text-2xl font-bold text-gray-900">{stats.paidCount}</p>
              <p className="text-sm text-gray-600">Invoices Paid</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border-2 border-gray-200 p-4 md:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:shadow-md transition-all duration-300">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
              <Activity className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-lg md:text-2xl font-bold text-gray-900">{stats.avgPaymentTime}d</p>
              <p className="text-sm text-gray-600">Avg. Payment Time</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border-2 border-gray-200 p-4 md:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:shadow-md transition-all duration-300">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-lg md:text-2xl font-bold text-gray-900">{clientsWithStats.length}</p>
              <p className="text-sm text-gray-600">Total Clients</p>
            </div>
          </div>
        </div>
      </div>

      {/* Revenue Chart */}
      <div className="bg-white rounded-xl border-2 border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.06)] mb-6">
        <div className="p-4 md:p-5 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-sidebar-primary" />
            Revenue Overview
          </h3>
          <p className="text-sm text-muted-foreground">Monthly revenue tracking</p>
        </div>
        <div className="p-4 md:p-5">
          <RevenueChart invoices={invoices} />
        </div>
      </div>

      {/* Tabs Section */}
      <div className="bg-white rounded-xl border-2 border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <Tabs defaultValue="invoices" className="w-full">
          <div className="p-4 md:p-5 border-b border-gray-100">
            <TabsList className="grid w-full grid-cols-3 lg:w-[400px] h-9 md:h-10 bg-gray-100 p-1">
              <TabsTrigger value="invoices" className="gap-1 md:gap-2 text-xs md:text-sm">
                <FileText className="h-3 w-3 md:h-4 md:w-4" />
                <span className="hidden sm:inline">Invoices</span>
                <span className="sm:hidden">Inv</span>
              </TabsTrigger>
              <TabsTrigger value="clients" className="gap-1 md:gap-2 text-xs md:text-sm">
                <Users className="h-3 w-3 md:h-4 md:w-4" />
                <span className="hidden sm:inline">Clients</span>
                <span className="sm:hidden">Cli</span>
              </TabsTrigger>
              <TabsTrigger value="payments" className="gap-1 md:gap-2 text-xs md:text-sm">
                <DollarSign className="h-3 w-3 md:h-4 md:w-4" />
                <span className="hidden sm:inline">Payments</span>
                <span className="sm:hidden">Pay</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="p-4 md:p-5">
            <TabsContent value="invoices" className="space-y-4 mt-0">
              <InvoiceList invoices={invoices} onViewInvoice={handleViewInvoice} onEditInvoice={handleEditInvoice} onDeleteInvoice={handleDeleteInvoice} onSendInvoice={handleSendInvoice} onDownloadInvoice={handleDownloadInvoice} />
            </TabsContent>

            <TabsContent value="clients" className="space-y-4 mt-0">
              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1">
                  <div className="sticky top-24">
                    <h3 className="text-lg font-semibold mb-4 text-gray-900">Client Directory</h3>
                    <ClientList clients={clientsWithStats} onSelectClient={handleSelectClient} selectedClientId={selectedClient?.id} />
                  </div>
                </div>
                <div className="lg:col-span-2">
                  {selectedClient ? (
                    <div className="space-y-6">
                      <div className="rounded-xl border-2 border-gray-200 bg-white p-4 md:p-6">
                        <h3 className="text-lg font-semibold mb-4 text-gray-900">
                          {selectedClient.name}'s Invoices
                        </h3>
                        {clientInvoices.length > 0 ? (
                          <InvoiceList invoices={clientInvoices} onViewInvoice={handleViewInvoice} onEditInvoice={handleEditInvoice} onDeleteInvoice={handleDeleteInvoice} onSendInvoice={handleSendInvoice} onDownloadInvoice={handleDownloadInvoice} />
                        ) : (
                          <p className="text-muted-foreground text-center py-8">
                            No invoices found for this client
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-64 rounded-xl border-2 border-gray-200 bg-white">
                      <div className="text-center">
                        <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                        <p className="text-muted-foreground font-medium">
                          Select a client to view their invoices
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="payments" className="space-y-4 mt-0">
              <div className="grid lg:grid-cols-2 gap-6">
                <div className="rounded-xl border-2 border-gray-200 bg-white p-4 md:p-6">
                  <h3 className="text-lg font-semibold mb-4 text-gray-900">Recent Payments</h3>
                  <PaymentHistory payments={payments} invoices={invoices} />
                </div>
                <div className="space-y-6">
                  <div className="rounded-xl border-2 border-gray-200 bg-white p-4 md:p-6">
                    <h3 className="text-lg font-semibold mb-4 text-gray-900">Payment Summary</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 border-2 border-emerald-100">
                        <span className="text-sm font-medium text-gray-700">Total Received</span>
                        <span className="text-lg font-bold text-emerald-600">
                          {formatCurrency(payments.reduce((sum, p) => sum + p.amount, 0))}
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50 border-2 border-amber-100">
                        <span className="text-sm font-medium text-gray-700">Pending</span>
                        <span className="text-lg font-bold text-amber-600">
                          {formatCurrency(stats.totalPending)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-rose-50 border-2 border-rose-100">
                        <span className="text-sm font-medium text-gray-700">Overdue</span>
                        <span className="text-lg font-bold text-rose-600">
                          {formatCurrency(stats.totalOverdue)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border-2 border-gray-200 bg-white p-4 md:p-6">
                    <h3 className="text-lg font-semibold mb-4 text-gray-900">Payment Methods</h3>
                    <div className="space-y-3">
                      {['Bank Transfer', 'Credit Card', 'PayPal', 'Cash', 'Check'].map((method) => {
                        const count = payments.filter(p => p.method === method.toLowerCase().replace(' ', '_')).length;
                        return (
                          <div key={method} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 transition-colors">
                            <span className="text-sm font-medium text-gray-700">{method}</span>
                            <span className="text-sm font-semibold text-gray-600">
                              {count} {count !== 1 ? 'payments' : 'payment'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Modals */}
      <InvoiceDetailModal invoice={selectedInvoice} open={isDetailOpen} onOpenChange={setIsDetailOpen} onEdit={handleEditInvoice} onSend={handleSendInvoice} onDownload={handleDownloadInvoice} onMarkAsPaid={handleMarkAsPaid} onRecordPayment={handleRecordPayment} />
      <CreateInvoiceModal open={isCreateOpen} onOpenChange={handleCreateModalClose} clients={clientsWithStats} onSave={handleSaveInvoice} onSaveAndSend={handleSaveAndSend} editInvoice={editInvoice} />
      <AddPaymentModal invoice={paymentInvoice} open={isPaymentOpen} onOpenChange={setIsPaymentOpen} onPaymentAdded={handleAddPayment} />
    </>
  );
}
