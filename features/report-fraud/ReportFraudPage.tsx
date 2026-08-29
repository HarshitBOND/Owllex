"use client"

import { useMemo } from "react"
import { redirect } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { AlertTriangle, Loader2, Send } from "lucide-react"
import Sidebar from "@/components/layout/sidebar"
import Navbar from "@/components/layout/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { FraudReportNotice } from "./components/FraudReportNotice"
import { FraudReportFields } from "./components/FraudReportFields"
import { EvidenceUploader } from "./components/EvidenceUploader"
import { useFraudReportForm } from "./hooks/useFraudReportForm"

export default function ReportFraudPage() {
  const { isOpen } = useSidebar()
  const { isLoaded, isSignedIn, user } = useUser()

  const {
    formData,
    evidenceUrls,
    status,
    errorMessage,
    isBusy,
    handleInput,
    handleEvidenceUpload,
    removeEvidence,
    handleSubmit,
  } = useFraudReportForm()

  const placeholderName = useMemo(() => user?.fullName || "Your name", [user])
  const placeholderEmail = useMemo(
    () => user?.primaryEmailAddress?.emailAddress || "you@example.com",
    [user],
  )

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F3F5F9]">
        <Loader2 className="h-8 w-8 animate-spin text-sidebar-primary" />
      </div>
    )
  }

  if (!isSignedIn) {
    return redirect("/")
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className={cn("bg-[#F3F5F9] min-h-screen w-full transition-all duration-300 pb-20 lg:pb-0", "lg:ml-[var(--sidebar-offset)]")}>
        <div className="bg-white border-b border-gray-200 w-full">
          <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-4">
            <Navbar location="Report Fraud" />
          </div>
        </div>

        <div className="max-w-4xl w-full mx-auto px-4 md:px-6 py-6">
          <div className="bg-white rounded-xl border border-red-200 p-6 md:p-8">
            <div className="flex items-start gap-3 mb-6">
              <div className="p-2 rounded-lg bg-red-50">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Fraud Incident Report</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Submit suspicious billing, impersonation, or abuse activity with supporting evidence.
                </p>
              </div>
            </div>

            <FraudReportNotice status={status} errorMessage={errorMessage} />

            <form onSubmit={handleSubmit} className="space-y-4">
              <FraudReportFields
                formData={formData}
                placeholderName={placeholderName}
                placeholderEmail={placeholderEmail}
                onChange={handleInput}
              />

              <EvidenceUploader
                evidenceUrls={evidenceUrls}
                uploading={status === "uploading"}
                isBusy={isBusy}
                onUpload={handleEvidenceUpload}
                onRemove={removeEvidence}
              />

              <div className="flex justify-end">
                <Button type="submit" disabled={isBusy} className="px-6">
                  {status === "submitting" ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Submit Fraud Report
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
