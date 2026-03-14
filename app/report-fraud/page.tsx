"use client"

import { useState } from "react"
import Sidebar from "@/components/dashboard/sidebar"
import Navbar from "@/components/dashboard/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import { useUser } from "@clerk/nextjs"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ShieldHalf, AlertTriangle, CheckCircle, Upload,
  Shield, Phone, Globe, FileWarning, Info
} from "lucide-react"

const fraudCategories = [
  { value: "cyber", label: "Cyber Fraud", icon: Globe, description: "Online scams, phishing, identity theft" },
  { value: "financial", label: "Financial Fraud", icon: FileWarning, description: "Banking fraud, money laundering, cheque bounce" },
  { value: "property", label: "Property Fraud", icon: Shield, description: "Real estate fraud, title fraud, encroachment" },
  { value: "corporate", label: "Corporate Fraud", icon: FileWarning, description: "Company fraud, insider trading, embezzlement" },
  { value: "consumer", label: "Consumer Fraud", icon: ShieldHalf, description: "Product fraud, misleading ads, warranty fraud" },
  { value: "other", label: "Other", icon: AlertTriangle, description: "Any other type of fraud" },
]

const ReportFraud = () => {
  const { isOpen } = useSidebar()
  const { isLoaded, isSignedIn } = useUser()
  const [step, setStep] = useState(1)
  const [category, setCategory] = useState("")
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    accusedName: "",
    accusedContact: "",
    incidentDate: "",
    amountInvolved: "",
    evidenceDescription: "",
    policeReport: false,
  })
  const [submitted, setSubmitted] = useState(false)

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData({ ...formData, [name]: value })
  }

  const handleSubmit = async () => {
    try {
      await fetch('/api/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, type: 'fraud-report', category })
      })
    } catch { /* silent */ }
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="flex">
        <Sidebar />
        <div className={cn("bg-[#F3F5F9] min-h-screen w-full transition-all duration-300", isOpen ? "lg:ml-48" : "lg:ml-12")}>
          <div className="bg-white border-b border-gray-200 w-full">
            <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-4">
              <Navbar location="Report Fraud" />
            </div>
          </div>
          <div className="max-w-2xl mx-auto px-4 py-16 text-center">
            <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-sm p-8 md:p-12">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Report Submitted</h2>
              <p className="text-gray-500 mb-6 max-w-md mx-auto">
                Your fraud report has been recorded. Our team will review it and guide you through the next steps.
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-left">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-800">Important Next Steps</p>
                    <ul className="text-sm text-blue-700 mt-1 space-y-1 list-disc ml-4">
                      <li>File an FIR at the nearest police station</li>
                      <li>Report cyber fraud on cybercrime.gov.in</li>
                      <li>Preserve all evidence and communication</li>
                    </ul>
                  </div>
                </div>
              </div>
              <Button onClick={() => { setSubmitted(false); setStep(1); setCategory(""); setFormData({ title: "", description: "", accusedName: "", accusedContact: "", incidentDate: "", amountInvolved: "", evidenceDescription: "", policeReport: false }) }}>
                Submit Another Report
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className={cn("bg-[#F3F5F9] min-h-screen w-full transition-all duration-300", isOpen ? "lg:ml-48" : "lg:ml-12")}>
        <div className="bg-white border-b border-gray-200 w-full">
          <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-4">
            <Navbar location="Report Fraud" />
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-red-50 rounded-lg">
                <ShieldHalf className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Report a Fraud</h2>
                <p className="text-sm text-gray-500">Report fraudulent activities to the appropriate authorities</p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 md:px-6 py-6">
          {/* Progress Steps */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all",
                  step >= s ? "bg-sidebar-primary text-white" : "bg-gray-200 text-gray-500"
                )}>
                  {s}
                </div>
                {s < 3 && <div className={cn("w-16 h-0.5", step > s ? "bg-sidebar-primary" : "bg-gray-200")} />}
              </div>
            ))}
          </div>

          {/* Step 1: Select Category */}
          {step === 1 && (
            <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm p-6 md:p-8">
              <h3 className="text-lg font-bold text-gray-900 mb-1">Select Fraud Type</h3>
              <p className="text-sm text-gray-500 mb-6">What type of fraud would you like to report?</p>
              <div className="grid md:grid-cols-2 gap-3">
                {fraudCategories.map((cat) => (
                  <button
                    key={cat.value}
                    onClick={() => { setCategory(cat.value); setStep(2) }}
                    className={cn(
                      "p-4 rounded-xl border-2 text-left transition-all hover:shadow-md cursor-pointer",
                      category === cat.value ? "border-sidebar-primary bg-sidebar-primary/5" : "border-gray-200 hover:border-gray-300"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <cat.icon className="h-5 w-5 text-gray-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-sm text-gray-900">{cat.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{cat.description}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Details */}
          {step === 2 && (
            <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm p-6 md:p-8">
              <h3 className="text-lg font-bold text-gray-900 mb-1">Fraud Details</h3>
              <p className="text-sm text-gray-500 mb-6">Provide as much information as possible about the incident.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Title / Brief Description</label>
                  <Input name="title" value={formData.title} onChange={handleChange} placeholder="e.g., Online payment fraud by XYZ company" className="h-11" />
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Accused Person/Entity</label>
                    <Input name="accusedName" value={formData.accusedName} onChange={handleChange} placeholder="Name of person or company" className="h-11" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Accused Contact (if known)</label>
                    <Input name="accusedContact" value={formData.accusedContact} onChange={handleChange} placeholder="Phone, email, or address" className="h-11" />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Incident Date</label>
                    <Input type="date" name="incidentDate" value={formData.incidentDate} onChange={handleChange} className="h-11" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount Involved (if any)</label>
                    <Input name="amountInvolved" value={formData.amountInvolved} onChange={handleChange} placeholder="e.g., ₹50,000" className="h-11" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Detailed Description</label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={5}
                    placeholder="Describe the fraud incident in detail..."
                    className="w-full rounded-md border-2 border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sidebar-primary/30 focus:border-sidebar-primary resize-none"
                  />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                  <Button onClick={() => setStep(3)} className="bg-sidebar-primary hover:bg-sidebar-primary/90 text-white">Continue</Button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Evidence & Submit */}
          {step === 3 && (
            <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm p-6 md:p-8">
              <h3 className="text-lg font-bold text-gray-900 mb-1">Evidence & Submission</h3>
              <p className="text-sm text-gray-500 mb-6">Attach any supporting evidence and submit your report.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Evidence Description</label>
                  <textarea
                    name="evidenceDescription"
                    value={formData.evidenceDescription}
                    onChange={handleChange}
                    rows={3}
                    placeholder="Describe documents, screenshots, or evidence you have..."
                    className="w-full rounded-md border-2 border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sidebar-primary/30 focus:border-sidebar-primary resize-none"
                  />
                </div>
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-sidebar-primary/40 transition-colors cursor-pointer relative">
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={(e) => {
                      const files = e.target.files
                      if (files && files.length > 0) {
                        setFormData({ ...formData, evidenceDescription: formData.evidenceDescription + (formData.evidenceDescription ? ', ' : '') + Array.from(files).map(f => f.name).join(', ') })
                      }
                    }}
                  />
                  <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm font-medium text-gray-600">Click to upload evidence files</p>
                  <p className="text-xs text-gray-400 mt-1">PDF, Images, Documents (Max 10MB each)</p>
                </div>
                <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <input
                    type="checkbox"
                    id="policeReport"
                    checked={formData.policeReport}
                    onChange={(e) => setFormData({ ...formData, policeReport: e.target.checked })}
                    className="rounded"
                  />
                  <label htmlFor="policeReport" className="text-sm text-amber-800">
                    I have already filed an FIR/Police Report regarding this incident
                  </label>
                </div>

                {/* Emergency Contacts */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Important Helplines</p>
                  <div className="grid md:grid-cols-2 gap-2">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Phone className="h-4 w-4 text-red-500" />
                      Cyber Crime: 1930
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Phone className="h-4 w-4 text-blue-500" />
                      Police: 100
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Globe className="h-4 w-4 text-green-500" />
                      cybercrime.gov.in
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Phone className="h-4 w-4 text-orange-500" />
                      Consumer Helpline: 1800-11-4000
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                  <Button onClick={handleSubmit} className="bg-red-600 hover:bg-red-700 text-white px-6">
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Submit Report
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
export default ReportFraud