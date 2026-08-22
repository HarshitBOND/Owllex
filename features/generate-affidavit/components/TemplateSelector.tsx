import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { affidavitTemplates } from "../utils"

interface TemplateSelectorProps {
  selectedTemplate: string | null
  onSelect: (templateId: string) => void
}

export function TemplateSelector({ selectedTemplate, onSelect }: TemplateSelectorProps) {
  return (
    <div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {affidavitTemplates.map((tmpl) => (
          <button
            key={tmpl.id}
            onClick={() => onSelect(tmpl.id)}
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
  )
}
