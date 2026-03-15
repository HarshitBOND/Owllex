"use client"

import { cn } from "@/lib/utils"
import { ChevronRight, FileSearch, LayoutDashboard, ExternalLink, UsersRound, ReceiptText, WandSparkles, Scale, ListTodo, Moon, Sun, FileText, X, HelpCircle, ShieldCheck, LifeBuoy, Settings } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { usePathname } from "next/navigation"
import { useSidebar } from "@/contexts/SidebarContext"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import React from "react"

const Sidebar = () => {
    const { isOpen, setIsOpen } = useSidebar()
    const router = useRouter()
    const pathname = usePathname()
    const { theme, setTheme } = useTheme()
    const [mounted, setMounted] = useState(false)
    const [isAdmin, setIsAdmin] = useState(false)
    const [isSupport, setIsSupport] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    // Check if current user is admin (DB role only)
    useEffect(() => {
        fetch("/api/admin/check")
            .then((res) => {
                if (res.ok) return res.json()
                return null
            })
            .then((data) => {
                if (data?.isAdmin) setIsAdmin(true)
            })
            .catch(() => {})

        fetch("/api/support/check")
            .then((res) => {
                if (res.ok) return res.json()
                return null
            })
            .then((data) => {
                if (data?.isSupport) setIsSupport(true)
            })
            .catch(() => {})
    }, [])

    const toggleTheme = () => {
        if (!mounted) return
        setTheme(theme === 'dark' ? 'light' : 'dark')
    }

    const toggleSidebar = () => {
        setIsOpen(!isOpen)
    }

    const mainNavItems = [
        { name: "Dashboard", icon: <LayoutDashboard size={20} />, href: "/dashboard" },
        { name: "My Cases", icon: <FileSearch size={20} />, href: "/case-tracking" },
        { name: "My Clients", icon: <UsersRound size={19} />, href: "/my-clients" },
        { name: "Invoices", icon: <ReceiptText size={20} />, href: "/invoices" },
        { name: "Tasks", icon: <ListTodo size={20} />, href: "/tasks" },
        { name: "Settings", icon: <Settings size={20} />, href: "/settings" },
    ]

    const toolNavItems = [
        { name: "Suggestions", icon: <WandSparkles size={20} />, href: "/suggestions" },
        { name: "Acts", icon: <Scale size={20} />, href: "/acts" },
        { name: "Affidavit", icon: <FileText size={20} />, href: "/generate-affidavit" },
    ]

    const handleNavigation = (href: string) => {
        router.push(href)
    }

    const NavItem = ({ item }: { item: { name: string; icon: React.ReactElement; href: string } }) => (
        <div className="cursor-pointer" key={item.name} onClick={() => handleNavigation(item.href)}>
            <div className={cn(
                "flex items-center gap-x-2 h-9 px-2 rounded-lg transition-all duration-200",
                pathname.includes(item.href)
                    ? "bg-sidebar-primary/10 text-sidebar-primary border-r-2 border-sidebar-primary"
                    : "text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-gray-400"
            )}>
                <span className="flex-shrink-0">{item.icon && React.cloneElement(item.icon, { size: 16 } as any)}</span>
                {isOpen && <p className="font-medium whitespace-nowrap text-sm">{item.name}</p>}
            </div>
        </div>
    )

    const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
        <div className="relative h-full w-full flex flex-col">
            {/* Logo */}
            <div className="flex items-center justify-between px-2 pt-1 pb-4">
                <div className="flex items-center gap-1">
                    <Image className="w-8 h-8" src="/main-logo.png" alt="Logo" width={32} height={32} priority loading="eager" />
                    {(isOpen || isMobile) && (
                        <Image className="w-20 h-8" src="/word-logo.png" alt="Logo" width={80} height={32} priority loading="eager" />
                    )}
                </div>
                {isMobile && (
                    <button onClick={() => setIsOpen(false)} className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800">
                        <X size={20} />
                    </button>
                )}
            </div>

            {/* Main Navigation */}
            <div className="flex flex-col gap-y-1 px-1">
                {(isOpen || isMobile) && (
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">Main</p>
                )}
                {mainNavItems.map((item) => <NavItem key={item.name} item={item} />)}
            </div>

            {/* Tools */}
            <div className="flex flex-col gap-y-1 px-1 mt-4">
                {(isOpen || isMobile) && (
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">Tools</p>
                )}
                {!isOpen && !isMobile && <hr className="mb-2 border-gray-200 dark:border-gray-700" />}
                {toolNavItems.map((item) => <NavItem key={item.name} item={item} />)}
            </div>

            {/* Admin/Support Panels */}
            {(isAdmin || isSupport) && (
                <div className="flex flex-col gap-y-1 px-1 mt-4">
                    {(isOpen || isMobile) && (
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">Panels</p>
                    )}
                    {!isOpen && !isMobile && <hr className="mb-2 border-gray-200 dark:border-gray-700" />}
                    {isAdmin && <NavItem item={{ name: "Admin Panel", icon: <ShieldCheck size={20} />, href: "/admin/dashboard" }} />}
                    {isSupport && <NavItem item={{ name: "Support Panel", icon: <LifeBuoy size={20} />, href: "/support/dashboard" }} />}
                </div>
            )}

            {/* Bottom Section */}
            <div className="mt-auto flex flex-col gap-y-1 px-1 pb-4">
                <hr className="mb-3 border-gray-200 dark:border-gray-700" />

                <button
                    onClick={toggleTheme}
                    className="flex items-center gap-x-2 h-9 px-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer w-full transition-colors text-gray-600 dark:text-gray-400"
                    aria-label="Toggle theme"
                >
                    {mounted && theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                    {(isOpen || isMobile) && (
                        <p className="font-medium whitespace-nowrap text-sm">
                            {mounted && theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                        </p>
                    )}
                </button>

                <Link href="/contact-us">
                    <div className="flex items-center gap-x-2 h-9 px-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer text-gray-600 dark:text-gray-400">
                        <HelpCircle size={16} />
                        {(isOpen || isMobile) && <p className="font-medium whitespace-nowrap text-sm">Help & Support</p>}
                    </div>
                </Link>

                <Link href="/terms-of-use" target="_blank">
                    <div className="flex items-center gap-x-2 h-9 px-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer text-gray-600 dark:text-gray-400">
                        <ExternalLink size={16} />
                        {(isOpen || isMobile) && <p className="font-medium whitespace-nowrap text-sm">Terms of Use</p>}
                    </div>
                </Link>
            </div>
        </div>
    )

    return (
        <>
            {/* Desktop Sidebar */}
            <div className={cn(
                "fixed top-0 left-0 h-screen transition-all duration-300 pt-5 z-50 border-r-2 border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 group hidden lg:block px-2",
                isOpen ? "lg:w-48" : "lg:w-12"
            )}>
                <div className="absolute top-10 -right-2.5 p-1 border shadow-md border-gray-300 bg-white dark:bg-gray-900 dark:border-gray-700 rounded-md z-60 hidden group-hover:block cursor-pointer" onClick={() => toggleSidebar()}>
                    <ChevronRight size={11} className={cn("transition-transform", isOpen ? "rotate-180" : "rotate-0")} />
                </div>
                <SidebarContent />
            </div>

            {/* Mobile Sidebar Overlay */}
            <div
                className={cn(
                    "fixed inset-0 z-[100] lg:hidden transition-opacity duration-300",
                    isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                )}
            >
                {/* Backdrop */}
                <div className="absolute inset-0 bg-black/50" onClick={() => setIsOpen(false)} />
                {/* Drawer */}
                <div className={cn(
                    "absolute top-0 left-0 h-full w-64 bg-white dark:bg-gray-950 border-r-2 border-gray-200 dark:border-gray-800 p-4 pt-5 transition-transform duration-300",
                    isOpen ? "translate-x-0" : "-translate-x-full"
                )}>
                    <SidebarContent isMobile />
                </div>
            </div>
        </>
    )
}
export default Sidebar