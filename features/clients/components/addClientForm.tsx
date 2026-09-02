"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Loader2, Trash2, User, Phone, MapPin, FileText, Plus } from "lucide-react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

interface CustomField {
    name: string;
    value: string;
}

interface Client {
    salutation: string;
    name: string;
    company: string;
    group: string;
    email: string;
    contact: string;
    contactAlt: string;
    gstin: string;
    address: {
        building: string;
        street: string;
        city: string;
        district: string;
        state: string;
        pincode: string;
        country: string;
    };
    customFields: CustomField[];
    createdAt: Date;
    updatedAt: Date;
}

const AddClientForm = ({ id, linkCaseId }: { id?: string; linkCaseId?: string }) => {

    const [client, setClient] = useState<Client>({
        salutation: "mr",
        name: "",
        company: "",
        group: "",
        email: "",
        contact: "",
        contactAlt: "",
        gstin: "",
        address: {
            building: "",
            street: "",
            city: "",
            district: "",
            state: "",
            pincode: "",
            country: ""
        },
        customFields: [{ name: "", value: "" }],
        createdAt: new Date(),
        updatedAt: new Date(),
    })
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    useEffect(() => {
        if (id) {
            const fetchClient = async () => {
                const response = await fetch(`/api/userdetails/clients?id=${id}`);
                const data = await response.json();
                const clientData = data.client

                const cleanedData: Client = {
                    ...client,
                    ...clientData,
                    address: {
                    ...client.address,
                    ...(clientData.address || {}),
                    },
                    customFields: Array.isArray(clientData.customFields)
                    ? clientData.customFields.map((f: any) => ({
                        name: f.name || "",
                        value: f.value || "",
                        }))
                    : [],
                };

                setClient(cleanedData);
            }
            fetchClient()
        }
    }, [id])

    const handleSaveClient = async () => {
        try {
            setLoading(true)
            const response = await fetch("/api/userdetails/clients", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(client),
            })
            if (!response.ok) {
                throw new Error("Failed to save client")
            }
            const data = await response.json()

            // Auto-link to case if linkCaseId was provided
            if (linkCaseId && data.clientId) {
                await fetch(`/api/userdetails/cases?caseId=${encodeURIComponent(linkCaseId)}&clientId=${encodeURIComponent(data.clientId)}`, {
                    method: "PUT",
                })
            }

            setLoading(false)
            router.back()
        } catch (error) {
            console.error(error)
            setLoading(false)
        }
    }

    const handleUpdateClient = async () => {
        try {
            setLoading(true)
            const response = await fetch(`/api/userdetails/clients?id=${id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(client),
            })
            if (!response.ok) {
                throw new Error("Failed to update client")
            }
            setLoading(false)
            router.back()
        } catch (error) {
            console.error(error)
            setLoading(false)
        }
    }

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Section 1: Basic Details */}
            <div className="bg-white rounded-xl border-2 border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.06)] p-6">
                <div className="flex items-center gap-3 mb-5">
                    <div className="p-2.5 rounded-lg bg-blue-50">
                        <User className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Basic Details</h2>
                        <p className="text-sm text-gray-500">Client&apos;s personal information</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-y-2">
                        <Label className="font-semibold text-gray-700">Salutation</Label>
                        <Select
                            value={client.salutation}
                            onValueChange={(value) => setClient({ ...client, salutation: value })}
                        >
                            <SelectTrigger className="border-2 border-gray-200 bg-white h-10">
                                <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="mr">Mr.</SelectItem>
                                <SelectItem value="mrs">Mrs.</SelectItem>
                                <SelectItem value="ms">Ms.</SelectItem>
                                <SelectItem value="miss">Miss.</SelectItem>
                                <SelectItem value="dr">Dr.</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-col gap-y-2">
                        <Label className="font-semibold text-gray-700">Name <span className="text-red-500">*</span></Label>
                        <Input value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} className="border-2 border-gray-200 bg-white h-10" placeholder="Full name" />
                    </div>
                    <div className="flex flex-col gap-y-2">
                        <Label className="font-semibold text-gray-700">Company</Label>
                        <Input value={client.company} onChange={(e) => setClient({ ...client, company: e.target.value })} className="border-2 border-gray-200 bg-white h-10" placeholder="Company name" />
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div className="flex flex-col gap-y-2">
                        <Label className="font-semibold text-gray-700">Group</Label>
                        <Input value={client.group} onChange={(e) => setClient({ ...client, group: e.target.value })} className="border-2 border-gray-200 bg-white h-10" placeholder="Client group (optional)" />
                    </div>
                    <div className="flex flex-col gap-y-2">
                        <Label className="font-semibold text-gray-700">GSTIN</Label>
                        <Input value={client.gstin} onChange={(e) => setClient({ ...client, gstin: e.target.value })} className="border-2 border-gray-200 bg-white h-10" placeholder="GST number (optional)" />
                    </div>
                </div>
            </div>

            {/* Section 2: Contact Details */}
            <div className="bg-white rounded-xl border-2 border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.06)] p-6">
                <div className="flex items-center gap-3 mb-5">
                    <div className="p-2.5 rounded-lg bg-brand-50">
                        <Phone className="h-5 w-5 text-brand-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Contact Information</h2>
                        <p className="text-sm text-gray-500">How to reach this client</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-y-2">
                        <Label className="font-semibold text-gray-700">Email <span className="text-red-500">*</span></Label>
                        <Input value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} className="border-2 border-gray-200 bg-white h-10" placeholder="client@email.com" type="email" />
                    </div>
                    <div className="flex flex-col gap-y-2">
                        <Label className="font-semibold text-gray-700">Phone <span className="text-red-500">*</span></Label>
                        <Input value={client.contact} onChange={(e) => setClient({ ...client, contact: e.target.value })} className="border-2 border-gray-200 bg-white h-10" placeholder="+91 98765 43210" />
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div className="flex flex-col gap-y-2">
                        <Label className="font-semibold text-gray-700">Alternate Phone</Label>
                        <Input value={client.contactAlt} onChange={(e) => setClient({ ...client, contactAlt: e.target.value })} className="border-2 border-gray-200 bg-white h-10" placeholder="Alternate number (optional)" />
                    </div>
                </div>
            </div>

            {/* Section 3: Address */}
            <div className="bg-white rounded-xl border-2 border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.06)] p-6">
                <div className="flex items-center gap-3 mb-5">
                    <div className="p-2.5 rounded-lg bg-orange-50">
                        <MapPin className="h-5 w-5 text-orange-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Address</h2>
                        <p className="text-sm text-gray-500">Client&apos;s primary address</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-y-2">
                        <Label className="font-semibold text-gray-700">Building</Label>
                        <Input value={client.address.building} onChange={(e) => setClient({ ...client, address: { ...client.address, building: e.target.value } })} className="border-2 border-gray-200 bg-white h-10" placeholder="Building / House No." />
                    </div>
                    <div className="flex flex-col gap-y-2">
                        <Label className="font-semibold text-gray-700">Street</Label>
                        <Input value={client.address.street} onChange={(e) => setClient({ ...client, address: { ...client.address, street: e.target.value } })} className="border-2 border-gray-200 bg-white h-10" placeholder="Street / Locality" />
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div className="flex flex-col gap-y-2">
                        <Label className="font-semibold text-gray-700">City</Label>
                        <Input value={client.address.city} onChange={(e) => setClient({ ...client, address: { ...client.address, city: e.target.value } })} className="border-2 border-gray-200 bg-white h-10" placeholder="City" />
                    </div>
                    <div className="flex flex-col gap-y-2">
                        <Label className="font-semibold text-gray-700">District</Label>
                        <Input value={client.address.district} onChange={(e) => setClient({ ...client, address: { ...client.address, district: e.target.value } })} className="border-2 border-gray-200 bg-white h-10" placeholder="District" />
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    <div className="flex flex-col gap-y-2">
                        <Label className="font-semibold text-gray-700">State</Label>
                        <Input value={client.address.state} onChange={(e) => setClient({ ...client, address: { ...client.address, state: e.target.value } })} className="border-2 border-gray-200 bg-white h-10" placeholder="State" />
                    </div>
                    <div className="flex flex-col gap-y-2">
                        <Label className="font-semibold text-gray-700">Pincode</Label>
                        <Input value={client.address.pincode} onChange={(e) => setClient({ ...client, address: { ...client.address, pincode: e.target.value } })} className="border-2 border-gray-200 bg-white h-10" placeholder="110001" />
                    </div>
                    <div className="flex flex-col gap-y-2">
                        <Label className="font-semibold text-gray-700">Country</Label>
                        <Input value={client.address.country} onChange={(e) => setClient({ ...client, address: { ...client.address, country: e.target.value } })} className="border-2 border-gray-200 bg-white h-10" placeholder="India" />
                    </div>
                </div>
            </div>

            {/* Section 4: Custom Fields */}
            <div className="bg-white rounded-xl border-2 border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.06)] p-6">
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-lg bg-violet-50">
                            <FileText className="h-5 w-5 text-violet-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Custom Fields</h2>
                            <p className="text-sm text-gray-500">Add any extra details you need</p>
                        </div>
                    </div>
                    <Button onClick={() => setClient({ ...client, customFields: [...client.customFields, { name: "", value: "" } ] })} variant="outline" size="sm" className="border-2 gap-1">
                        <Plus className="h-3.5 w-3.5" /> Add Field
                    </Button>
                </div>
                {client.customFields.length > 0 ? (
                    <div className="space-y-3">
                        {client.customFields.map((customField, index) => (
                            <div key={index} className="flex gap-4 items-end">
                                <div className="flex flex-col gap-y-2 flex-1">
                                    <Label className="font-semibold text-gray-700">Key</Label>
                                    <Input value={customField.name} onChange={(e) => setClient({ ...client, customFields: client.customFields.map((cf, i) => i === index ? { ...cf, name: e.target.value } : cf) })} className="border-2 border-gray-200 bg-white h-10" placeholder="Field name" />
                                </div>
                                <div className="flex flex-col gap-y-2 flex-1">
                                    <Label className="font-semibold text-gray-700">Value</Label>
                                    <Input value={customField.value} onChange={(e) => setClient({ ...client, customFields: client.customFields.map((cf, i) => i === index ? { ...cf, value: e.target.value } : cf) })} className="border-2 border-gray-200 bg-white h-10" placeholder="Field value" />
                                </div>
                                <Button onClick={() => setClient({ ...client, customFields: client.customFields.filter((_, i) => i !== index) })} variant="destructive" size="icon" className="shrink-0 h-10 w-10"><Trash2 className="h-4 w-4" /></Button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-gray-400 text-center py-4">No custom fields added yet</p>
                )}
            </div>

            {/* Save Button */}
            <div className="flex justify-end pb-6">
                <Button onClick={id ? handleUpdateClient : handleSaveClient} size="lg" className="px-8 h-11 text-base shadow-md" disabled={loading}>
                    {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    {loading ? "Saving..." : id ? "Update Client" : "Save Client"}
                </Button>
            </div>
        </div>
    )
}
export default AddClientForm