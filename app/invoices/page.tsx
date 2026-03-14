"use client"

import Sidebar from "@/components/dashboard/sidebar"
import Navbar from "@/components/dashboard/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import { useUser } from "@clerk/nextjs"
import { redirect } from "next/navigation"
import dynamic from "next/dynamic"

const InvoiceDashboard = dynamic(() => import("@/components/invoice-lexvert/InvoiceDashboard").then(m => m.InvoiceDashboard), {
  loading: () => <div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" /></div>,
  ssr: false
})

const InvoicesPage = () => {
    const { isOpen } = useSidebar()
    const { isLoaded, isSignedIn } = useUser()

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

    return (
        <div className="flex">
            <Sidebar />
            <div className={cn("bg-[#F3F5F9] flex flex-col items-start min-h-screen h-fit w-full transition-all duration-300", isOpen ? "lg:ml-48" : "lg:ml-12")}>
                {/* Header Section */}
                <div className="bg-white border-b border-gray-200 w-full">
                    <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-4">
                        <Navbar location="Invoices" />
                    </div>
                </div>

                {/* Main Content */}
                <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-6">
                    <InvoiceDashboard />
                </div>
            </div>
        </div>
    )
}

export default InvoicesPage
