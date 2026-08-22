import { Sparkles, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { AffidavitTemplate, FormValues } from "../types"

const textareaFields = new Set(["Statement", "Description", "Ownership Details", "Sources"])

interface AffidavitDetailsFormProps {
  template: AffidavitTemplate
  selectedTemplate: string | null
  formValues: FormValues
  generating: boolean
  onFieldChange: (field: string, value: string) => void
  onBack: () => void
  onGenerate: () => void
}

export function AffidavitDetailsForm({
  template,
  selectedTemplate,
  formValues,
  generating,
  onFieldChange,
  onBack,
  onGenerate,
}: AffidavitDetailsFormProps) {
  return (
    <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm p-6 md:p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className={`p-2 rounded-lg ${template.bgColor}`}>
          <template.icon className={`h-5 w-5 ${template.color}`} />
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
            {textareaFields.has(field) ? (
              <textarea
                value={formValues[field] || ""}
                onChange={(e) => onFieldChange(field, e.target.value)}
                rows={4}
                placeholder={`Enter ${field.toLowerCase()}...`}
                className="w-full rounded-md border-2 border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sidebar-primary/30 focus:border-sidebar-primary resize-none"
              />
            ) : (
              <Input
                value={formValues[field] || ""}
                onChange={(e) => onFieldChange(field, e.target.value)}
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
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button onClick={onGenerate} className="bg-sidebar-primary hover:bg-sidebar-primary/90 text-white px-6" disabled={generating}>
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
  )
}
