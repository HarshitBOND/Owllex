"use client"

import AddCaseForm from "@/components/Forms/addCaseForm"
import Sidebar from "@/components/dashboard/sidebar"
import { cn } from "@/lib/utils"
import { useSidebar } from "@/contexts/SidebarContext"
import Navbar from "@/components/dashboard/navbar"

const AddCase = () => {
    const { isOpen } = useSidebar()
    return (
    <div className="flex">
        <Sidebar />
        <div className={cn("bg-[#F3F5F9] min-h-screen w-full md:p-6 p-2 pb-20 lg:pb-6 transition-all duration-300", isOpen ? "lg:ml-48" : "lg:ml-12")}>
            <div className="max-w-[1400px] w-full mx-auto">
            <Navbar location="Register New Case" withBack />
            <AddCaseForm />
            </div>
        </div>
    </div>
  )
}
export default AddCase