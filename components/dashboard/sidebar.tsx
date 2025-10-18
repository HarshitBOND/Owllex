"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { ChevronRight, FileSearch, FileText, LayoutDashboard, ShieldHalf, ExternalLink, UsersRound, ReceiptText } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { usePathname } from "next/navigation"
import { useSidebar } from "@/contexts/SidebarContext"

const Sidebar = () => {
    const { isOpen, setIsOpen } = useSidebar()
    const router = useRouter()
    const pathname = usePathname()

    const toggleSidebar = () => {
        setIsOpen(!isOpen)
    }

    const sidebarItems = [
        {
            name: "Dashboard",
            icon: <LayoutDashboard size={20} />,
            href: "/dashboard"
        },
        {
            name: "My Cases",
            icon: <FileSearch size={20} />,
            href: "/case-tracking"
        },
        {
            name: "My Clients",
            icon: <UsersRound size={19} />,
            href: "/my-clients"
        },
        {
            name: "Invoices",
            icon: <ReceiptText size={20} />,
            href: "/invoices"
        },
        {
            name: "Generate Affidavit",
            icon: <FileText size={20} />,
            href: "/generate-affidavit"
        },
        {
            name: "Report A Fraud",
            icon: <ShieldHalf size={20} />,
            href: "/report-fraud"
        },
    ]

    const handleNavigation = (href: string) => {
        router.push(href)
    }

    return (
    <div className={cn("fixed top-0 left-0 h-screen transition-all duration-300 pt-5 z-50 border-r border-gray-200 group hidden lg:block", isOpen ? "lg:w-54" : "lg:w-13.5")}>
        <div className="absolute top-10 -right-2.5 p-1 border-1 shadow-md border-gray-400 bg-white rounded-md z-60 hidden group-hover:block cursor-pointer" onClick={() => toggleSidebar()}>
            <ChevronRight size={11} className={cn(isOpen ? "rotate-180" : "rotate-0")} />
        </div>
        <div className="relative h-full w-full overflow-hidden">
            <div className="flex flex-col gap-y-2">
                <div className="flex items-center justify-start gap-2">
                    <img className="w-11 h-11 ms-1" src="/main-logo.png" alt="Logo" />
                    <img className="w-28 h-11 " src="/word-logo.png" alt="Logo" />
                </div>
            </div>
            <div className="flex flex-col h-[75%] gap-y-3 mt-12">
                {sidebarItems.map((item) => (
                    <div className="cursor-pointer" key={item.name} onClick={() => handleNavigation(item.href)}>
                        <div className={cn("flex items-center gap-x-2 h-10 border-r-2 border-transparent hover:bg-gray-200/90", pathname === item.href ? "border-sidebar-primary" : "")}>
                            <span className="ms-4.5">{item.icon}</span>
                            <p className="font-semibold ms-2 whitespace-nowrap">{item.name}</p>
                        </div>
                    </div>
                ))}
            </div>
            <div className="flex flex-col h-[20%] mt-auto">
                <hr className="mb-4" />
                <Link href="/terms-of-use" target="_blank">
                    <div className="flex items-center gap-x-2 h-10 border-r-2 border-transparent hover:bg-gray-200/90 cursor-pointer">
                        {!isOpen ? 
                        <div className="flex items-center gap-x-0.5">
                        <span className="ms-2">ToU</span>
                        <ExternalLink size={12} />
                        </div> :
                        <div className="flex items-center gap-x-2">
                        <p className="ms-5 whitespace-nowrap">Terms of Use</p>
                        <ExternalLink size={16} />
                        </div>}
                    </div>
                </Link>
            </div>
        </div>
    </div>
  )
}
export default Sidebar