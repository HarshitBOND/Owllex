import { Eye, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { DocumentRecord } from "../types"
import { formatBytes, formatDateTime, openDocument } from "../utils"
import { Pagination } from "./Pagination"

interface DocumentsTabProps {
  documents: DocumentRecord[]
  docsTotal: number
  docsPage: number
  docsTotalPages: number
  docsSearch: string
  setDocsSearch: (value: string) => void
  docsTypeFilter: string
  setDocsTypeFilter: (value: string) => void
  onSearch: (page?: number) => void
}

export function DocumentsTab({
  documents,
  docsTotal,
  docsPage,
  docsTotalPages,
  docsSearch,
  setDocsSearch,
  docsTypeFilter,
  setDocsTypeFilter,
  onSearch,
}: DocumentsTabProps) {
  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700 shadow-sm p-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={docsSearch}
              onChange={(e) => setDocsSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSearch()}
              placeholder="Search documents..."
              className="w-full pl-9 pr-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            />
          </div>
          <select
            value={docsTypeFilter}
            onChange={(e) => { setDocsTypeFilter(e.target.value); setTimeout(() => onSearch(), 0) }}
            className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800"
          >
            <option value="">All Types</option>
            <option value="affidavit">Affidavit</option>
            <option value="invoice">Invoice</option>
            <option value="legal_notice">Legal Notice</option>
            <option value="contract">Contract</option>
            <option value="report">Report</option>
            <option value="other">Other</option>
          </select>
          <Button size="sm" onClick={() => onSearch()} className="gap-1.5">
            <Search size={14} /> Search
          </Button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{docsTotal} total documents</p>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Title</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">User</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Size</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Created</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {documents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">No documents found</td>
                </tr>
              ) : (
                documents.map((doc) => (
                  <tr key={doc._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white max-w-[200px] truncate">
                      {doc.title || doc.filePath.split("/").pop() || "Untitled"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 capitalize">
                        {doc.documentType.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-sm">
                      {doc.userId ? `${doc.userId.firstName} ${doc.userId.lastName}` : "Unknown"}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">{formatBytes(doc.fileSize)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap text-xs">{formatDateTime(doc.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openDocument(doc.filePath)}>
                        <Eye size={12} /> View
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={docsPage}
          totalPages={docsTotalPages}
          total={docsTotal}
          label="documents"
          onPrev={() => onSearch(docsPage - 1)}
          onNext={() => onSearch(docsPage + 1)}
        />
      </div>
    </div>
  )
}
