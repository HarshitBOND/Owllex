import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import { ensureUser } from "@/app/api/lib/ensureUser"
import SimpleInvoice from "@/app/api/lib/models/simple-invoice"

const parseDateParam = (value: string | null) => {
  if (!value) {
    return null
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed
}

const monthKey = (value: Date) => {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

const clampNumber = (value: number) => Number(value.toFixed(2))

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    await connectMongoWithRetry()
    await ensureUser(userId)

    const fromParam = parseDateParam(request.nextUrl.searchParams.get("from"))
    const toParam = parseDateParam(request.nextUrl.searchParams.get("to"))

    const createdAtFilter: Record<string, Date> = {}
    if (fromParam) {
      createdAtFilter.$gte = fromParam
    }

    if (toParam) {
      createdAtFilter.$lte = toParam
    }

    const query: Record<string, unknown> = { clerkUid: userId }
    if (Object.keys(createdAtFilter).length > 0) {
      query.createdAt = createdAtFilter
    }

    const invoices = await SimpleInvoice.find(query)
      .select(
        "invoiceNumber clientName clientEmail status issueDate dueDate total paidAmount currency createdAt updatedAt",
      )
      .sort({ issueDate: -1 })
      .lean()
      .exec()

    const now = new Date()

    const summary = {
      invoiceCount: invoices.length,
      totalInvoiced: 0,
      totalCollected: 0,
      totalOutstanding: 0,
      overdueOutstanding: 0,
      paidCount: 0,
      pendingCount: 0,
      overdueCount: 0,
      draftCount: 0,
    }

    const monthlyMap = new Map<
      string,
      {
        month: string
        invoiced: number
        collected: number
        outstanding: number
        invoiceCount: number
      }
    >()

    const clientMap = new Map<
      string,
      {
        clientName: string
        clientEmail: string
        invoiceCount: number
        totalInvoiced: number
        totalCollected: number
        totalOutstanding: number
        overdueOutstanding: number
        lastInvoiceDate: string | null
      }
    >()

    const ledger = (invoices as any[]).map((invoice) => {
      const total = Number(invoice.total || 0)
      const paidAmount = Number(invoice.paidAmount || 0)
      const outstanding = Math.max(Number((total - paidAmount).toFixed(2)), 0)
      const dueDate = new Date(invoice.dueDate)
      const issueDate = new Date(invoice.issueDate)
      const isOverdue =
        invoice.status === "overdue" ||
        (invoice.status !== "paid" && outstanding > 0 && dueDate.getTime() < now.getTime())

      summary.totalInvoiced += total
      summary.totalCollected += paidAmount
      summary.totalOutstanding += outstanding

      if (isOverdue) {
        summary.overdueOutstanding += outstanding
      }

      if (invoice.status === "paid") {
        summary.paidCount += 1
      } else if (invoice.status === "pending") {
        summary.pendingCount += 1
      } else if (invoice.status === "overdue") {
        summary.overdueCount += 1
      } else {
        summary.draftCount += 1
      }

      const month = monthKey(issueDate)
      const monthBucket = monthlyMap.get(month) || {
        month,
        invoiced: 0,
        collected: 0,
        outstanding: 0,
        invoiceCount: 0,
      }

      monthBucket.invoiced += total
      monthBucket.collected += paidAmount
      monthBucket.outstanding += outstanding
      monthBucket.invoiceCount += 1
      monthlyMap.set(month, monthBucket)

      const clientIdentifier = `${invoice.clientName || "Unknown"}::${invoice.clientEmail || ""}`
      const clientBucket = clientMap.get(clientIdentifier) || {
        clientName: invoice.clientName || "Unknown",
        clientEmail: invoice.clientEmail || "",
        invoiceCount: 0,
        totalInvoiced: 0,
        totalCollected: 0,
        totalOutstanding: 0,
        overdueOutstanding: 0,
        lastInvoiceDate: null,
      }

      clientBucket.invoiceCount += 1
      clientBucket.totalInvoiced += total
      clientBucket.totalCollected += paidAmount
      clientBucket.totalOutstanding += outstanding
      if (isOverdue) {
        clientBucket.overdueOutstanding += outstanding
      }

      const issueIso = issueDate.toISOString()
      if (!clientBucket.lastInvoiceDate || issueIso > clientBucket.lastInvoiceDate) {
        clientBucket.lastInvoiceDate = issueIso
      }
      clientMap.set(clientIdentifier, clientBucket)

      return {
        id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        clientName: invoice.clientName,
        clientEmail: invoice.clientEmail,
        status: invoice.status,
        issueDate: issueDate.toISOString(),
        dueDate: dueDate.toISOString(),
        total: clampNumber(total),
        paidAmount: clampNumber(paidAmount),
        outstanding: clampNumber(outstanding),
        currency: invoice.currency || "USD",
        isOverdue,
      }
    })

    const monthly = Array.from(monthlyMap.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((bucket) => ({
        ...bucket,
        invoiced: clampNumber(bucket.invoiced),
        collected: clampNumber(bucket.collected),
        outstanding: clampNumber(bucket.outstanding),
      }))

    const clients = Array.from(clientMap.values())
      .sort((a, b) => b.totalOutstanding - a.totalOutstanding)
      .map((bucket) => ({
        ...bucket,
        totalInvoiced: clampNumber(bucket.totalInvoiced),
        totalCollected: clampNumber(bucket.totalCollected),
        totalOutstanding: clampNumber(bucket.totalOutstanding),
        overdueOutstanding: clampNumber(bucket.overdueOutstanding),
      }))

    return NextResponse.json({
      success: true,
      range: {
        from: fromParam?.toISOString() || null,
        to: toParam?.toISOString() || null,
      },
      summary: {
        ...summary,
        totalInvoiced: clampNumber(summary.totalInvoiced),
        totalCollected: clampNumber(summary.totalCollected),
        totalOutstanding: clampNumber(summary.totalOutstanding),
        overdueOutstanding: clampNumber(summary.overdueOutstanding),
      },
      monthly,
      clients,
      ledger,
    })
  } catch (error) {
    console.error("Invoice report GET error:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch invoice report" }, { status: 500 })
  }
}
