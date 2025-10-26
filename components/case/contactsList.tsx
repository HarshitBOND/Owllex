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
import ClientListView from "../client/clientListView"
import { useState, useEffect } from 'react'
import { Label } from "../ui/label"
import ComboBox, { DropdownItem } from "../common/comboBox"
import { Button } from "../ui/button"
import { Loader2 } from "lucide-react"

const capitalize = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1)
}

const ContactsList = ({contacts, loading, setTrigger, id}: {contacts: Client[], loading: boolean, setTrigger: React.Dispatch<React.SetStateAction<number>>, id: string}) => {
    
    const [clients, setClients] = useState<DropdownItem[]>([]);
    const [selectedClient, setSelectedClient] = useState<string>("");
    const [selectedClientName, setSelectedClientName] = useState<string>("");
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
            console.log(data)
            if (data.success) {
                alert("Client linked successfully");
                setTrigger(prev => prev + 1);
                setOpen(false);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setUpdating(false);
        }
    }
    
    return (
        <div>
            <h1 className="font-semibold text-lg my-2 ms-2">Link Client to this case</h1>
            <div className="flex gap-x-8 ms-2 my-4">
                <Label>Assign To Client</Label>
                <ComboBox 
                    dropdownItems={clients}
                    type="Client"
                    value={selectedClient}
                    setValue={setSelectedClient}
                />
            {selectedClient && (
                <AlertDialog open={open} onOpenChange={setOpen}>
                    <AlertDialogTrigger asChild>
                        <Button className="-ms-6" variant="link" disabled={updating || contacts.map((client: Client) => client._id).includes(selectedClient)} onClick={() => setOpen(true)}>
                            {contacts.map((client: Client) => client._id).includes(selectedClient) ? "Client already linked" : "Link this Client"}
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Link Client</AlertDialogTitle>
                            <AlertDialogDescription>
                                Are you sure you want to link this client to this case?
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
            <ClientListView clients={contacts} clientsLoading={loading} setTrigger={setTrigger} />
        </div>
    )
}
export default ContactsList