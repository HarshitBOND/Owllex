"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Client } from "@/app/my-clients/page"
import ClientListView from "@/features/clients/components/clientListView"
import { useState, useEffect } from 'react'
import { Label } from "@/components/ui/label"
import ComboBox, { DropdownItem } from "@/components/common/comboBox"
import { Button } from "@/components/ui/button"
import { Loader2, UserPlus, Link2, Users } from "lucide-react"
import { useRouter } from "next/navigation"

const capitalize = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1)
}

const ContactsList = ({contacts, loading, setTrigger, id}: {contacts: Client[], loading: boolean, setTrigger: React.Dispatch<React.SetStateAction<number>>, id: string}) => {
    const router = useRouter();
    const [clients, setClients] = useState<DropdownItem[]>([]);
    const [selectedClient, setSelectedClient] = useState<string>("");
    const [updating, setUpdating] = useState(false);
    const [open, setOpen] = useState(false);
    
    useEffect(() => {
        const fetchClients = async () => {
            const response = await fetch(`/api/userdetails/clients`)
            const data = await response.json()
            const clients = (data.userClients?.clients ?? []).map((client: Client) => {
                return {
                    label: `${capitalize(client.salutation)} ${client.name}`,
                    value: client._id
                }
            })
            setClients(clients)
        }
        fetchClients()
    }, [])
    
    const handleLinkClient = async () => {
        try {
            setUpdating(true);
            const response = await fetch(`/api/userdetails/cases?caseId=${id}&clientId=${selectedClient}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
            });
            const data = await response.json();
            if (data.success) {
                setTrigger(prev => prev + 1);
                setOpen(false);
                setSelectedClient("");
            }
        } catch (error) {
            console.error(error);
        } finally {
            setUpdating(false);
        }
    }
    
    return (
        <div className="space-y-4">
            {/* Header with actions */}
            <div className="bg-card rounded-xl border border-border p-5">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-primary" />
                        <h2 className="font-semibold text-base text-foreground">Client Contacts</h2>
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                            {contacts.length} linked
                        </span>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/my-clients/add?linkCase=${id}`)}
                        className="gap-1.5"
                    >
                        <UserPlus className="h-4 w-4" />
                        Create New Client
                    </Button>
                </div>

                {/* Link existing client */}
                <div className="flex flex-wrap items-end gap-3 p-4 bg-muted/50 rounded-lg border border-border">
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">Link Existing Client</Label>
                        <ComboBox 
                            dropdownItems={clients}
                            type="Client"
                            value={selectedClient}
                            setValue={setSelectedClient}
                        />
                    </div>
                    {selectedClient && (
                        <AlertDialog open={open} onOpenChange={setOpen}>
                            <AlertDialogTrigger asChild>
                                <Button
                                    size="sm"
                                    variant={contacts.map((client: Client) => client._id).includes(selectedClient) ? "outline" : "default"}
                                    disabled={updating || contacts.map((client: Client) => client._id).includes(selectedClient)}
                                    onClick={() => setOpen(true)}
                                    className="gap-1.5"
                                >
                                    <Link2 className="h-3.5 w-3.5" />
                                    {contacts.map((client: Client) => client._id).includes(selectedClient) ? "Already linked" : "Link Client"}
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Link Client to Case</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will create a two-way link between the client and this case. The client will appear in the case contacts and the case will appear in the client&apos;s profile.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={(e) => {e.preventDefault(); handleLinkClient()}} disabled={updating}>
                                        {updating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        {updating ? "Linking..." : "Link Client"}
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                </div>
            </div>

            {/* Linked clients list */}
            <ClientListView contacts={contacts} clientsLoading={loading} setTrigger={setTrigger} />
        </div>
    )
}
export default ContactsList