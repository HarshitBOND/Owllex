"use client"

import { redirect } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { FileText } from "lucide-react"
import Sidebar from "@/components/layout/sidebar"
import Navbar from "@/components/layout/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import { ProgressSteps } from "./components/ProgressSteps"
import { TemplateSelector } from "./components/TemplateSelector"
import { AffidavitDetailsForm } from "./components/AffidavitDetailsForm"
import { AffidavitPreview } from "./components/AffidavitPreview"
import { useAffidavitGenerator } from "./hooks/useAffidavitGenerator"

export default function GenerateAffidavitPage() {
  const { isOpen } = useSidebar()
  const { isLoaded, isSignedIn } = useUser()

  const {
    selectedTemplate,
    step,
    formValues,
    generating,
    generated,
    copied,
    docRef,
    template,
    selectTemplate,
    backToTemplates,
    setFieldValue,
    handleGenerate,
    editDetails,
    createAnother,
    copyDocument,
    previewDocument,
  } = useAffidavitGenerator()

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
          <ProgressSteps step={step} />

          {step === 1 && (
            <TemplateSelector selectedTemplate={selectedTemplate} onSelect={selectTemplate} />
          )}

          {step === 2 && template && (
            <AffidavitDetailsForm
              template={template}
              selectedTemplate={selectedTemplate}
              formValues={formValues}
              generating={generating}
              onFieldChange={setFieldValue}
              onBack={backToTemplates}
              onGenerate={handleGenerate}
            />
          )}

          {step === 3 && generated && (
            <AffidavitPreview
              docRef={docRef}
              formValues={formValues}
              copied={copied}
              onCopy={copyDocument}
              onPreview={previewDocument}
              onEditDetails={editDetails}
              onCreateAnother={createAnother}
            />
          )}
        </div>
      </div>
    </div>
  )
}
