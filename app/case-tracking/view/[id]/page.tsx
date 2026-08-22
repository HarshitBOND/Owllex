"use client"

import Sidebar from "@/components/layout/sidebar"
import { cn } from "@/lib/utils"
import { useSidebar } from "@/contexts/SidebarContext"
import Navbar from "@/components/layout/navbar"
import { useParams } from "next/navigation"
import ClientView from "@/features/clients/components/clientView"
import { redirect } from "next/navigation"
import CaseView from "@/features/case-tracking/components/caseView"

const ViewClient = () => {
    const { isOpen } = useSidebar()
    const { id } = useParams()
    const caseId = Array.isArray(id) ? id[0] : id;

    if (!caseId) {
        return redirect("/case-tracking")
    }

    return (
    <div className="flex">
        <Sidebar />
        <div className={cn("bg-[#F3F5F9] min-h-screen w-full md:p-6 p-2 pb-20 lg:pb-6 transition-all duration-300", isOpen ? "lg:ml-48" : "lg:ml-12")}>
            <div className="max-w-[1400px] w-full mx-auto">
            <Navbar location="View Case Details" withBack />
            <CaseView id={caseId} />
            </div>
        </div>
    </div>
  )
}
export default ViewClient