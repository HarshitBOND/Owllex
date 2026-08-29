"use client"

import { cn } from "@/lib/utils"
import {
    ChevronRight, ChevronDown, FileSearch, ExternalLink, UsersRound, ReceiptText,
    ListTodo, Moon, Sun, FileText, X, HelpCircle, ShieldCheck,
    LifeBuoy, Settings, Sparkles, CirclePlus, History, Search, Gavel, FileEdit,
    FileCheck2, MessageCircleQuestion, Quote, Settings2, Briefcase, LayoutDashboard,
    CalendarDays, Workflow,
} from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { usePathname } from "next/navigation"
import {
    useSidebar,
    SIDEBAR_MIN_WIDTH,
    SIDEBAR_MAX_WIDTH,
    SIDEBAR_DEFAULT_WIDTH,
    SIDEBAR_COLLAPSED_WIDTH,
} from "@/contexts/SidebarContext"
import { useAiChat } from "@/contexts/AiChatContext"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import React from "react"
import MobileBottomNav from "./mobile-bottom-nav"
import { AiChatHistoryFlyout } from "./ai-chat-history-flyout"

type NavLink = { name: string; icon: React.ReactElement; href: string }
type NavAction = { name: string; icon: React.ReactElement; action: "new-chat" | "chat-history" }
type NavLeaf = NavLink | NavAction
type NavGroup = { name: string; icon: React.ReactElement; items: NavLeaf[] }

const isNavAction = (item: NavLeaf): item is NavAction => "action" in item

const aiGroupItems: NavLeaf[] = [
    { name: "New Chat", icon: <CirclePlus size={16} />, action: "new-chat" },
    { name: "Chat History", icon: <History size={16} />, action: "chat-history" },
    { name: "Legal Research", icon: <Search size={16} />, href: "/legal-research" },
    { name: "Case Law Finder", icon: <Gavel size={16} />, href: "/case-law-finder" },
    { name: "Draft Documents", icon: <FileEdit size={16} />, href: "/draft-documents" },
    { name: "Contract Review", icon: <FileCheck2 size={16} />, href: "/contract-review" },
    { name: "Legal Summarizer", icon: <FileText size={16} />, href: "/legal-summarizer" },
    { name: "Ask Precedent", icon: <MessageCircleQuestion size={16} />, href: "/ask-precedent" },
    { name: "Citations Checker", icon: <Quote size={16} />, href: "/citations-checker" },
    { name: "AI Workflow", icon: <Workflow size={16} />, href: "/ai-workflow" },
    { name: "AI Settings", icon: <Settings2 size={16} />, href: "/ai-settings" },
]

const workspaceGroupItems: NavLeaf[] = [
    { name: "Dashboard", icon: <LayoutDashboard size={16} />, href: "/dashboard/overview" },
    { name: "My Cases", icon: <FileSearch size={16} />, href: "/case-tracking" },
    { name: "My Clients", icon: <UsersRound size={16} />, href: "/my-clients" },
    { name: "Invoices", icon: <ReceiptText size={16} />, href: "/invoices" },
    { name: "Calendar", icon: <CalendarDays size={16} />, href: "/calendar" },
    { name: "Tasks", icon: <ListTodo size={16} />, href: "/tasks" },
]

const sections: { label: string; groups: NavGroup[] }[] = [
    { label: "AI", groups: [{ name: "AI Assistant", icon: <Sparkles size={18} />, items: aiGroupItems }] },
    { label: "Main", groups: [{ name: "Workspace", icon: <Briefcase size={18} />, items: workspaceGroupItems }] },
]

const Sidebar = () => {
    const { isOpen, setIsOpen, width, setWidth } = useSidebar()
    const [isDragging, setIsDragging] = useState(false)
    const router = useRouter()
    const pathname = usePathname()
    const { theme, setTheme } = useTheme()
    const aiChat = useAiChat()
    const [mounted, setMounted] = useState(false)
    const [isAdmin, setIsAdmin] = useState(false)
    const [isSupport, setIsSupport] = useState(false)
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
        "AI Assistant": true,
        "Workspace": true,
    })

    useEffect(() => {
        setMounted(true)
    }, [])

    // Keep every page's content margin (lg:ml-[var(--sidebar-offset)]) in sync with the sidebar's actual width
    useEffect(() => {
        const value = isOpen ? `${width}px` : `${SIDEBAR_COLLAPSED_WIDTH}px`
        document.documentElement.style.setProperty("--sidebar-offset", value)
    }, [isOpen, width])

    useEffect(() => {
        if (!isDragging) return

        const handleMouseMove = (e: MouseEvent) => {
            const next = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, e.clientX))
            setWidth(next)
            if (!isOpen) setIsOpen(true)
        }
        const handleMouseUp = () => setIsDragging(false)

        document.body.style.cursor = "col-resize"
        document.body.style.userSelect = "none"
        window.addEventListener("mousemove", handleMouseMove)
        window.addEventListener("mouseup", handleMouseUp)
        return () => {
            document.body.style.cursor = ""
            document.body.style.userSelect = ""
            window.removeEventListener("mousemove", handleMouseMove)
            window.removeEventListener("mouseup", handleMouseUp)
        }
    }, [isDragging, isOpen, setIsOpen, setWidth])

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

    const toggleGroup = (name: string) => {
        setExpandedGroups((prev) => ({ ...prev, [name]: !prev[name] }))
    }

    const handleNavigation = (href: string) => {
        router.push(href)
    }

    const isLeafActive = (href: string) => pathname === href || pathname.startsWith(href + "/")
    const isGroupActive = (group: NavGroup) => group.items.some((item) => !isNavAction(item) && isLeafActive(item.href))

    const handleLeafClick = (item: NavLeaf) => {
        if (isNavAction(item)) {
            if (item.action === "new-chat") {
                aiChat.startNewConversation()
                router.push("/dashboard")
            } else {
                aiChat.openHistory()
            }
            return
        }
        handleNavigation(item.href)
    }

    const GroupSection = ({ group, isMobile = false }: { group: NavGroup; isMobile?: boolean }) => {
        const expanded = expandedGroups[group.name]
        const active = isGroupActive(group)

        return (
            <div className="flex flex-col">
                <div
                    onClick={() => {
                        if (!isOpen && !isMobile) {
                            setIsOpen(true)
                            setExpandedGroups((prev) => ({ ...prev, [group.name]: true }))
                            return
                        }
                        toggleGroup(group.name)
                    }}
                    className={cn(
                        "flex items-center h-9 rounded-lg transition-all duration-200 cursor-pointer",
                        isOpen || isMobile ? "gap-x-2 px-2" : "justify-center px-0",
                        active ? "text-sidebar-primary" : "text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-gray-400"
                    )}
                >
                    <span className="flex-shrink-0">{React.cloneElement(group.icon, { size: 16 } as any)}</span>
                    {(isOpen || isMobile) && (
                        <>
                            <p className="font-medium whitespace-nowrap text-sm flex-1 text-left">{group.name}</p>
                            <ChevronDown size={14} className={cn("flex-shrink-0 transition-transform duration-200", expanded ? "rotate-180" : "")} />
                        </>
                    )}
                </div>

                {(isOpen || isMobile) && expanded && (
                    <div className="flex flex-col gap-y-0.5 mt-1 ml-3.5 pl-2.5 border-l border-gray-200 dark:border-gray-800">
                        {group.items.map((item) => {
                            const active = !isNavAction(item) && isLeafActive(item.href)
                            return (
                                <div
                                    key={item.name}
                                    onClick={() => handleLeafClick(item)}
                                    className={cn(
                                        "flex items-center gap-x-2 h-8 px-2 rounded-lg cursor-pointer transition-colors",
                                        active
                                            ? "bg-sidebar-primary/10 text-sidebar-primary"
                                            : "text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-gray-400"
                                    )}
                                >
                                    <span className="flex-shrink-0">{React.cloneElement(item.icon, { size: 14 } as any)}</span>
                                    <p className="text-xs font-medium whitespace-nowrap truncate">{item.name}</p>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        )
    }

    const FlatItem = ({ name, icon, href, isMobile = false }: { name: string; icon: React.ReactElement; href: string; isMobile?: boolean }) => (
        <div className="cursor-pointer" onClick={() => handleNavigation(href)}>
            <div className={cn(
                "flex items-center h-9 rounded-lg transition-all duration-200",
                isOpen || isMobile ? "gap-x-2 px-2" : "justify-center px-0",
                isLeafActive(href)
                    ? "bg-sidebar-primary/10 text-sidebar-primary"
                    : "text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-gray-400"
            )}>
                <span className="flex-shrink-0">{React.cloneElement(icon, { size: 16 } as any)}</span>
                {(isOpen || isMobile) && <p className="font-medium whitespace-nowrap text-sm">{name}</p>}
            </div>
        </div>
    )

    const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
        <div className="relative h-full w-full flex flex-col">
            {/* Logo */}
            <div className={cn("flex items-center px-2 pt-1 pb-4", isMobile || isOpen ? "justify-between" : "justify-center")}>
                <div className="flex items-center min-w-0 flex-shrink-0">
                    <Image
                        className="h-12 w-12 min-h-12 min-w-12 flex-shrink-0 object-contain"
                        src="/logo.png"
                        alt="Logo"
                        width={48}
                        height={48}
                        priority
                        loading="eager"
                    />
                    <div
                        className={cn(
                            "overflow-hidden transition-all duration-300 ease-in-out",
                            isOpen || isMobile ? "max-w-[90px] opacity-100 ml-1" : "max-w-0 opacity-0 ml-0"
                        )}
                    >
                        <Image
                            className="h-8 w-20 min-w-20 flex-shrink-0 object-contain"
                            src="/word-logo.png"
                            alt="Logo"
                            width={80}
                            height={32}
                            priority
                            loading="eager"
                        />
                    </div>
                </div>
                {isMobile && (
                    <button onClick={() => setIsOpen(false)} className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800">
                        <X size={20} />
                    </button>
                )}
            </div>

            {/* Scrollable nav sections */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-1">
                {sections.map((section, idx) => (
                    <div key={section.label} className={cn("flex flex-col gap-y-1", idx > 0 && "mt-4")}>
                        {(isOpen || isMobile) && (
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">{section.label}</p>
                        )}
                        {!isOpen && !isMobile && idx > 0 && <hr className="mb-2 border-gray-200 dark:border-gray-700" />}
                        {section.groups.map((group) => (
                            <GroupSection key={group.name} group={group} isMobile={isMobile} />
                        ))}
                    </div>
                ))}

                {/* Admin/Support Panels */}
                {(isAdmin || isSupport) && (
                    <div className="flex flex-col gap-y-1 mt-4">
                        {(isOpen || isMobile) && (
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">Panels</p>
                        )}
                        {!isOpen && !isMobile && <hr className="mb-2 border-gray-200 dark:border-gray-700" />}
                        {isAdmin && <FlatItem isMobile={isMobile} name="Admin Panel" icon={<ShieldCheck size={20} />} href="/admin/dashboard" />}
                        {isSupport && <FlatItem isMobile={isMobile} name="Support Panel" icon={<LifeBuoy size={20} />} href="/support/dashboard" />}
                    </div>
                )}
            </div>

            {/* Bottom Section */}
            <div className="flex flex-col gap-y-1 px-1 pb-4 pt-2">
                <hr className="mb-2 border-gray-200 dark:border-gray-700" />

                <FlatItem isMobile={isMobile} name="Settings" icon={<Settings size={20} />} href="/settings" />

                <button
                    onClick={toggleTheme}
                    className="flex items-center gap-x-2 h-9 px-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer w-full transition-colors text-gray-600 dark:text-gray-400"
                    aria-label="Toggle theme"
                >
                    {mounted && theme === 'dark' ? <Sun size={19} className="flex-shrink-0" /> : <Moon size={19} className="flex-shrink-0" />}
                    {(isOpen || isMobile) && (
                        <p className="font-medium whitespace-nowrap text-sm">
                            {mounted && theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                        </p>
                    )}
                </button>

                <Link href="/contact-us">
                    <div className="flex items-center gap-x-2 h-9 px-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer text-gray-600 dark:text-gray-400">
                        <HelpCircle size={19} className="flex-shrink-0" />
                        {(isOpen || isMobile) && <p className="font-medium whitespace-nowrap text-sm">Help & Support</p>}
                    </div>
                </Link>

                <Link href="/terms-of-use" target="_blank">
                    <div className="flex items-center gap-x-2 h-9 px-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer text-gray-600 dark:text-gray-400">
                        <ExternalLink size={19} className="flex-shrink-0" />
                        {(isOpen || isMobile) && <p className="font-medium whitespace-nowrap text-sm">Terms of Use</p>}
                    </div>
                </Link>
            </div>
        </div>
    )

    return (
        <>
            {/* Desktop Sidebar */}
            <div
                className={cn(
                    "fixed top-0 left-0 h-screen ease-in-out pt-5 z-50 border-r-2 border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 group hidden lg:block px-2",
                    !isDragging && "transition-all duration-300"
                )}
                style={{ width: isOpen ? width : SIDEBAR_COLLAPSED_WIDTH }}
            >
                <div className="absolute top-10 -right-2.5 p-1 border shadow-md border-gray-300 bg-white dark:bg-gray-900 dark:border-gray-700 rounded-md z-60 hidden group-hover:block cursor-pointer" onClick={() => toggleSidebar()}>
                    <ChevronRight size={11} className={cn("transition-transform", isOpen ? "rotate-180" : "rotate-0")} />
                </div>
                {/* Drag handle: click-drag this edge to resize, LeetCode-panel style */}
                <div
                    onMouseDown={(e) => {
                        e.preventDefault()
                        setIsDragging(true)
                    }}
                    onDoubleClick={() => setWidth(SIDEBAR_DEFAULT_WIDTH)}
                    className="absolute top-0 -right-0.5 h-full w-1.5 cursor-col-resize z-50 group/handle"
                    title="Drag to resize"
                >
                    <div className={cn(
                        "h-full w-px mx-auto transition-colors",
                        isDragging ? "bg-sidebar-primary w-0.5" : "bg-transparent group-hover/handle:bg-sidebar-primary/50"
                    )} />
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

            {/* Mobile Bottom Navigation */}
            <MobileBottomNav />

            {/* Floating, scrollable chat-history panel */}
            <AiChatHistoryFlyout />
        </>
    )
}
export default Sidebar
