"use client"

import { Client } from '@/app/my-clients/page';
import { useState, useEffect, useMemo } from 'react';
import { Button } from '../ui/button';
import { useRouter } from 'next/navigation';
import { AlertPopup } from '../common/AlertPopup';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import NoteEditor from '../editor/Index';
import DisplayNotes from '../common/displayNotes';
import { Case } from '@/app/case-tracking/page';
import CasesListView from '../case/casesListView';
import { parseCourtDate } from '@/lib/utils';
import {
  Loader2, Phone, Mail, MapPin, Building, Calendar, Scale,
  FileText, Pencil, Trash2, ExternalLink, Clock, AlertCircle,
  Receipt, ClipboardList, User, Hash, ChevronRight
} from 'lucide-react';

export interface Note {
    _id: string;
    title: string;
    content: string;
    contentJson: any;
    createdAt: Date;
    updatedAt: Date;
    visibility: string;
}

const ClientView = ({id}: {id: string}) => {
    const [client, setClient] = useState<Client | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [trigger, setTrigger] = useState<number>(0)
    const [notes, setNotes] = useState<Note[]>([])
    const [cases, setCases] = useState<Case[]>([])
    const router = useRouter()

    useEffect(() => {
        const fetchClient = async () => {
            setLoading(true);
            try {
                const response = await fetch(`/api/userdetails/clients?id=${id}`);
                const data = await response.json();
                setClient(data.client);
                setNotes(data.client?.notes || []);
                setCases(data.client?.cases || []);
                setLoading(false);
            } catch (error) {
                console.error(error);
                setError("Failed to fetch client details");
                setLoading(false);
            }
        };
        fetchClient();
    }, [id, trigger]);

    const handleDeleteClient = (clientId: string) => {
        const deleteClient = async () => {
            const response = await fetch(`/api/userdetails/clients?id=${clientId}`, { method: "DELETE" })
            if (!response.ok) throw new Error("Failed to delete client")
            router.push("/my-clients")
        }
        deleteClient().catch(console.error)
    }

    const upcomingHearings = useMemo(() => {
        if (!cases?.length) return [];
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        return cases
            .filter((c: any) => { const d = parseCourtDate(c.courtDate); return d !== null && d >= now; })
            .sort((a: any, b: any) => {
                const da = parseCourtDate(a.courtDate)!;
                const db = parseCourtDate(b.courtDate)!;
                return da.getTime() - db.getTime();
            })
            .slice(0, 5)
            .map((c: any) => {
                const d = parseCourtDate(c.courtDate)!;
                return { ...c, daysUntil: Math.ceil((d.getTime() - now.getTime()) / 86400000), parsedDate: d };
            });
    }, [cases]);

    const initials = (client?.name || "U").split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
    const fullAddress = client?.address
        ? [client.address.building, client.address.street, client.address.city, client.address.district, client.address.state, client.address.pincode, client.address.country]
              .filter(Boolean).join(", ")
        : "";

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Loading client details...</p>
                </div>
            </div>
        );
    }

    if (error || !client) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="text-center">
                    <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
                    <p className="text-lg font-semibold text-foreground">Failed to load client</p>
                    <p className="text-sm text-muted-foreground mt-1">{error || "Client not found"}</p>
                    <Button variant="outline" className="mt-4" onClick={() => router.push("/my-clients")}>
                        Back to Clients
                    </Button>
                </div>
            </div>
        );
    }

    return (
    <div className='flex flex-col gap-y-5'>
        {/* Client Profile Header */}
        <div className='bg-card rounded-xl border border-border p-6'>
            <div className='flex flex-col sm:flex-row gap-5'>
                {/* Avatar & Name */}
                <div className='flex items-start gap-4 flex-1'>
                    <div className='w-16 h-16 rounded-full bg-primary/15 border-2 border-primary/40 flex items-center justify-center shrink-0'>
                        <span className='text-xl font-bold text-primary'>{initials}</span>
                    </div>
                    <div className='flex-1 min-w-0'>
                        <h1 className='text-2xl font-bold text-foreground'>
                            {client.salutation ? `${client.salutation.charAt(0).toUpperCase() + client.salutation.slice(1)}. ` : ""}{client.name}
                        </h1>
                        {client.company && (
                            <p className='text-sm text-muted-foreground flex items-center gap-1.5 mt-1'>
                                <Building className='h-4 w-4' /> {client.company}
                            </p>
                        )}
                        {client.group && (
                            <span className='inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400'>
                                {client.group}
                            </span>
                        )}
                    </div>
                </div>

                {/* Action Buttons */}
                <div className='flex items-start gap-2 shrink-0'>
                    <Button variant="outline" size="sm" onClick={() => router.push(`/my-clients/edit/${id}`)}>
                        <Pencil className='h-4 w-4 mr-1' /> Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => router.push("/invoices")}>
                        <Receipt className='h-4 w-4 mr-1' /> Invoice
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => router.push("/tasks")}>
                        <ClipboardList className='h-4 w-4 mr-1' /> Task
                    </Button>
                    <AlertPopup type="delete" handleFunction={() => handleDeleteClient(id)}>
                        <Button variant="destructive" size="sm">
                            <Trash2 className='h-4 w-4 mr-1' /> Delete
                        </Button>
                    </AlertPopup>
                </div>
            </div>

            {/* Quick Stats */}
            <div className='grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5'>
                <div className='p-3 bg-blue-50 dark:bg-blue-500/10 rounded-lg border border-blue-100 dark:border-blue-500/20'>
                    <div className='flex items-center gap-2'>
                        <Scale className='h-4 w-4 text-blue-600' />
                        <span className='text-lg font-bold text-blue-600'>{cases.length}</span>
                    </div>
                    <p className='text-xs text-blue-600/80 mt-0.5'>Linked Cases</p>
                </div>
                <div className='p-3 bg-amber-50 dark:bg-amber-500/10 rounded-lg border border-amber-100 dark:border-amber-500/20'>
                    <div className='flex items-center gap-2'>
                        <FileText className='h-4 w-4 text-amber-600' />
                        <span className='text-lg font-bold text-amber-600'>{notes.length}</span>
                    </div>
                    <p className='text-xs text-amber-600/80 mt-0.5'>Notes</p>
                </div>
                <div className='p-3 bg-violet-50 dark:bg-violet-500/10 rounded-lg border border-violet-100 dark:border-violet-500/20'>
                    <div className='flex items-center gap-2'>
                        <Clock className='h-4 w-4 text-violet-600' />
                        <span className='text-lg font-bold text-violet-600'>{upcomingHearings.length}</span>
                    </div>
                    <p className='text-xs text-violet-600/80 mt-0.5'>Upcoming Hearings</p>
                </div>
                <div className='p-3 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg border border-emerald-100 dark:border-emerald-500/20'>
                    <div className='flex items-center gap-2'>
                        <Calendar className='h-4 w-4 text-emerald-600' />
                        <span className='text-sm font-bold text-emerald-600'>
                            {client.createdAt ? new Date(client.createdAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "-"}
                        </span>
                    </div>
                    <p className='text-xs text-emerald-600/80 mt-0.5'>Client Since</p>
                </div>
            </div>
        </div>

        {/* Contact & Business Info */}
        <div className='grid grid-cols-1 md:grid-cols-2 gap-5'>
            {/* Contact Information */}
            <div className='bg-card rounded-xl border border-border p-5'>
                <div className='flex items-center gap-2 mb-4'>
                    <div className='p-1.5 rounded-lg bg-blue-50 dark:bg-blue-500/10'>
                        <Phone className='h-4 w-4 text-blue-600' />
                    </div>
                    <h3 className='text-sm font-semibold text-foreground'>Contact Information</h3>
                </div>
                <div className='space-y-3'>
                    <InfoItem icon={Mail} label="Email" value={client.email || "Not provided"} />
                    <InfoItem icon={Phone} label="Phone" value={client.contact || "Not provided"} />
                    {client.contactAlt && <InfoItem icon={Phone} label="Alt. Phone" value={client.contactAlt} />}
                    {fullAddress && <InfoItem icon={MapPin} label="Address" value={fullAddress} />}
                </div>
            </div>

            {/* Business Details */}
            <div className='bg-card rounded-xl border border-border p-5'>
                <div className='flex items-center gap-2 mb-4'>
                    <div className='p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10'>
                        <Building className='h-4 w-4 text-emerald-600' />
                    </div>
                    <h3 className='text-sm font-semibold text-foreground'>Business & Other Details</h3>
                </div>
                <div className='space-y-3'>
                    <InfoItem icon={Building} label="Company" value={client.company || "Not provided"} />
                    <InfoItem icon={Hash} label="GSTIN" value={client.gstin || "Not provided"} />
                    <InfoItem icon={User} label="Group" value={client.group || "No group"} />
                    {client.customFields?.filter(f => f.name).length > 0 && (
                        <div className='pt-2 border-t border-border'>
                            <p className='text-xs font-medium text-muted-foreground mb-2'>Custom Fields</p>
                            {client.customFields.filter(f => f.name).map((field, i) => (
                                <InfoItem key={i} icon={FileText} label={field.name} value={field.value || "-"} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* Upcoming Hearings Alert */}
        {upcomingHearings.length > 0 && (
            <div className='bg-card rounded-xl border border-violet-200 dark:border-violet-500/30 p-5'>
                <div className='flex items-center gap-2 mb-3'>
                    <Clock className='h-4 w-4 text-violet-600' />
                    <h3 className='text-sm font-semibold text-foreground'>Upcoming Hearings</h3>
                </div>
                <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2'>
                    {upcomingHearings.map((c: any, i: number) => (
                        <div
                            key={c._id || i}
                            className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all border ${
                                c.daysUntil <= 7
                                    ? "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 hover:border-red-300"
                                    : "bg-violet-50/50 dark:bg-violet-500/5 border-violet-100 dark:border-violet-500/20 hover:border-violet-200"
                            }`}
                            onClick={() => c._id && router.push(`/case-tracking/view/${c._id}`)}
                        >
                            <div className={`flex flex-col items-center justify-center rounded-lg px-2 py-1.5 min-w-[44px] ${
                                c.daysUntil <= 7 ? "bg-red-100 dark:bg-red-500/20" : "bg-violet-100 dark:bg-violet-500/20"
                            }`}>
                                <span className={`text-[10px] font-medium ${c.daysUntil <= 7 ? "text-red-600" : "text-violet-600"}`}>
                                    {c.parsedDate.toLocaleDateString('en-US', { month: 'short' })}
                                </span>
                                <span className={`text-sm font-bold ${c.daysUntil <= 7 ? "text-red-700" : "text-violet-700"}`}>
                                    {c.parsedDate.getDate()}
                                </span>
                            </div>
                            <div className='flex-1 min-w-0'>
                                <p className='font-medium text-xs text-foreground truncate'>{c.caseTitle || c.caseNo}</p>
                                <p className='text-[10px] text-muted-foreground truncate'>{c.courtName || 'Court not specified'}</p>
                                <div className='flex items-center gap-1 mt-0.5'>
                                    {c.daysUntil <= 7 && <AlertCircle className='h-3 w-3 text-red-500' />}
                                    <span className={`text-[10px] font-medium ${c.daysUntil <= 7 ? "text-red-600" : "text-muted-foreground"}`}>
                                        {c.daysUntil === 0 ? "Today!" : c.daysUntil === 1 ? "Tomorrow" : `In ${c.daysUntil} days`}
                                    </span>
                                </div>
                            </div>
                            <ChevronRight className='h-4 w-4 text-muted-foreground shrink-0 mt-1' />
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* Tabs Section */}
        <Tabs defaultValue="cases" className="w-full">
          <TabsList className='gap-x-1 bg-muted/50 p-1 rounded-lg'>
            <TabsTrigger value="cases" className='gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm'>
                <Scale className='h-3.5 w-3.5' /> Cases ({cases.length})
            </TabsTrigger>
            <TabsTrigger value="notes" className='gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm'>
                <FileText className='h-3.5 w-3.5' /> Notes ({notes.length})
            </TabsTrigger>
            <TabsTrigger value="activity" className='gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm'>
                <Clock className='h-3.5 w-3.5' /> Activity
            </TabsTrigger>
          </TabsList>

          <TabsContent value="cases" className='mt-4'>
            <CasesListView cases={cases} loading={loading} clientView clientId={id} setTrigger={setTrigger} />
          </TabsContent>

          <TabsContent value="notes" className='mt-4'>
            <div className='bg-card rounded-xl border border-border p-5'>
                <NoteEditor />
                <DisplayNotes id={id} setTrigger={setTrigger} notes={notes} source="client" />
            </div>
          </TabsContent>

          <TabsContent value="activity" className='mt-4'>
            <div className='bg-card rounded-xl border border-border p-8 text-center'>
                <Clock className='h-10 w-10 text-muted-foreground/30 mx-auto mb-3' />
                <p className='text-sm font-medium text-foreground'>Activity Timeline</p>
                <p className='text-xs text-muted-foreground mt-1'>
                    Client created on {client.createdAt ? new Date(client.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "unknown date"}
                </p>
                {client.updatedAt && client.updatedAt !== client.createdAt && (
                    <p className='text-xs text-muted-foreground mt-1'>
                        Last updated on {new Date(client.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                    </p>
                )}
            </div>
          </TabsContent>
        </Tabs>
    </div>
  )
}

const InfoItem = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) => (
    <div className='flex items-start gap-2.5'>
        <Icon className='h-4 w-4 text-muted-foreground shrink-0 mt-0.5' />
        <div className='min-w-0'>
            <p className='text-xs text-muted-foreground'>{label}</p>
            <p className='text-sm text-foreground break-words'>{value}</p>
        </div>
    </div>
);

export default ClientView
