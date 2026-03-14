"use client"

import { Button } from "../ui/button"
import { AlertPopup } from "../common/AlertPopup"
import { LoaderCircle, Eye, Pencil, Trash2, Phone, Mail, Building, Scale, MoreHorizontal, ChevronRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { Client } from "@/app/my-clients/page"

interface ClientListViewProps {
    clients?: Client[];
    contacts?: Client[];
    clientsLoading: boolean;
    setTrigger: React.Dispatch<React.SetStateAction<number>>;
}

const ClientListView = ({ clients, contacts, clientsLoading, setTrigger }: ClientListViewProps) => {
    const router = useRouter()
    const data = clients || contacts || []

    const handleClientView = (clientId: string) => {
        router.push(`/my-clients/view/${clientId}`)
    }

    const handleDeleteClient = (clientId: string) => {
        const deleteClient = async () => {
            const response = await fetch(`/api/userdetails/clients?id=${clientId}`, { method: "DELETE" })
            if (!response.ok) throw new Error("Failed to delete client")
            setTrigger((prev) => prev + 1)
        }
        deleteClient().catch(console.error)
    }

    if (clientsLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-2">
                    <LoaderCircle className="text-primary animate-spin" size={24} />
                    <p className="text-sm text-muted-foreground">Loading clients...</p>
                </div>
            </div>
        )
    }

    if (data.length === 0) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-center">
                    <Scale className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No clients found</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-2">
            {data.map((client) => {
                const initials = (client.name || "U").split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
                const caseCount = (client as any).cases?.length || 0;

                return (
                    <div
                        key={client._id}
                        onClick={() => handleClientView(client._id)}
                        className="group bg-card rounded-lg border border-border p-4 cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all"
                    >
                        <div className="flex items-center gap-4">
                            {/* Avatar */}
                            <div className="shrink-0 w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                                <span className="text-sm font-semibold text-primary">{initials}</span>
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                                        {client.salutation ? `${client.salutation.charAt(0).toUpperCase() + client.salutation.slice(1)}. ` : ""}
                                        {client.name}
                                    </h3>
                                    {caseCount > 0 && (
                                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
                                            {caseCount} case{caseCount !== 1 ? "s" : ""}
                                        </span>
                                    )}
                                </div>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                                    {client.email && (
                                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                            <Mail className="h-3 w-3" /> {client.email}
                                        </span>
                                    )}
                                    {client.contact && (
                                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                            <Phone className="h-3 w-3" /> {client.contact}
                                        </span>
                                    )}
                                    {client.company && (
                                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                            <Building className="h-3 w-3" /> {client.company}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                <button
                                    onClick={() => handleClientView(client._id)}
                                    className="p-1.5 rounded-md hover:bg-muted transition-colors"
                                    title="View"
                                >
                                    <Eye className="h-4 w-4 text-muted-foreground" />
                                </button>
                                <button
                                    onClick={() => router.push(`/my-clients/edit/${client._id}`)}
                                    className="p-1.5 rounded-md hover:bg-muted transition-colors"
                                    title="Edit"
                                >
                                    <Pencil className="h-4 w-4 text-muted-foreground" />
                                </button>
                                <AlertPopup type="delete" handleFunction={() => handleDeleteClient(client._id)}>
                                    <button className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors" title="Delete">
                                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-500" />
                                    </button>
                                </AlertPopup>
                            </div>

                            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
export default ClientListView