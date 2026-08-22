"use client"

import {useState, useEffect} from "react"
import { CaseApi } from "./addCaseForm"
import { Label } from "@/components/ui/label"
import ComboBox from "@/components/common/comboBox"
import { DropdownItem } from "@/components/common/comboBox"
import { Client } from "@/app/my-clients/page"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

const capitalize = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1)
}

const AssignAddCaseForm = ({ id }: { id: string }) => {

    const [caseData, setCaseData] = useState<CaseApi | null>(null)
    const [clients, setClients] = useState<DropdownItem[]>([])
    const [selectedClient, setSelectedClient] = useState<string>("")
    const [fileNumber, setFileNumber] = useState<string>("")
    const [loading, setLoading] = useState<boolean>(false)
    const [error, setError] = useState<string>("")
    const router = useRouter()
    
    useEffect(() => {
        const fetchCaseData = async () => {
            const response = await fetch(`/api/public/cases?id=${id}`)
            const data = await response.json()
            setCaseData(data.caseFound)
        }
        const fetchClients = async () => {
            const response = await fetch(`/api/userdetails/clients`)
            const data = await response.json()
            const clients = (data.userClients?.clients ?? []).map((client: Client) => {
                return {
                    label: `${client.salutation ? capitalize(client.salutation) + ' ' : ''}${client.name}`,
                    value: client._id
                }
            })
            setClients(clients)
        }
        fetchClients()
        fetchCaseData()
    }, [id])

    const handleRegisterCase = async () => {
        setLoading(true)
        setError("")
        try {
            const response = await fetch(`/api/userdetails/cases`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    caseId: id,
                    client: selectedClient || null,
                    fileNumber: fileNumber,
                }),
            })
            const data = await response.json()
            if (data.success) {
                router.push("/case-tracking")
            } else {
                setError(data.error || "Failed to register case. Please try again.")
                setLoading(false)
            }
        } catch (err) {
            setError("Network error. Please check your connection and try again.")
            setLoading(false)
        }
    }

    return (
        <div className="bg-background p-4 rounded-md shadow-md">
            <div className="flex flex-col gap-y-2">
                <p>
                    <span className="font-semibold">Case No:</span> {caseData?.case_no.match(/^[A-Za-z().\s-]*\d+\/\d{4}/)?.[0]}
                </p>
                <p>
                    <span className="font-semibold">Case Title:</span> {caseData?.case_title}
                </p>
                <p className="text-muted-foreground break-words whitespace-pre-wrap">
                    <span className="font-semibold">Advocate:</span> {caseData?.advocate}
                </p>
                <p>
                    <span className="font-semibold">Case History:</span> <a href={caseData?.links[1]} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline cursor-pointer">View</a>
                </p>
                <p>
                    <span className="font-semibold">Forum:</span> Delhi High Court
                </p>
            </div>

            <hr className="my-6" />

            <div className="flex gap-x-8">
                <Label>Assign To Client <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <ComboBox 
                    dropdownItems={clients}
                    type="Client"
                    value={selectedClient}
                    setValue={setSelectedClient}
                />
            </div>

            <div className="flex gap-x-3 mt-4">
                <Label>Assign File Number</Label>
                <Input value={fileNumber} placeholder="Leave blank to automatically generate one" className="w-1/3 border-2 border-gray-200 bg-gray-50 placeholder:text-gray-400" onChange={(e) => setFileNumber(e.target.value)}/>
            </div>

            <hr className="my-6" />

            {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
                    {error}
                </div>
            )}

            <div className="flex gap-x-8">
                <Button onClick={handleRegisterCase} className="w-1/6 mb-3" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? "Registering..." : "Register Case"}
                </Button>
            </div>
        </div>
    )
}
export default AssignAddCaseForm