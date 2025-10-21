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
import { useUser } from "@clerk/nextjs"
import { redirect } from "next/navigation"

const Dashboard = () => {
    const { isOpen } = useSidebar()
    const router = useRouter()
    const { user } = useUser()
    if (!user) {
        return redirect("/");
    }
    const quickActions = [
        {
            name: "My Cases",
            description: "Track the status of your case",
            icon: <FileSearch className="text-white" size={22} />,
            href: "/case-tracking",
            cta: "My Cases",
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
            <div className={cn("bg-[#F3F5F9] flex flex-col items-start min-h-screen h-fit w-full md:p-6 p-2 transition-all duration-300", isOpen ? "lg:ml-54" : "lg:ml-13.5")}>
                <div className="max-w-[1400px] w-full mx-auto">
                <Navbar location="Dashboard" />
                <div className="w-full lg:hidden">
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

                <div className="w-full lg:flex gap-x-4"> 
                    <div className={cn("min-h-107.5 h-full min-w-10 w-full bg-white p-4 rounded-xl border border-gray-200 shadow-lg mb-6 md:mb-0 overflow-auto", !isOpen ? "lg:w-[68%]" : "lg:w-[66%]")}>
                        <Calendar isOpen={isOpen} />
                    </div>
                    <div className={cn("h-full min-w-10 w-full md:bg-white md:p-4 p-2 rounded-xl md:border border-gray-200 md:shadow-lg overflow-auto mt-5 lg:mt-0", !isOpen ? "lg:w-[32%]" : "lg:w-[34%]")}>
                        <h2 className="text-xl font-semibold">Quick Actions</h2>
                        <p className="text-sm mb-8">Frequently used services</p>
                        <div className="flex md:flex-row lg:flex-col flex-col gap-x-2">
                            {quickActions.map((item) => (
                                <div key={item.name}>
                                    <div className="flex md:items-center items-start shadow-md gap-x-2 md:p-2.5 p-4 border border-gray-200 mb-4 rounded-xl hover:bg-gray-200/90 overflow-hidden">
                                        <span className={cn("p-3 rounded-lg", `${item.color}`)}>{item.icon}</span>
                                        <div className="flex md:items-center w-full flex-col lg:flex-row">
                                            <div className={cn("flex flex-col items-start", !isOpen ? "lg:w-30" : "w-26")}>
                                                <p className="font-semibold text-wrap lg:text-base text-sm">{item.name}</p>
                                                <p className="lg:text-sm text-wrap text-xs">{item.description}</p>
                                            </div>
                                            <Button variant="outline" className="cursor-pointer mt-4 md:mt-0 ms-auto" onClick={() => router.push(item.href)}>{item.cta}</Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                </div>
            </div>
        </div>
  )
}
export default Dashboard