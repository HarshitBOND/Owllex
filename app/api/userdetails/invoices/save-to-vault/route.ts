import { NextRequest, NextResponse } from "next/server"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import { enforceRateLimit, requireUserContext } from "@/app/api/lib/routeGuards"
import SimpleInvoice from "@/app/api/lib/models/simple-invoice"
import User from "@/app/api/lib/models/user"
import { canAccessFirm, type TeamPermission } from "@/app/api/lib/services/rbac"
import { generateInvoicePdfBuffer } from "@/app/api/lib/export/invoicePdf"
import { saveBufferToVault } from "@/app/api/lib/vault/copyToVault"

export async function POST(request: NextRequest) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { blockedResponse } = await enforceRateLimit(request, {
    key: `vault:save:invoices:${userContext.clerkUid}`,
    max: 40,
    windowMs: 10 * 60 * 1000,
  })
  if (blockedResponse) return blockedResponse

  const invoiceId = request.nextUrl.searchParams.get("id")
  if (!invoiceId) {
    return NextResponse.json({ success: false, error: "Missing invoice id" }, { status: 400 })
  }

  await connectMongoWithRetry()
  const userId = userContext.clerkUid

  let invoice: any = await SimpleInvoice.findOne({ _id: invoiceId, clerkUid: userId }).lean().exec()

  if (!invoice) {
    const actorUser = await User.findOne({ clerkUid: userId }).select("primaryFirmId").lean().exec()
    const actorFirmId = (actorUser as any)?.primaryFirmId ? (actorUser as any).primaryFirmId.toString() : null
    if (actorFirmId) {
      const firmAccess = await canAccessFirm(userId, actorFirmId, "invoice.read" as TeamPermission)
      if (firmAccess.allowed) {
        invoice = await SimpleInvoice.findOne({ _id: invoiceId, firmId: actorFirmId }).lean().exec()
      }
    }
  }

  if (!invoice) {
    return NextResponse.json({ success: false, error: "Invoice not found" }, { status: 404 })
  }

  const buffer = await generateInvoicePdfBuffer(invoice)
  const result = await saveBufferToVault({
    clerkUid: userId,
    filename: `${invoice.invoiceNumber || "invoice"}.pdf`,
    mimeType: "application/pdf",
    bytes: buffer,
  })

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 })
  }

  return NextResponse.json({ success: true, alreadyInVault: result.alreadyInVault, document: result.document })
}
