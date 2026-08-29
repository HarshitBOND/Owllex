"use client"

import { UserButton } from "@clerk/nextjs"
import { ArrowLeft, Bell, CheckCircle, Loader2, Menu } from "lucide-react"
import { Button } from "../ui/button"
import { useRouter } from "next/navigation"
import { useSidebar } from "@/contexts/SidebarContext"
import { useCallback, useEffect, useRef, useState } from "react"
import { formatDisplayDate } from "@/lib/hearingDates"

type NotificationItem = {
    _id: string
    type: "hearing-reminder" | "calendar-event-reminder"
    title: string
    message: string
    caseId: string | null
    calendarEventId: string | null
    resourceType: "case" | "task" | "calendar-event" | null
    resourceUrl: string | null
    hearingDate: string
    reminderWindowDays: number
    createdAt: string | null
    readAt: string | null
    isRead: boolean
}

type NotificationsResponse = {
    success: boolean
    notifications?: NotificationItem[]
    unreadCount?: number
    error?: string
}

const Navbar = ({withBack, location}: {withBack?: boolean, location: string}) => {
    const router = useRouter()
    const { isOpen, setIsOpen } = useSidebar()
    const [showNotifications, setShowNotifications] = useState(false)
    const [notifications, setNotifications] = useState<NotificationItem[]>([])
    const [unreadCount, setUnreadCount] = useState(0)
    const [isLoadingNotifications, setIsLoadingNotifications] = useState(false)
    const [isMarkingAllRead, setIsMarkingAllRead] = useState(false)
    const [notificationError, setNotificationError] = useState<string | null>(null)
    const notifRef = useRef<HTMLDivElement>(null)

    const formatTimestamp = (dateValue: string | null) => {
        if (!dateValue) {
            return ""
        }

        const parsedDate = new Date(dateValue)
        if (Number.isNaN(parsedDate.getTime())) {
            return ""
        }

        return new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        }).format(parsedDate)
    }

    const fetchNotifications = useCallback(async () => {
        setIsLoadingNotifications(true)
        setNotificationError(null)

        try {
            const response = await fetch("/api/userdetails/notifications?limit=8", { cache: "no-store" })
            const data = (await response.json()) as NotificationsResponse

            if (!response.ok || !data.success) {
                throw new Error(data.error || "Failed to fetch notifications")
            }

            setNotifications(data.notifications || [])
            setUnreadCount(data.unreadCount || 0)
        } catch (error) {
            setNotificationError(
                error instanceof Error ? error.message : "Failed to fetch notifications",
            )
        } finally {
            setIsLoadingNotifications(false)
        }
    }, [])

    const markNotificationAsRead = useCallback(
        async (notificationId: string) => {
            setNotifications((previousNotifications) =>
                previousNotifications.map((notification) =>
                    notification._id === notificationId
                        ? {
                              ...notification,
                              isRead: true,
                              readAt: notification.readAt || new Date().toISOString(),
                          }
                        : notification,
                ),
            )
            setUnreadCount((currentCount) => Math.max(currentCount - 1, 0))

            try {
                const response = await fetch("/api/userdetails/notifications", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ notificationId }),
                })
                const data = await response.json()

                if (!response.ok || !data.success) {
                    throw new Error(data.error || "Failed to update notification")
                }
            } catch (error) {
                setNotificationError(
                    error instanceof Error
                        ? error.message
                        : "Failed to mark notification as read",
                )
                await fetchNotifications()
            }
        },
        [fetchNotifications],
    )

    const handleMarkAllAsRead = useCallback(async () => {
        setIsMarkingAllRead(true)
        setNotificationError(null)

        try {
            const response = await fetch("/api/userdetails/notifications", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ markAll: true }),
            })
            const data = await response.json()

            if (!response.ok || !data.success) {
                throw new Error(data.error || "Failed to mark all notifications as read")
            }

            const now = new Date().toISOString()
            setNotifications((previousNotifications) =>
                previousNotifications.map((notification) => ({
                    ...notification,
                    isRead: true,
                    readAt: notification.readAt || now,
                })),
            )
            setUnreadCount(0)
        } catch (error) {
            setNotificationError(
                error instanceof Error
                    ? error.message
                    : "Failed to mark all notifications as read",
            )
            await fetchNotifications()
        } finally {
            setIsMarkingAllRead(false)
        }
    }, [fetchNotifications])

    const handleNotificationClick = (notification: NotificationItem) => {
        if (!notification.isRead) {
            void markNotificationAsRead(notification._id)
        }

        setShowNotifications(false)

        if (notification.resourceUrl) {
            router.push(notification.resourceUrl)
            return
        }

        if (notification.caseId) {
            router.push(`/case-tracking/view/${notification.caseId}`)
        }
    }

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

    useEffect(() => {
        void fetchNotifications()
    }, [fetchNotifications])

    useEffect(() => {
        if (!showNotifications) {
            return
        }

        void fetchNotifications()
    }, [showNotifications, fetchNotifications])

    return (
        <div className="flex flex-col w-full">
            <div className="flex items-center justify-between w-full lg:mb-6 mb-2">
                <h1 className="font-serif lg:text-2xl text-xl font-semibold hidden lg:flex items-center gap-x-2">
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
                            {unreadCount > 0 && (
                                <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1.5 rounded-full bg-blue-600 text-white text-[10px] font-semibold flex items-center justify-center">
                                    {unreadCount > 9 ? "9+" : unreadCount}
                                </span>
                            )}
                        </button>

                        {/* Notification Dropdown */}
                        {showNotifications && (
                            <div className="absolute right-0 top-12 w-80 bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 shadow-xl z-[200] overflow-hidden">
                                <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between gap-3">
                                    <div>
                                        <h3 className="font-semibold text-sm">Notifications</h3>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            {unreadCount > 0
                                                ? `${unreadCount} unread reminder${unreadCount === 1 ? "" : "s"}`
                                                : "Stay updated with your workspace"}
                                        </p>
                                    </div>
                                    {unreadCount > 0 && (
                                        <button
                                            onClick={() => void handleMarkAllAsRead()}
                                            disabled={isMarkingAllRead}
                                            className="text-xs font-medium text-blue-600 hover:text-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                                        >
                                            {isMarkingAllRead ? "Marking..." : "Mark all read"}
                                        </button>
                                    )}
                                </div>

                                {isLoadingNotifications ? (
                                    <div className="p-6 flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Loading notifications...
                                    </div>
                                ) : notificationError ? (
                                    <div className="p-6 text-center">
                                        <p className="text-sm font-medium text-red-600 dark:text-red-400">Could not load notifications</p>
                                        <p className="text-xs text-gray-500 mt-1">{notificationError}</p>
                                        <button
                                            onClick={() => void fetchNotifications()}
                                            className="mt-3 text-xs font-medium text-blue-600 hover:text-blue-500"
                                        >
                                            Try again
                                        </button>
                                    </div>
                                ) : notifications.length === 0 ? (
                                    <div className="p-6 text-center">
                                        <CheckCircle className="h-10 w-10 text-gray-200 dark:text-gray-700 mx-auto mb-2" />
                                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">All caught up!</p>
                                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">No new notifications</p>
                                    </div>
                                ) : (
                                    <div className="max-h-96 overflow-y-auto">
                                        {notifications.map((notification, index) => (
                                            <button
                                                key={notification._id}
                                                onClick={() => handleNotificationClick(notification)}
                                                className={`w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors ${
                                                    index !== notifications.length - 1
                                                        ? "border-b border-gray-100 dark:border-gray-800"
                                                        : ""
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className={`text-sm font-medium ${notification.isRead ? "text-gray-600 dark:text-gray-400" : "text-gray-900 dark:text-gray-100"}`}>
                                                            {notification.title}
                                                        </p>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                                                            {notification.message}
                                                        </p>
                                                    </div>
                                                    {!notification.isRead && (
                                                        <span className="h-2 w-2 rounded-full bg-blue-600 mt-1.5 shrink-0" />
                                                    )}
                                                </div>
                                                <div className="flex items-center justify-between mt-2 gap-2">
                                                    <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
                                                        {notification.type === "calendar-event-reminder" ? "Event" : "Hearing"}: {formatDisplayDate(notification.hearingDate)}
                                                    </p>
                                                    <p className="text-[11px] text-gray-400 dark:text-gray-500 shrink-0">
                                                        {formatTimestamp(notification.createdAt)}
                                                    </p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
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