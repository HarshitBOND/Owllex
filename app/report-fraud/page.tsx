"use client"

import { useMemo, useState } from "react"
import { redirect } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import Sidebar from "@/components/dashboard/sidebar"
import Navbar from "@/components/dashboard/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Loader2,
  Paperclip,
  Send,
  X,
} from "lucide-react"

type FormStatus = "idle" | "uploading" | "submitting" | "success" | "error"

export default function ReportFraudPage() {
  const { isOpen } = useSidebar()
  const { isLoaded, isSignedIn, user } = useUser()

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    incidentTitle: "",
    incidentDetails: "",
    incidentDate: "",
    caseReference: "",
    amountInvolved: "",
    priority: "medium",
  })

  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([])
  const [status, setStatus] = useState<FormStatus>("idle")
  const [errorMessage, setErrorMessage] = useState("")

  const isBusy = status === "uploading" || status === "submitting"

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

  const handleInput = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target
    setFormData((previous) => ({ ...previous, [name]: value }))
  }

  const handleEvidenceUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return

    setStatus("uploading")
    setErrorMessage("")

    try {
      const uploadedUrls: string[] = []

      for (const file of files) {
        const payload = new FormData()
        payload.append("file", file)

        const response = await fetch("/api/upload/file", {
          method: "POST",
          body: payload,
        })

        const data = await response.json()

        if (!response.ok || !data?.url) {
          throw new Error(data?.error || "Failed to upload evidence file")
        }

        uploadedUrls.push(data.url)
      }

      setEvidenceUrls((previous) => [...previous, ...uploadedUrls])
      setStatus("idle")
    } catch (error: any) {
      setStatus("error")
      setErrorMessage(error?.message || "Failed to upload one or more files")
    } finally {
      event.target.value = ""
    }
  }

  const removeEvidence = (url: string) => {
    setEvidenceUrls((previous) => previous.filter((item) => item !== url))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStatus("submitting")
    setErrorMessage("")

    const amountParsed = formData.amountInvolved.trim()
      ? Number(formData.amountInvolved)
      : null

    const payload = {
      ...formData,
      amountInvolved:
        amountParsed !== null && Number.isFinite(amountParsed) && amountParsed >= 0
          ? amountParsed
          : null,
      evidenceUrls,
    }

    try {
      const response = await fetch("/api/fraud-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data?.message || data?.error || "Failed to submit fraud report")
      }

      setStatus("success")
      setFormData({
        name: "",
        email: "",
        phone: "",
        incidentTitle: "",
        incidentDetails: "",
        incidentDate: "",
        caseReference: "",
        amountInvolved: "",
        priority: "medium",
      })
      setEvidenceUrls([])
    } catch (error: any) {
      setStatus("error")
      setErrorMessage(error?.message || "Could not submit fraud report")
    }
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className={cn("bg-[#F3F5F9] min-h-screen w-full transition-all duration-300", isOpen ? "lg:ml-48" : "lg:ml-12")}>
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

            {status === "success" && (
              <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Fraud report submitted successfully. Support will review it shortly.
              </div>
            )}

            {status === "error" && (
              <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
                <CircleAlert className="h-4 w-4" />
                {errorMessage || "Unable to submit fraud report"}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInput}
                    placeholder={placeholderName}
                    required
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInput}
                    placeholder={placeholderEmail}
                    required
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1.5">Phone (optional)</label>
                  <Input
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInput}
                    placeholder="+91..."
                  />
                </div>

                <div>
                  <label htmlFor="incidentDate" className="block text-sm font-medium text-gray-700 mb-1.5">Incident Date (optional)</label>
                  <Input
                    id="incidentDate"
                    name="incidentDate"
                    type="date"
                    value={formData.incidentDate}
                    onChange={handleInput}
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="incidentTitle" className="block text-sm font-medium text-gray-700 mb-1.5">Incident Title</label>
                  <Input
                    id="incidentTitle"
                    name="incidentTitle"
                    value={formData.incidentTitle}
                    onChange={handleInput}
                    placeholder="Unauthorized payment attempt"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="caseReference" className="block text-sm font-medium text-gray-700 mb-1.5">Case Reference (optional)</label>
                  <Input
                    id="caseReference"
                    name="caseReference"
                    value={formData.caseReference}
                    onChange={handleInput}
                    placeholder="CASE-2026-001"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-1.5">Priority</label>
                  <select
                    id="priority"
                    name="priority"
                    value={formData.priority}
                    onChange={handleInput}
                    className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="amountInvolved" className="block text-sm font-medium text-gray-700 mb-1.5">Amount Involved (optional)</label>
                  <Input
                    id="amountInvolved"
                    name="amountInvolved"
                    type="number"
                    min={0}
                    step="0.01"
                    value={formData.amountInvolved}
                    onChange={handleInput}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="incidentDetails" className="block text-sm font-medium text-gray-700 mb-1.5">Incident Details</label>
                <textarea
                  id="incidentDetails"
                  name="incidentDetails"
                  value={formData.incidentDetails}
                  onChange={handleInput}
                  rows={6}
                  required
                  placeholder="Describe what happened, when it happened, and any relevant context..."
                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sidebar-primary/30"
                />
              </div>

              <div className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800">Evidence Attachments</p>
                    <p className="text-xs text-gray-500">Upload screenshots, receipts, or supporting files.</p>
                  </div>

                  <label className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-50">
                    <Paperclip className="h-4 w-4" />
                    {status === "uploading" ? "Uploading..." : "Upload files"}
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleEvidenceUpload}
                      disabled={isBusy}
                    />
                  </label>
                </div>

                {evidenceUrls.length === 0 ? (
                  <p className="text-xs text-gray-400">No evidence files uploaded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {evidenceUrls.map((url) => (
                      <div key={url} className="flex items-center justify-between gap-3 rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
                        <a href={url} target="_blank" rel="noreferrer" className="text-xs text-sidebar-primary underline break-all">
                          {url}
                        </a>
                        <button
                          type="button"
                          onClick={() => removeEvidence(url)}
                          className="text-gray-500 hover:text-red-600"
                          disabled={isBusy}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

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