"use client"

import Sidebar from "@/components/layout/sidebar"
import Navbar from "@/components/layout/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import { useUser } from "@clerk/nextjs"
import { redirect } from "next/navigation"
import dynamic from "next/dynamic"

const ClientDashboard = dynamic(() => import("@/features/clients/components/ClientDashboard"), {
  loading: () => (
    <div className="flex items-center justify-center py-20">
      <div className="w-10 h-10 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" />
    </div>
  ),
  ssr: false,
})

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
    address: {
        building: string;
        street: string;
        city: string;
        district: string;
        state: string;
        pincode: string;
        country: string;
    };
    customFields: { name: string; value: string }[];
    cases: any[];
    notes: any[];
    createdAt: Date;
    updatedAt: Date;
}

const MyClients = () => {
    const { isOpen } = useSidebar()
    const { isLoaded, isSignedIn } = useUser()

    if (!isLoaded) {
        return (
          <div className="flex items-center justify-center min-h-screen dark:bg-background">
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
        <div className={cn("bg-[#F3F5F9] dark:bg-background flex flex-col items-start min-h-screen h-fit w-full transition-all duration-300 pb-20 lg:pb-0", isOpen ? "lg:ml-48" : "lg:ml-12")}>
            <div className="w-full">
                <ClientDashboard />
            </div>
        </div>
    </div>
  )
}
export default MyClients