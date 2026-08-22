import { Paperclip, X } from "lucide-react"

interface EvidenceUploaderProps {
  evidenceUrls: string[]
  uploading: boolean
  isBusy: boolean
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void
  onRemove: (url: string) => void
}

export function EvidenceUploader({ evidenceUrls, uploading, isBusy, onUpload, onRemove }: EvidenceUploaderProps) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-medium text-gray-800">Evidence Attachments</p>
          <p className="text-xs text-gray-500">Upload screenshots, receipts, or supporting files.</p>
        </div>

        <label className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-50">
          <Paperclip className="h-4 w-4" />
          {uploading ? "Uploading..." : "Upload files"}
          <input
            type="file"
            multiple
            className="hidden"
            onChange={onUpload}
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
                onClick={() => onRemove(url)}
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
  )
}
