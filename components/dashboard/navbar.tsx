"use client"

import { UserButton } from "@clerk/nextjs"
import { ArrowLeft, Bell, Menu, X, CheckCircle } from "lucide-react"
import { Button } from "../ui/button"
import { useRouter } from "next/navigation"
import { useSidebar } from "@/contexts/SidebarContext"
import { useState, useRef, useEffect } from "react"

const Navbar = ({withBack, location}: {withBack?: boolean, location: string}) => {
    const router = useRouter()
    const { isOpen, setIsOpen } = useSidebar()
    const [showNotifications, setShowNotifications] = useState(false)
    const notifRef = useRef<HTMLDivElement>(null)

    // Close notification dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
                setShowNotifications(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    return (
        <div className="flex flex-col w-full">
            <div className="flex items-center justify-between w-full lg:mb-6 mb-2">
                <h1 className="lg:text-2xl text-xl font-semibold hidden lg:flex items-center gap-x-2">
                    {withBack && (
                        <Button variant="outline" size="icon" onClick={() => router.back()}>
                            <ArrowLeft size={18}/>
                        </Button>
                    )}
                    {location}
                </h1>
                <img src="/main-logo.png" className="w-9 h-9 lg:hidden" alt="LexVert" />
                <div className="flex items-center md:gap-x-3 gap-x-2">
                    {/* Notification Bell */}
                    <div className="relative" ref={notifRef}>
                        <button
                            onClick={() => setShowNotifications(!showNotifications)}
                            className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                        >
                            <Bell size={20} className="text-gray-600 dark:text-gray-400" />
                        </button>

                        {/* Notification Dropdown */}
                        {showNotifications && (
                            <div className="absolute right-0 top-12 w-80 bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 shadow-xl z-[200] overflow-hidden">
                                <div className="p-4 border-b border-gray-100 dark:border-gray-800">
                                    <h3 className="font-semibold text-sm">Notifications</h3>
                                    <p className="text-xs text-gray-500 mt-0.5">Stay updated with your workspace</p>
                                </div>
                                <div className="p-6 text-center">
                                    <CheckCircle className="h-10 w-10 text-gray-200 dark:text-gray-700 mx-auto mb-2" />
                                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">All caught up!</p>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">No new notifications</p>
                                </div>
                            </div>
                        )}
                    </div>

                    <UserButton />

                    {/* Mobile Menu Toggle */}
                    <button
                        onClick={() => setIsOpen(!isOpen)}
                        className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors lg:hidden cursor-pointer"
                    >
                        <Menu size={22} className="text-gray-600 dark:text-gray-400" />
                    </button>
                </div>
            </div>
            <hr className="mb-4 border-gray-200 dark:border-gray-800 border-1 lg:hidden"/>
        </div>
    )
}
export default Navbar