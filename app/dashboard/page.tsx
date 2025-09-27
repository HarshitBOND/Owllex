"use client"

import Sidebar from "@/components/dashboard/sidebar"
import Navbar from "@/components/dashboard/navbar"
import Calendar from "@/components/dashboard/calendar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import { FileSearch, FileText, ShieldHalf, Calendar as CalendarIcon, MessageCircle, Truck } from "lucide-react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

const Dashboard = () => {
    const { isOpen } = useSidebar()
    const router = useRouter()
    const quickActions = [
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
    ]

    const [quickOptions, setQuickOptions] = useState([
        {
            name: "Active Documents",
            description: "Documents is progress",
            value: 0,
            icon: <FileText color="blue" className="text-white" size={18} />,
        },
        {
            name: "Consultations",
            description: "Scheduled this week",
            value: 0,
            icon: <MessageCircle color="green" className="text-white" size={18} />,
        },        {
            name: "Court Dates",
            description: "Upcoming hearings",
            value: 0,
            icon: <CalendarIcon color="orange" className="text-white" size={18} />,
        },
        {
            name: "Deliveries",
            description: "Completed this month",
            value: 0,
            icon: <Truck color="violet" className="text-white" size={18} />,
        },
    ])

    return (
        <div className="flex">
            <Sidebar />
            <div className={cn("bg-[#F3F5F9] flex flex-col items-start min-h-screen h-fit w-full md:p-6 p-2 transition-all duration-300", isOpen ? "md:ml-54" : "md:ml-13.5")}>
                <Navbar location="Dashboard" />
                <div className="w-full md:hidden">
                    <h2 className="text-xl font-semibold">Dashboard</h2>
                    <p className="text-sm mb-8">Welcome to your dashboard</p>
                </div>
                
                <div className="w-full gap-4 flex items-center justify-between mb-4 flex-col md:flex-row">
                    {quickOptions.map((item) => (
                        <div key={item.name} className="flex flex-col md:w-[24%] w-full min-w-38 min-h-36 border border-gray-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-300 p-5">
                            <div className="flex w-full items-center justify-between">
                                <h3>{item.name}</h3>
                                <span>{item.icon}</span>
                            </div>
                            <p className="text-lg font-semibold mt-auto">{item.value}</p>
                            <p className="text-sm">{item.description}</p>
                        </div>
                    ))}
                </div>

                <div className="w-full md:flex md:gap-x-4"> 
                    <div className={cn("min-h-107.5 h-fit min-w-10 w-full bg-white p-4 rounded-xl border border-gray-200 shadow-lg mb-6 md:mb-0 overflow-auto", !isOpen ? "md:w-[68%]" : "md:w-[66%]")}>
                        <Calendar />
                    </div>
                    <div className={cn("min-h-108 h-fit min-w-10 md:w-[32%] w-full md:bg-white md:p-4 p-2 rounded-xl md:border border-gray-200 md:shadow-lg overflow-auto", !isOpen ? "md:w-[32%]" : "md:w-[34%]")}>
                        <h2 className="text-xl font-semibold">Quick Actions</h2>
                        <p className="text-sm mb-8">Frequently used services</p>
                        {quickActions.map((item) => (
                            <div key={item.name}>
                                <div className="flex md:items-center items-start shadow-md gap-x-2 md:p-2.5 p-4 border border-gray-200 mb-4 rounded-xl hover:bg-gray-200/90">
                                    <span className={cn("p-3 rounded-lg", `${item.color}`)}>{item.icon}</span>
                                    <div className="flex md:items-center w-full flex-col lg:flex-row">
                                        <div className={cn("flex flex-col items-start", !isOpen ? "md:w-30" : "w-26")}>
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