"use client"

import { cn } from "@/lib/utils"
import { Bot, FileSearch, UsersRound, ReceiptText, ListTodo, MoreHorizontal, X, Settings, HelpCircle, Moon, Sun, BarChart3, CalendarDays, Workflow } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { useTheme } from "next-themes"

const MobileBottomNav = () => {
    const pathname = usePathname()
    const router = useRouter()
    const [showMore, setShowMore] = useState(false)
    const { theme, setTheme } = useTheme()
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    const mainNavItems = [
        { name: "AI", icon: Bot, href: "/dashboard" },
        { name: "Cases", icon: FileSearch, href: "/case-tracking" },
        { name: "Clients", icon: UsersRound, href: "/my-clients" },
        { name: "Invoices", icon: ReceiptText, href: "/invoices" },
        { name: "Tasks", icon: ListTodo, href: "/tasks" },
    ]

    const moreNavItems = [
        { name: "Overview", icon: BarChart3, href: "/dashboard/overview" },
        { name: "AI Workflow", icon: Workflow, href: "/ai-workflow" },
        { name: "Calendar", icon: CalendarDays, href: "/calendar" },
        { name: "Settings", icon: Settings, href: "/settings" },
        { name: "Help & Support", icon: HelpCircle, href: "/contact-us" },
    ]

    const handleNavigation = (href: string) => {
        router.push(href)
        setShowMore(false)
    }

    const toggleTheme = () => {
        if (!mounted) return
        setTheme(theme === 'dark' ? 'light' : 'dark')
    }

    const isActive = (href: string) => {
        if (href === "/dashboard") return pathname === "/dashboard"
        return pathname.startsWith(href)
    }

    return (
        <>
            {/* More Menu Overlay */}
            {showMore && (
                <div className="fixed inset-0 z-[199] lg:hidden" onClick={() => setShowMore(false)}>
                    <div className="absolute inset-0 bg-black/50" />
                    <div 
                        className="absolute bottom-16 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-2xl p-4 pb-6 shadow-2xl animate-in slide-in-from-bottom-5"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">More Options</h3>
                            <button 
                                onClick={() => setShowMore(false)}
                                className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                                <X size={18} className="text-gray-500" />
                            </button>
                        </div>
                        <div className="grid grid-cols-4 gap-3">
                            {moreNavItems.map((item) => (
                                <button
                                    key={item.name}
                                    onClick={() => handleNavigation(item.href)}
                                    className={cn(
                                        "flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all",
                                        isActive(item.href)
                                            ? "bg-sidebar-primary/10 text-sidebar-primary"
                                            : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                                    )}
                                >
                                    <item.icon size={20} />
                                    <span className="text-[10px] font-medium text-center leading-tight">{item.name}</span>
                                </button>
                            ))}
                            {/* Theme Toggle */}
                            <button
                                onClick={toggleTheme}
                                className="flex flex-col items-center gap-1.5 p-3 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                            >
                                {mounted && theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                                <span className="text-[10px] font-medium text-center leading-tight">
                                    {mounted && theme === 'dark' ? 'Light' : 'Dark'}
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom Navigation Bar */}
            <nav className="fixed bottom-0 left-0 right-0 z-[200] lg:hidden bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 pb-safe">
                <div className="flex items-center justify-around h-16 px-2">
                    {mainNavItems.map((item) => (
                        <button
                            key={item.name}
                            onClick={() => handleNavigation(item.href)}
                            className={cn(
                                "flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-all",
                                isActive(item.href)
                                    ? "text-sidebar-primary"
                                    : "text-gray-500 dark:text-gray-400"
                            )}
                        >
                            <div className={cn(
                                "p-1.5 rounded-lg transition-all",
                                isActive(item.href) && "bg-sidebar-primary/10"
                            )}>
                                <item.icon size={20} strokeWidth={isActive(item.href) ? 2.5 : 2} />
                            </div>
                            <span className={cn(
                                "text-[10px] font-medium",
                                isActive(item.href) && "font-semibold"
                            )}>
                                {item.name}
                            </span>
                        </button>
                    ))}
                    {/* More Button */}
                    <button
                        onClick={() => setShowMore(!showMore)}
                        className={cn(
                            "flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-all",
                            showMore
                                ? "text-sidebar-primary"
                                : "text-gray-500 dark:text-gray-400"
                        )}
                    >
                        <div className={cn(
                            "p-1.5 rounded-lg transition-all",
                            showMore && "bg-sidebar-primary/10"
                        )}>
                            <MoreHorizontal size={20} strokeWidth={showMore ? 2.5 : 2} />
                        </div>
                        <span className={cn(
                            "text-[10px] font-medium",
                            showMore && "font-semibold"
                        )}>
                            More
                        </span>
                    </button>
                </div>
            </nav>
        </>
    )
}

export default MobileBottomNav
