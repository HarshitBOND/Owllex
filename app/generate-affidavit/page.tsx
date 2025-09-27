"use client"

import Sidebar from "@/components/dashboard/sidebar"
import Navbar from "@/components/dashboard/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"

const GenerateAffidavit = () => {
    const { isOpen } = useSidebar()
    return (
    <div className="flex">
        <Sidebar />
        <div className={cn("bg-[#F3F5F9] min-h-screen w-full md:p-6 p-2 transition-all duration-300", isOpen ? "md:ml-54" : "md:ml-13.5")}>
            <Navbar location="Generate Affidavit" />
            
        </div>
    </div>
  )
}
export default GenerateAffidavit