"use client"

import { Input } from "@/components/ui/input"
import Sidebar from "@/components/dashboard/sidebar"
import Navbar from "@/components/dashboard/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import { useState, useEffect } from "react"
import { FileDown, FileUp, ArrowDownNarrowWide, FunnelPlus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUser } from "@clerk/nextjs"
import { redirect } from "next/navigation"
import { useRouter } from "next/navigation"
import ClientListView from "@/components/client/clientListView"

interface CustomField {
    name: string;
    value: string;
}

interface Address {
    building: string;
    street: string;
    city: string;
    district: string;
    state: string;
    pincode: string;
    country: string;
}

export interface Client {
    _id: string;
    salutation: string;
    name: string;
    company: string;
    group: string;
    email: string;
    contact: string;
    contactAlt: string;
    gstin: string;
    address: Address;
    customFields: CustomField[];
    createdAt: Date;
    updatedAt: Date;
}

const MyClients = () => {
    const { isOpen } = useSidebar();
    const [clients, setClients] = useState<Client[]>([])
    const [clientsLoading, setClientsLoading] = useState(true)
    const { isLoaded, isSignedIn } = useUser()
    const [trigger, setTrigger] = useState(0)
    const router = useRouter();
    const [addingClient, setAddingClient] = useState(false);

    useEffect(() => {
      const fetchClients = async () => {
          const response = await fetch(`/api/userdetails/clients`)
          const data = await response.json()
          setClients(data.userClients?.clients ?? [])
          setClientsLoading(false)
      }
      try {
          fetchClients()
      } catch (error) {
          setClientsLoading(false)
          console.error(error)
      }
    }, [trigger])

    if (!isLoaded) {
        return (
          <div className="flex items-center justify-center min-h-screen">
              <div className="w-12 h-12 border-5 border-t-transparent border-sidebar-primary rounded-full scale-175 animate-spin" />
          </div>
        )
    }

    if (!isSignedIn) {
        return redirect("/")
    }

    const handleAddClient = () => {
        router.push("/my-clients/add")
    }

    return (
    <div className="flex">
        <Sidebar />
        <div className={cn("bg-[#F3F5F9] min-h-screen w-full md:p-6 p-2 transition-all duration-300", isOpen ? "lg:ml-54" : "lg:ml-13.5")}>
            <div className="max-w-[1400px] w-full mx-auto">
            <Navbar location="My Clients" />
                <div className="flex items-center">
                    <div className="flex items-center gap-x-2 w-full">
                      <Input placeholder="Search" className="border border-gray-200 rounded-lg bg-gray-50 w-80" />
                      <div className="flex items-center gap-x-2 ms-auto">
                        <Button variant="outline"><FileUp /> Export</Button>
                        <Button variant="outline"><FileDown /> Import</Button>
                        <Button variant="outline"><FunnelPlus /> Filter</Button>
                        <Button variant="outline"><ArrowDownNarrowWide /> Sort</Button>
                        <Button onClick={() => {setAddingClient(true); handleAddClient()}} disabled={addingClient} variant="secondary">
                          {addingClient && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          {addingClient ? "Adding..." : "Add New Client"}
                        </Button>
                      </div>
                    </div>
                </div>
                <hr className="my-2" />
                <ClientListView clients={clients} clientsLoading={clientsLoading} setTrigger={setTrigger} />
            </div>
        </div>
    </div>
  )
}
export default MyClients