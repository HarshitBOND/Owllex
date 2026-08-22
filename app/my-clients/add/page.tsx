"use client"

import AddClientForm from "@/features/clients/components/addClientForm"
import Sidebar from "@/components/layout/sidebar"
import { cn } from "@/lib/utils"
import { useSidebar } from "@/contexts/SidebarContext"
import Navbar from "@/components/layout/navbar"
import { useSearchParams } from "next/navigation"

const AddClient = () => {
    const { isOpen } = useSidebar()
    const searchParams = useSearchParams()
    const linkCaseId = searchParams.get("linkCase") || undefined

    return (
    <div className="flex">
        <Sidebar />
        <div className={cn("bg-[#F3F5F9] min-h-screen w-full md:p-6 p-2 pb-20 lg:pb-6 transition-all duration-300", isOpen ? "lg:ml-48" : "lg:ml-12")}>
            <div className="max-w-[1400px] w-full mx-auto">
            <Navbar location={linkCaseId ? "Add Client & Link to Case" : "Add Client Details"} withBack />
            {linkCaseId && (
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg text-sm text-blue-700 dark:text-blue-400">
                    This client will be automatically linked to the case after creation.
                </div>
            )}
            <AddClientForm linkCaseId={linkCaseId} />
            </div>
        </div>
    </div>
  )
}
export default AddClient