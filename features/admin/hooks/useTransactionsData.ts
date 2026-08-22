import { useCallback, useState } from "react"
import type { TransactionRecord } from "../types"

export function useTransactionsData() {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([])
  const [txTotal, setTxTotal] = useState(0)
  const [txPage, setTxPage] = useState(1)
  const [txTotalPages, setTxTotalPages] = useState(1)
  const [txStatusFilter, setTxStatusFilter] = useState("")
  const [txDateFrom, setTxDateFrom] = useState("")
  const [txDateTo, setTxDateTo] = useState("")

  const fetchTransactions = useCallback(async (page = 1) => {
    try {
      const p = new URLSearchParams({ page: String(page), limit: "20" })
      if (txStatusFilter) p.set("status", txStatusFilter)
      if (txDateFrom) p.set("dateFrom", txDateFrom)
      if (txDateTo) p.set("dateTo", txDateTo)
      const res = await fetch(`/api/admin/transactions?${p}`)
      const data = await res.json()
      if (data.success) {
        setTransactions(data.transactions)
        setTxTotal(data.total)
        setTxPage(data.page)
        setTxTotalPages(data.totalPages)
      }
    } catch (err) {
      console.error("Transactions fetch error:", err)
    }
  }, [txStatusFilter, txDateFrom, txDateTo])

  return {
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
    fetchTransactions,
  }
}
