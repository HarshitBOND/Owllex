import PDFDocument from "pdfkit"

const normalizeCurrency = (currency?: string | null) => (currency || "INR").toUpperCase()

const toDisplayCurrency = (amount: number, currency = "INR") => {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

const getOutstandingAmount = (invoice: any) => {
  const total = Number(invoice.total || 0)
  const paidAmount = Number(invoice.paidAmount || 0)
  return Math.max(Number((total - paidAmount).toFixed(2)), 0)
}

export const generateInvoicePdfBuffer = (invoice: any) =>
  new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 })
    const chunks: Buffer[] = []

    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    const currency = normalizeCurrency(invoice.currency)
    const issueDate = new Date(invoice.issueDate)
    const dueDate = new Date(invoice.dueDate)

    doc.fontSize(20).text("Ravenslaw Invoice", { align: "left" })
    doc.moveDown(0.4)
    doc.fontSize(10).fillColor("#555").text(`Invoice Number: ${invoice.invoiceNumber}`)
    doc.text(`Issue Date: ${issueDate.toLocaleDateString("en-IN")}`)
    doc.text(`Due Date: ${dueDate.toLocaleDateString("en-IN")}`)

    doc.moveDown(1)
    doc.fillColor("#000").fontSize(13).text("Bill To")
    doc.fontSize(10).fillColor("#333").text(invoice.clientName || "Client")
    if (invoice.clientCompany) {
      doc.text(invoice.clientCompany)
    }
    if (invoice.clientEmail) {
      doc.text(invoice.clientEmail)
    }

    doc.moveDown(1)
    doc.fillColor("#000").fontSize(13).text("Items")

    const startY = doc.y + 8
    const itemRows = Array.isArray(invoice.items) ? invoice.items : []

    doc.fontSize(10).text("Description", 48, startY)
    doc.text("Qty", 280, startY, { width: 60, align: "right" })
    doc.text("Rate", 350, startY, { width: 80, align: "right" })
    doc.text("Amount", 440, startY, { width: 110, align: "right" })

    let rowY = startY + 22

    for (const item of itemRows) {
      doc.fontSize(10).fillColor("#111").text(item.description || "Item", 48, rowY, {
        width: 220,
      })
      doc.text(String(item.quantity || 0), 280, rowY, { width: 60, align: "right" })
      doc.text(toDisplayCurrency(Number(item.rate || 0), currency), 350, rowY, {
        width: 80,
        align: "right",
      })
      doc.text(toDisplayCurrency(Number(item.amount || 0), currency), 440, rowY, {
        width: 110,
        align: "right",
      })

      rowY += 20
    }

    const totalsY = rowY + 18
    doc.fontSize(10).fillColor("#333").text("Subtotal", 350, totalsY, { width: 80, align: "right" })
    doc.text(toDisplayCurrency(Number(invoice.subtotal || 0), currency), 440, totalsY, {
      width: 110,
      align: "right",
    })

    if (Number(invoice.discount || 0) > 0) {
      doc.text("Discount", 350, totalsY + 18, { width: 80, align: "right" })
      doc.text(`-${toDisplayCurrency(Number(invoice.discount || 0), currency)}`, 440, totalsY + 18, {
        width: 110,
        align: "right",
      })
    }

    doc.text(`Tax (${Number(invoice.taxRate || 0)}%)`, 350, totalsY + 36, { width: 80, align: "right" })
    doc.text(toDisplayCurrency(Number(invoice.tax || 0), currency), 440, totalsY + 36, {
      width: 110,
      align: "right",
    })

    const totalY = totalsY + 58
    doc.fontSize(12).fillColor("#000").text("Total", 350, totalY, { width: 80, align: "right" })
    doc.text(toDisplayCurrency(Number(invoice.total || 0), currency), 440, totalY, {
      width: 110,
      align: "right",
    })

    const outstanding = getOutstandingAmount(invoice)
    doc.fontSize(10)
      .fillColor("#333")
      .text("Paid", 350, totalY + 22, { width: 80, align: "right" })
      .text(toDisplayCurrency(Number(invoice.paidAmount || 0), currency), 440, totalY + 22, {
        width: 110,
        align: "right",
      })
      .text("Outstanding", 350, totalY + 40, { width: 80, align: "right" })
      .text(toDisplayCurrency(outstanding, currency), 440, totalY + 40, { width: 110, align: "right" })

    if (invoice.notes) {
      doc.moveDown(2)
      doc.fontSize(12).fillColor("#000").text("Notes")
      doc.fontSize(10).fillColor("#333").text(invoice.notes)
    }

    doc.end()
  })
