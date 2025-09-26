"use client"

import Sidebar from "@/components/dashboard/sidebar"
import Navbar from "@/components/dashboard/navbar"
import Calendar from "@/components/dashboard/calendar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import { useState } from "react"
import { FileSearch, FileText, ShieldHalf } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

const Dashboard = () => {
    const { isOpen } = useSidebar()
    const router = useRouter()
    const [quickActions, setQuickActions] = useState([
        {
            name: "Track A Case",
            description: "Track the status of your case",
            icon: <FileSearch className="text-white" size={22} />,
            href: "/case-tracking",
            cta: "Track Case",
            color: "bg-blue-500"
        },
        {
            name: "New Affidavit",
            description: "Create a new affidavit with AI",
            icon: <FileText className="text-white" size={22} />,
            href: "/generate-affidavit",
            cta: "New Affidavit",
            color: "bg-green-500"
        },
        {
            name: "Report A Fraud",
            description: "Report a fraud to respective authorities",
            icon: <ShieldHalf className="text-white" size={22} />,
            href: "/report-fraud",
            cta: "Report Fraud",
            color: "bg-orange-500"
        },
    ])

    return (
        <div className="flex">
            <Sidebar />
            <div className={cn("bg-[#F3F5F9] flex flex-col items-start min-h-screen h-fit w-full md:p-6 p-2 transition-all duration-300", isOpen ? "md:ml-54" : "md:ml-13.5")}>
                <Navbar location="Dashboard" />
                <div className="w-full md:flex md:gap-x-4"> 
                    <div className={cn("min-h-107.5 h-fit min-w-10 w-full bg-white p-4 rounded-xl border border-gray-200 shadow-lg mb-6 md:mb-0", !isOpen ? "md:w-[68%]" : "md:w-[66%]")}>
                        <Calendar />
                    </div>
                    <div className={cn("min-h-108 h-fit min-w-10 md:w-[32%] w-full bg-white p-4 rounded-xl border border-gray-200 shadow-lg", !isOpen ? "md:w-[32%]" : "md:w-[34%]")}>
                        <h2 className="text-xl font-semibold">Quick Actions</h2>
                        <p className="text-sm mb-8">Frequently used services</p>
                        {quickActions.map((item) => (
                            <div key={item.name}>
                                <div className="flex md:items-center items-start gap-x-2 md:p-2.5 p-4 border border-gray-200 mb-4 rounded-xl hover:bg-gray-200/90">
                                    <span className={cn("p-3 rounded-lg", `${item.color}`)}>{item.icon}</span>
                                    <div className="flex md:items-center w-full flex-col md:flex-row">
                                        <div className={cn("flex flex-col items-start", !isOpen ? "md:w-36" : "w-26")}>
                                            <p className="font-semibold text-wrap">{item.name}</p>
                                            <p className="text-sm text-wrap">{item.description}</p>
                                        </div>
                                        <Button variant="outline" className="-ms-13 cursor-pointer md:ms-auto mt-4 md:mt-0" onClick={() => router.push(item.href)}>{item.cta}</Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
  )
}
export default Dashboard