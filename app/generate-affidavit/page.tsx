"use client"

import { useState, useRef } from "react"
import Sidebar from "@/components/dashboard/sidebar"
import Navbar from "@/components/dashboard/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import { useUser } from "@clerk/nextjs"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  FileText, Sparkles, Download, Eye,
  ChevronRight, BookOpen, Scale, Shield, Briefcase,
  CheckCircle, Copy, Wand2
} from "lucide-react"

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")

const affidavitTemplates = [
  {
    id: "general",
    name: "General Affidavit",
    description: "A standard sworn statement for general legal purposes",
    icon: FileText,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    fields: ["Full Name", "Address", "Statement"],
  },
  {
    id: "self-declaration",
    name: "Self Declaration",
    description: "For identity verification, name change, or self-attestation",
    icon: Shield,
    color: "text-green-600",
    bgColor: "bg-green-50",
    fields: ["Full Name", "Father's Name", "Address", "Purpose"],
  },
  {
    id: "income",
    name: "Income Affidavit",
    description: "Declaration of annual income from all sources",
    icon: Briefcase,
    color: "text-violet-600",
    bgColor: "bg-violet-50",
    fields: ["Full Name", "Occupation", "Annual Income", "Sources"],
  },
  {
    id: "property",
    name: "Property Affidavit",
    description: "For property ownership, transfer, or dispute matters",
    icon: BookOpen,
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    fields: ["Full Name", "Property Address", "Ownership Details"],
  },
  {
    id: "court",
    name: "Court Affidavit",
    description: "For filing in court proceedings and legal cases",
    icon: Scale,
    color: "text-teal-600",
    bgColor: "bg-teal-50",
    fields: ["Case Number", "Court Name", "Petitioner", "Respondent", "Statement"],
  },
  {
    id: "custom",
    name: "Custom Affidavit",
    description: "AI-powered: Describe your need and we generate it",
    icon: Sparkles,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    fields: ["Description"],
  },
]

const GenerateAffidavit = () => {
  const { isOpen } = useSidebar()
  const { isLoaded, isSignedIn } = useUser()
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [step, setStep] = useState(1)
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [copied, setCopied] = useState(false)
  const docRef = useRef<HTMLDivElement>(null)

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

  const template = affidavitTemplates.find(t => t.id === selectedTemplate)

  const handleGenerate = () => {
    setGenerating(true)
    setTimeout(() => {
      setGenerating(false)
      setGenerated(true)
      setStep(3)
    }, 2500)
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className={cn("bg-[#F3F5F9] min-h-screen w-full transition-all duration-300 pb-20 lg:pb-0", isOpen ? "lg:ml-48" : "lg:ml-12")}>
        <div className="bg-white border-b border-gray-200 w-full">
          <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-4">
            <Navbar location="Generate Affidavit" />
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-teal-50 rounded-lg">
                <FileText className="h-6 w-6 text-teal-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Generate Affidavit</h2>
                <p className="text-sm text-gray-500">AI-powered affidavit generation with legal templates</p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 md:px-6 py-6">
          {/* Progress Steps */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {["Template", "Details", "Preview"].map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <div className="flex flex-col items-center">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all",
                    step > i + 1 ? "bg-green-500 text-white" :
                    step === i + 1 ? "bg-sidebar-primary text-white" : "bg-gray-200 text-gray-500"
                  )}>
                    {step > i + 1 ? <CheckCircle size={16} /> : i + 1}
                  </div>
                  <span className="text-[10px] text-gray-500 mt-1">{label}</span>
                </div>
                {i < 2 && <div className={cn("w-12 h-0.5 mb-5", step > i + 1 ? "bg-green-500" : "bg-gray-200")} />}
              </div>
            ))}
          </div>

          {/* Step 1: Select Template */}
          {step === 1 && (
            <div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {affidavitTemplates.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    onClick={() => { setSelectedTemplate(tmpl.id); setStep(2) }}
                    className={cn(
                      "bg-white rounded-xl border-2 p-5 text-left transition-all hover:shadow-md group cursor-pointer",
                      selectedTemplate === tmpl.id ? "border-sidebar-primary" : "border-gray-200 hover:border-gray-300"
                    )}
                  >
                    <div className={cn("p-2 rounded-lg inline-flex mb-3", tmpl.bgColor)}>
                      <tmpl.icon className={cn("h-5 w-5", tmpl.color)} />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-1">{tmpl.name}</h3>
                    <p className="text-sm text-gray-500 mb-3">{tmpl.description}</p>
                    <div className="flex items-center text-xs text-sidebar-primary font-medium">
                      Select Template <ChevronRight className="h-3 w-3 ml-1 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Fill Details */}
          {step === 2 && template && (
            <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm p-6 md:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className={cn("p-2 rounded-lg", template.bgColor)}>
                  <template.icon className={cn("h-5 w-5", template.color)} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{template.name}</h3>
                  <p className="text-sm text-gray-500">{template.description}</p>
                </div>
              </div>

              <div className="space-y-4">
                {template.fields.map((field) => (
                  <div key={field}>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{field}</label>
                    {field === "Statement" || field === "Description" || field === "Ownership Details" || field === "Sources" ? (
                      <textarea
                        value={formValues[field] || ""}
                        onChange={(e) => setFormValues({ ...formValues, [field]: e.target.value })}
                        rows={4}
                        placeholder={`Enter ${field.toLowerCase()}...`}
                        className="w-full rounded-md border-2 border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sidebar-primary/30 focus:border-sidebar-primary resize-none"
                      />
                    ) : (
                      <Input
                        value={formValues[field] || ""}
                        onChange={(e) => setFormValues({ ...formValues, [field]: e.target.value })}
                        placeholder={`Enter ${field.toLowerCase()}`}
                        className="h-11"
                      />
                    )}
                  </div>
                ))}

                {selectedTemplate === "custom" && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <Sparkles className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-800">AI-Powered Generation</p>
                        <p className="text-xs text-amber-600 mt-0.5">
                          Describe your affidavit requirements in detail. Our AI will generate a professional legal document tailored to your needs.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-4">
                  <Button variant="outline" onClick={() => { setStep(1); setSelectedTemplate(null) }}>
                    Back
                  </Button>
                  <Button onClick={handleGenerate} className="bg-sidebar-primary hover:bg-sidebar-primary/90 text-white px-6" disabled={generating}>
                    {generating ? (
                      <>
                        <div className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin mr-2" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-4 w-4 mr-2" />
                        Generate Affidavit
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Preview */}
          {step === 3 && generated && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm p-6 md:p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-50 rounded-lg">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">Affidavit Generated</h3>
                      <p className="text-sm text-gray-500">Review and download your document</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => {
                      if (docRef.current) {
                        navigator.clipboard.writeText(docRef.current.innerText)
                        setCopied(true)
                        setTimeout(() => setCopied(false), 2000)
                      }
                    }}>
                      <Copy className="h-4 w-4 mr-1" /> {copied ? "Copied!" : "Copy"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => docRef.current?.scrollIntoView({ behavior: 'smooth' })}>
                      <Eye className="h-4 w-4 mr-1" /> Preview
                    </Button>
                    <Button size="sm" className="bg-sidebar-primary hover:bg-sidebar-primary/90 text-white" onClick={() => {
                      if (docRef.current) {
                        const safePrintableText = escapeHtml(docRef.current.innerText)
                        const printableBlob = new Blob([safePrintableText], { type: 'text/plain' })
                        const printableUrl = URL.createObjectURL(printableBlob)
                        const printWindow = window.open(printableUrl, '_blank')
                        if (printWindow) {
                          printWindow.onload = () => {
                            printWindow.print()
                            URL.revokeObjectURL(printableUrl)
                          }
                        } else {
                          URL.revokeObjectURL(printableUrl)
                        }
                      }
                    }}>
                      <Download className="h-4 w-4 mr-1" /> Download PDF
                    </Button>
                  </div>
                </div>

                <div ref={docRef} className="bg-gray-50 border-2 border-gray-200 rounded-xl p-6 md:p-10 font-serif text-sm leading-relaxed">
                  <div className="text-center mb-8">
                    <h2 className="text-lg font-bold uppercase tracking-wider">AFFIDAVIT</h2>
                    <p className="text-gray-500 text-xs mt-1">(On Stamp Paper of Appropriate Value)</p>
                  </div>

                  <p className="mb-4">
                    I, <strong>{formValues["Full Name"] || "[Full Name]"}</strong>,
                    {formValues["Father's Name"] && <> Son/Daughter of <strong>{formValues["Father's Name"]}</strong>,</>}
                    residing at <strong>{formValues["Address"] || formValues["Property Address"] || "[Address]"}</strong>,
                    do hereby solemnly affirm and state on oath as follows:
                  </p>

                  <ol className="list-decimal ml-6 space-y-3 mb-6">
                    <li>That I am the deponent herein and competent to swear this affidavit.</li>
                    <li>That the statements made herein are true and correct to the best of my knowledge and belief.</li>
                    <li>
                      {formValues["Statement"] || formValues["Description"] || formValues["Purpose"] ||
                        "That [the purpose/statement of the affidavit will appear here based on the template selected]."}
                    </li>
                    {formValues["Annual Income"] && (
                      <li>That my annual income from all sources is approximately <strong>Rs. {formValues["Annual Income"]}</strong>.</li>
                    )}
                    {formValues["Case Number"] && (
                      <li>That this affidavit is filed in respect of Case No. <strong>{formValues["Case Number"]}</strong> before <strong>{formValues["Court Name"] || "the Hon'ble Court"}</strong>.</li>
                    )}
                  </ol>

                  <div className="mt-8 grid grid-cols-2 gap-8">
                    <div>
                      <p className="text-gray-400">Place: _______________</p>
                      <p className="text-gray-400 mt-2">Date: _______________</p>
                    </div>
                    <div className="text-right">
                      <p className="text-gray-400 mb-8">_______________</p>
                      <p className="font-semibold">(Deponent)</p>
                    </div>
                  </div>

                  <div className="mt-8 pt-4 border-t border-gray-300 text-center text-xs text-gray-400">
                    VERIFICATION: I verify that the contents of the above affidavit are true and correct to my knowledge and belief.
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Button variant="outline" onClick={() => { setStep(2); setGenerated(false) }}>
                  Edit Details
                </Button>
                <Button onClick={() => { setStep(1); setSelectedTemplate(null); setFormValues({}); setGenerated(false) }}>
                  Create Another
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
export default GenerateAffidavit