"use client"

import {useState, useEffect} from "react"
import { CaseApi } from "./addCaseForm"
import { Label } from "../ui/label"
import ComboBox from "../common/comboBox"
import { DropdownItem } from "../common/comboBox"
import { Client } from "@/app/my-clients/page"

const capitalize = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1)
}

const AssignAddCaseForm = ({ id }: { id: string }) => {

    const [caseData, setCaseData] = useState<CaseApi | null>(null)
    const [clients, setClients] = useState<DropdownItem[]>([])
    const [clientsLoading, setClientsLoading] = useState(true)
    const [selectedClient, setSelectedClient] = useState<string>("")

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
                    label: `${capitalize(client.salutation)} ${client.name}`,
                    value: client._id
                }
            })
            setClients(clients)
            setClientsLoading(false)
        }
        fetchClients()
        fetchCaseData()
    }, [id])

    return (
        <div className="bg-background p-4 rounded-md shadow-md">
            <div>
                <p>
                    <span className="font-semibold">Case No:</span> {caseData?.case_no.match(/^[A-Za-z().\s-]*\d+\/\d{4}/)?.[0]}
                </p>
                <p>
                    <span className="font-semibold">Case Title:</span> {caseData?.case_title}
                </p>
                <p className="text-muted-foreground break-words whitespace-pre-wrap">
                    <span className="font-semibold">Advocate:</span> {caseData?.advocate}
                </p>
            </div>

            <hr className="my-4" />

            <div className="flex gap-x-4">
                <Label>Assign To Client</Label>
                <ComboBox 
                    dropdownItems={clients}
                    type="Client"
                    value={selectedClient}
                    setValue={setSelectedClient}
                />
            </div>
        </div>
    )
}
export default AssignAddCaseForm