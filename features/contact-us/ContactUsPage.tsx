"use client"

import { useUser } from "@clerk/nextjs"
import { redirect } from "next/navigation"
import Sidebar from "@/components/layout/sidebar"
import Navbar from "@/components/layout/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import { ContactInfoPanel } from "./components/ContactInfoPanel"
import { ContactMessageForm } from "./components/ContactMessageForm"
import { useContactForm } from "./hooks/useContactForm"

export default function ContactUsPage() {
  const { isOpen } = useSidebar()
  const { isLoaded, isSignedIn, user } = useUser()

  const { formData, status, handleChange, setSubject, handleSubmit } = useContactForm()

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F3F5F9]">
        <div className="w-12 h-12 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" />
      </div>
    )
  }
  if (!isSignedIn) {
    return redirect("/")
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className={cn("bg-[#F3F5F9] min-h-screen w-full transition-all duration-300 pb-20 lg:pb-0", isOpen ? "lg:ml-48" : "lg:ml-12")}>
        <div className="bg-white border-b border-gray-200 w-full">
          <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-4">
            <Navbar location="Help & Support" />
          </div>
        </div>

        <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-6">
          <div className="grid lg:grid-cols-3 gap-6">
            <ContactInfoPanel onTopicSelect={setSubject} />
            <ContactMessageForm
              formData={formData}
              status={status}
              user={user}
              onChange={handleChange}
              onSubmit={handleSubmit}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
