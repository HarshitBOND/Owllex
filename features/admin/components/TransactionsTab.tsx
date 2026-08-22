import { Calendar, Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { TransactionRecord } from "../types"
import { formatCurrency, formatDateTime, statusBadge } from "../utils"
import { Pagination } from "./Pagination"

interface TransactionsTabProps {
  transactions: TransactionRecord[]
  txTotal: number
  txPage: number
  txTotalPages: number
  txStatusFilter: string
  setTxStatusFilter: (value: string) => void
  txDateFrom: string
  setTxDateFrom: (value: string) => void
  txDateTo: string
  setTxDateTo: (value: string) => void
  onSearch: (page?: number) => void
}

export function TransactionsTab({
  transactions,
  txTotal,
  txPage,
  txTotalPages,
  txStatusFilter,
  setTxStatusFilter,
  txDateFrom,
  setTxDateFrom,
  txDateTo,
  setTxDateTo,
  onSearch,
}: TransactionsTabProps) {
  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700 shadow-sm p-4">
        <div className="flex flex-wrap gap-2">
          <select
            value={txStatusFilter}
            onChange={(e) => { setTxStatusFilter(e.target.value); setTimeout(() => onSearch(), 0) }}
            className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
          </select>
          <div className="flex items-center gap-1">
            <Calendar size={14} className="text-gray-400" />
            <input
              type="date"
              value={txDateFrom}
              onChange={(e) => setTxDateFrom(e.target.value)}
              className="px-2 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800"
            />
            <span className="text-gray-400 text-xs">to</span>
            <input
              type="date"
              value={txDateTo}
              onChange={(e) => setTxDateTo(e.target.value)}
              className="px-2 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800"
            />
          </div>
          <Button size="sm" onClick={() => onSearch()} className="gap-1.5">
            <Filter size={14} /> Apply
          </Button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{txTotal} total transactions</p>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">User</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Gateway</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Description</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">No transactions found</td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-white text-sm">
                        {tx.userId ? `${tx.userId.firstName} ${tx.userId.lastName}` : "Unknown"}
                      </p>
                      <p className="text-xs text-gray-500">{tx.userId?.email || ""}</p>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                      {formatCurrency(tx.amount, tx.currency)}
                    </td>
                    <td className="px-4 py-3">{statusBadge(tx.status)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 capitalize">{tx.paymentGateway}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[200px]">
                      <p className="truncate">{tx.description || "—"}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs">
                        {tx.receiptUrl ? (
                          <a
                            href={tx.receiptUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            Receipt
                          </a>
                        ) : null}
                        {tx.invoiceUrl ? (
                          <a
                            href={tx.invoiceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-violet-600 hover:underline"
                          >
                            Invoice
                          </a>
                        ) : null}
                      </div>
                      {tx.status === "failed" && tx.failureReason ? (
                        <p className="mt-1 text-xs text-red-600 truncate">{tx.failureReason}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap text-xs">{formatDateTime(tx.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={txPage}
          totalPages={txTotalPages}
          total={txTotal}
          label="transactions"
          onPrev={() => onSearch(txPage - 1)}
          onNext={() => onSearch(txPage + 1)}
        />
      </div>
    </div>
  )
}
