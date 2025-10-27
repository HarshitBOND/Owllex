"use client"

import Sidebar from "@/components/dashboard/sidebar"
import { cn } from "@/lib/utils"
import { useSidebar } from "@/contexts/SidebarContext"
import Navbar from "@/components/dashboard/navbar"
import { useParams } from "next/navigation"
import ClientView from "@/components/client/clientView"
import { redirect } from "next/navigation"

const ViewClient = () => {
    const { isOpen } = useSidebar()
    const { id } = useParams()
    const clientId = Array.isArray(id) ? id[0] : id;

    if (!clientId) {
        return redirect("/my-clients")
    }

    return (
    <div className="flex">
        <Sidebar />
        <div className={cn("bg-[#F3F5F9] min-h-screen w-full md:p-6 p-2 transition-all duration-300", isOpen ? "lg:ml-54" : "lg:ml-13.5")}>
            <div className="max-w-[1400px] w-full mx-auto">
                <Navbar location="View Client Details" withBack />
                <ClientView id={clientId} />
            </div>
        </div>
    </div>
  )
}
export default ViewClient