import { CheckCircle } from "lucide-react"
import { cn } from "@/lib/utils"

const stepLabels = ["Template", "Details", "Preview"]

export function ProgressSteps({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {stepLabels.map((label, i) => (
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
  )
}
