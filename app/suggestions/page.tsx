"use client"

import Sidebar from "@/components/dashboard/sidebar"
import Navbar from "@/components/dashboard/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import { useUser } from "@clerk/nextjs"
import { redirect } from "next/navigation"

const Suggestions = () => {
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
        <div className={cn("bg-[#F3F5F9] min-h-screen w-full md:p-6 p-2 transition-all duration-300", isOpen ? "lg:ml-54" : "lg:ml-13.5")}>
            <div className="max-w-[1400px] w-full mx-auto">
            <Navbar location="Case Suggestions" />
            
            </div>
        </div>
    </div>
  )
}
export default Suggestions