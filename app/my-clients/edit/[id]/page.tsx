"use client"

import AddClientForm from "@/features/clients/components/addClientForm"
import Sidebar from "@/components/layout/sidebar"
import { cn } from "@/lib/utils"
import { useSidebar } from "@/contexts/SidebarContext"
import Navbar from "@/components/layout/navbar"
import { useParams } from "next/navigation"
import { redirect } from "next/navigation"

const EditClient = () => {
    const { isOpen } = useSidebar()
    const { id } = useParams()
    const clientId = Array.isArray(id) ? id[0] : id;

    if (!clientId) {
        return redirect("/my-clients")
    }

    return (
    <div className="flex">
        <Sidebar />
        <div className={cn("bg-[#F3F5F9] min-h-screen w-full md:p-6 p-2 pb-20 lg:pb-6 transition-all duration-300", isOpen ? "lg:ml-48" : "lg:ml-12")}>
            <div className="max-w-[1400px] w-full mx-auto">
            <Navbar location="Edit Client Details" withBack />
            <AddClientForm id={clientId}/>
            </div>
        </div>
    </div>
  )
}
export default EditClient