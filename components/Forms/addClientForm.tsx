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
import { Button } from "../ui/button"
import { Loader2, Trash2 } from "lucide-react"
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

const AddClientForm = ({ id }: { id?: string }) => {

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
            alert("Client saved successfully")
            setLoading(false)
            router.back()
        } catch (error) {
            console.error(error)
            alert("Failed to save client")
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
            alert("Client updated successfully")
            setLoading(false)
            router.back()
        } catch (error) {
            console.error(error)
            alert("Failed to update client")
            setLoading(false)
        }
    }

    return (
        <div className="flex flex-col bg-background p-4 rounded-2xl shodow-sm gap-y-6">
            <h2 className="text-lg font-semibold mb-2">Basic Details</h2>
            <div className="flex gap-x-8">
                <div className="flex flex-col gap-y-2">
                    <Label>Salutation</Label>
                    <Select
                        value={client.salutation}
                        onValueChange={(value) => setClient({ ...client, salutation: value })}
                        >
                        <SelectTrigger className="border border-gray-200 bg-gray-50">
                            <SelectValue placeholder="Select salutation" />
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
                <div className="flex flex-col gap-y-2 w-[30%]">
                    <Label>Name <span className="text-red-500"> * </span></Label>
                    <Input value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} className="border border-gray-200 bg-gray-50" />
                </div>
                <div className="flex flex-col gap-y-2 w-[30%]">
                    <Label>Company</Label>
                    <Input value={client.company} onChange={(e) => setClient({ ...client, company: e.target.value })} className="border border-gray-200 bg-gray-50" />
                </div>
            </div>

            <div className="flex gap-x-8">
                <div className="flex flex-col gap-y-2 w-1/2">
                    <Label>Group</Label>
                    <Input value={client.group} onChange={(e) => setClient({ ...client, group: e.target.value })} className="border border-gray-200 bg-gray-50" />
                </div>
                <div className="flex flex-col gap-y-2 w-1/2">
                    <Label>Email <span className="text-red-500"> * </span></Label>
                    <Input value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} className="border border-gray-200 bg-gray-50" />
                </div>
            </div>

            <div className="flex gap-x-8">
                <div className="flex flex-col gap-y-2 w-1/2">
                    <Label>Contact <span className="text-red-500"> * </span></Label>
                    <Input value={client.contact} onChange={(e) => setClient({ ...client, contact: e.target.value })} className="border border-gray-200 bg-gray-50" />
                </div>
                <div className="flex flex-col gap-y-2 w-1/2">
                    <Label>Contact Alt</Label>
                    <Input value={client.contactAlt} onChange={(e) => setClient({ ...client, contactAlt: e.target.value })} className="border border-gray-200 bg-gray-50" />
                </div>
            </div>

            <div className="flex gap-x-8">
                <div className="flex flex-col gap-y-2 w-1/2">
                    <Label>GSTIN</Label>
                    <Input value={client.gstin} onChange={(e) => setClient({ ...client, gstin: e.target.value })} className="border border-gray-200 bg-gray-50" />
                </div>
            </div>

            <h2 className="text-lg font-semibold my-2">Primary Address</h2>
            <div className="flex gap-x-8">
                <div className="flex flex-col gap-y-2 w-1/2">
                    <Label>Building</Label>
                    <Input value={client.address.building} onChange={(e) => setClient({ ...client, address: { ...client.address, building: e.target.value } })} className="border border-gray-200 bg-gray-50" />
                </div>
                <div className="flex flex-col gap-y-2 w-1/2">
                    <Label>Street</Label>
                    <Input value={client.address.street} onChange={(e) => setClient({ ...client, address: { ...client.address, street: e.target.value } })} className="border border-gray-200 bg-gray-50" />
                </div>
            </div>

            <div className="flex gap-x-8">
                <div className="flex flex-col gap-y-2 w-1/2">
                    <Label>City</Label>
                    <Input value={client.address.city} onChange={(e) => setClient({ ...client, address: { ...client.address, city: e.target.value } })} className="border border-gray-200 bg-gray-50" />
                </div>
                <div className="flex flex-col gap-y-2 w-1/2">
                    <Label>District</Label>
                    <Input value={client.address.district} onChange={(e) => setClient({ ...client, address: { ...client.address, district: e.target.value } })} className="border border-gray-200 bg-gray-50" />
                </div>
            </div>

            <div className="flex gap-x-8">
                <div className="flex flex-col gap-y-2 w-1/2">
                    <Label>State</Label>
                    <Input value={client.address.state} onChange={(e) => setClient({ ...client, address: { ...client.address, state: e.target.value } })} className="border border-gray-200 bg-gray-50" />
                </div>
                <div className="flex flex-col gap-y-2 w-1/2">
                    <Label>Pincode</Label>
                    <Input value={client.address.pincode} onChange={(e) => setClient({ ...client, address: { ...client.address, pincode: e.target.value } })} className="border border-gray-200 bg-gray-50" />
                </div>
            </div>

            <div className="flex gap-x-8">
                <div className="flex flex-col gap-y-2 w-1/2">
                    <Label>Country</Label>
                    <Input value={client.address.country} onChange={(e) => setClient({ ...client, address: { ...client.address, country: e.target.value } })} className="border border-gray-200 bg-gray-50" />
                </div>
            </div>

            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Custom Fields</h2>
                <Button onClick={() => setClient({ ...client, customFields: [...client.customFields, { name: "", value: "" } ] })} variant="outline">Add Custom Field</Button>
            </div>
            <hr className="border-gray-200 mb-2 -mt-4" />
            {
                client.customFields.map((customField, index) => (
                    <div key={index} className="flex gap-x-8 items-end">
                        <div className="flex flex-col gap-y-2 w-1/2">
                            <Label>Key</Label>
                            <Input value={customField.name} onChange={(e) => setClient({ ...client, customFields: client.customFields.map((cf, i) => i === index ? { ...cf, name: e.target.value } : cf) })} className="border border-gray-200 bg-gray-50" />
                        </div>
                        <div className="flex flex-col gap-y-2 w-1/2">
                            <Label>Value</Label>
                            <Input value={customField.value} onChange={(e) => setClient({ ...client, customFields: client.customFields.map((cf, i) => i === index ? { ...cf, value: e.target.value } : cf) })} className="border border-gray-200 bg-gray-50" />
                        </div>
                        <Button onClick={() => setClient({ ...client, customFields: client.customFields.filter((_, i) => i !== index) })} variant="destructive"><Trash2 /></Button>
                    </div>
                ))
            }

            <Button onClick={id ? handleUpdateClient : handleSaveClient} className="ms-auto" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? "Saving..." : id ? "Update Client" : "Save Client"}
            </Button>
        </div>
    )
}
export default AddClientForm