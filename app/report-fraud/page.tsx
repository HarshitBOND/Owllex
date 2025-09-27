"use client"

import Sidebar from "@/components/dashboard/sidebar"
import Navbar from "@/components/dashboard/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"

const ReportFraud = () => {
    const { isOpen } = useSidebar()
    return (
    <div className="flex">
        <Sidebar />
        <div className={cn("bg-[#F3F5F9] min-h-screen w-full p-6 transition-all duration-300", isOpen ? "ml-54" : "ml-13.5")}>
            <Navbar location="Report Fraud" />
            
        </div>
    </div>
  )
}
export default ReportFraud