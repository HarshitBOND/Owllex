import type { RefObject } from "react"
import { CheckCircle, Copy, Download, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { FormValues } from "../types"
import { escapeHtml } from "../utils"

interface AffidavitPreviewProps {
  docRef: RefObject<HTMLDivElement | null>
  formValues: FormValues
  copied: boolean
  onCopy: () => void
  onPreview: () => void
  onEditDetails: () => void
  onCreateAnother: () => void
}

function downloadDocument(docRef: RefObject<HTMLDivElement | null>) {
  if (!docRef.current) return

  const safePrintableText = escapeHtml(docRef.current.innerText)
  const printableBlob = new Blob([safePrintableText], { type: "text/plain" })
  const printableUrl = URL.createObjectURL(printableBlob)
  const printWindow = window.open(printableUrl, "_blank")
  if (printWindow) {
    printWindow.onload = () => {
      printWindow.print()
      URL.revokeObjectURL(printableUrl)
    }
  } else {
    URL.revokeObjectURL(printableUrl)
  }
}

export function AffidavitPreview({
  docRef,
  formValues,
  copied,
  onCopy,
  onPreview,
  onEditDetails,
  onCreateAnother,
}: AffidavitPreviewProps) {
  return (
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
            <Button variant="outline" size="sm" onClick={onCopy}>
              <Copy className="h-4 w-4 mr-1" /> {copied ? "Copied!" : "Copy"}
            </Button>
            <Button variant="outline" size="sm" onClick={onPreview}>
              <Eye className="h-4 w-4 mr-1" /> Preview
            </Button>
            <Button size="sm" className="bg-sidebar-primary hover:bg-sidebar-primary/90 text-white" onClick={() => downloadDocument(docRef)}>
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
        <Button variant="outline" onClick={onEditDetails}>
          Edit Details
        </Button>
        <Button onClick={onCreateAnother}>
          Create Another
        </Button>
      </div>
    </div>
  )
}
