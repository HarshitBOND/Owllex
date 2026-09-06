import { NextRequest, NextResponse } from "next/server"
import { PDFDocument } from "pdf-lib"
import { requireAdmin, logAdminAction } from "@/app/api/lib/adminMiddleware"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import DocumentTemplate from "@/app/api/lib/models/document-template"
import DocumentTemplateVersion from "@/app/api/lib/models/document-template-version"
import { validateUploadBuffer, sanitizeFileName } from "@/app/api/lib/uploadValidation"
import { contentAddressedKey } from "@/app/api/lib/storage/dedupe"
import { compressPdf } from "@/app/api/lib/storage/compressPdf"
import { putPrivateObject } from "@/app/api/lib/storage/r2"
import { extractDocumentText } from "@/app/api/lib/contractExtract"
import { sanitizeDocumentHtml } from "@/app/api/lib/html/sanitizeHtml"
import { extractTemplateFromText } from "@/app/api/lib/services/templateExtraction"
import { seedFirstVersion } from "@/app/api/lib/services/templateVersions"
import { slugify } from "@/app/api/lib/documentTemplates"
import { validateTokenParity } from "@/lib/templates/fields"

/**
 * Turns one uploaded court PDF into a draft template.
 *
 * One file per request on purpose. A batch of ten scanned forms cannot finish
 * inside any serverless limit, and a single bad file would fail the whole set,
 * so the admin UI drives this as a client-side queue: each file gets its own
 * request, its own status and its own retry.
 *
 * OCR on a scanned form is the slow part, and extractDocumentText already waits
 * up to 240s for it -- this route has to outlive that or the platform kills the
 * function mid-flight and the browser gets a gateway page instead of a message.
 */
export const maxDuration = 300

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (admin instanceof NextResponse) return admin

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { success: false, error: "Template import needs the AI provider configured. Set OPENAI_API_KEY." },
      { status: 503 }
    )
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ success: false, error: "Expected a file upload." }, { status: 400 })
  }

  const file = form.get("file")
  const force = form.get("force") === "true"

  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: "No file was attached." }, { status: 400 })
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { success: false, error: `"${file.name}" is larger than the 25MB limit.` },
      { status: 413 }
    )
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const filename = sanitizeFileName(file.name)

  const validation = validateUploadBuffer(filename, bytes, file.type)
  if (!validation.ok) {
    return NextResponse.json({ success: false, error: validation.error }, { status: 400 })
  }
  if (!filename.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json(
      { success: false, error: "Court forms have to be imported as PDFs." },
      { status: 400 }
    )
  }

  await connectMongoWithRetry()

  // Keyed on the bytes as uploaded, so the same form re-uploaded under a
  // different filename lands on the same object and is recognised here rather
  // than quietly becoming a second copy of the same court form.
  const { key, exists, sha256 } = await contentAddressedKey({
    prefix: "templates",
    bytes,
    filename,
  })

  if (!force) {
    const already = await DocumentTemplateVersion.findOne({ "sourcePdf.sha256": sha256 })
      .select("templateId version")
      .lean()
    if (already) {
      const family = await DocumentTemplate.findById(already.templateId)
        .select("title status")
        .lean()
      return NextResponse.json(
        {
          success: false,
          duplicateOf: family
            ? { id: String(already.templateId), title: family.title, status: family.status }
            : null,
          error: family
            ? `This exact PDF is already stored as "${family.title}". Import it again only if you meant to.`
            : "This exact PDF has already been imported.",
        },
        { status: 409 }
      )
    }
  }

  let pageCount = 0
  try {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
    pageCount = pdf.getPageCount()
  } catch {
    return NextResponse.json(
      { success: false, error: `"${filename}" could not be read as a PDF. It may be corrupt or password-protected.` },
      { status: 400 }
    )
  }

  // Stored before extraction, and kept forever. It is the reference copy the
  // admin reviews against, the "court's original form" every advocate can
  // download, and the literal canvas that stamping draws onto.
  const compressed = await compressPdf(bytes)
  if (!exists) {
    try {
      await putPrivateObject(key, compressed.buffer, "application/pdf")
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: `Could not archive "${filename}": ${error instanceof Error ? error.message : "storage error"}`,
        },
        { status: 502 }
      )
    }
  }

  let text: string
  try {
    const extraction = await extractDocumentText({
      filename,
      bytes,
      mimeType: "application/pdf",
    })
    text = extraction.text
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Text extraction failed." },
      { status: 502 }
    )
  }

  if (!text.trim()) {
    return NextResponse.json(
      {
        success: false,
        error: `Nothing could be read from "${filename}". If it is a scan, the OCR step found no text on it.`,
      },
      { status: 422 }
    )
  }

  let extracted
  try {
    const result = await extractTemplateFromText({
      text,
      filename,
      // The heaviest model available: this runs once per form, an admin waits
      // for it, and every advocate afterwards inherits whatever it gets wrong.
      modelKey: "capable",
    })
    extracted = result.template
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
    return NextResponse.json(
      {
        success: false,
        error: timedOut
          ? `Reading the structure of "${filename}" took too long. Very long forms may need splitting.`
          : `Could not turn "${filename}" into a template: ${error instanceof Error ? error.message : "unknown error"}`,
      },
      { status: 502 }
    )
  }

  const bodyHtml = sanitizeDocumentHtml(extracted.bodyHtml)

  // A body and field list that disagree do NOT block the import. The admin is
  // about to review this against the original anyway, and a near-miss is far
  // more useful to correct than to throw away. Publishing is what enforces
  // parity -- PATCH rejects it -- so a mismatched template cannot reach anyone.
  const parityErrors = validateTokenParity(bodyHtml, extracted.fields)

  // The extraction model has no length cap on these, but the schema does
  // (title 160, description 400) -- a verbose court letterhead/citation
  // must not turn into an uncaught ValidationError this far into the request.
  const title = extracted.title.slice(0, 160)
  const description = extracted.description.slice(0, 400)

  const base = slugify(title)
  let slug = base

  try {
    for (let n = 2; await DocumentTemplate.exists({ slug }); n++) {
      slug = `${base}-${n}`
      if (n > 50) {
        slug = `${base}-${Date.now()}`
        break
      }
    }

    const sourcePdf = {
      r2Key: key,
      filename,
      sizeBytes: compressed.storedBytes,
      sha256,
      pageCount,
    }

    const template = await DocumentTemplate.create({
      title,
      slug,
      description,
      category: extracted.category,
      bodyHtml,
      fields: extracted.fields,
      // Never published on import. This is a language model's reconstruction of a
      // court document; it reaches an advocate only after a person has put it
      // beside the original and agreed.
      status: "draft",
      latestVersion: 1,
      createdBy: admin.dbUserId,
      updatedBy: admin.dbUserId,
      publishedAt: null,
    })

    await seedFirstVersion({
      templateId: template._id,
      userId: admin.dbUserId,
      input: {
        bodyHtml,
        fields: extracted.fields,
        sourcePdf,
        renderMode: "html",
        changeNote: `Imported from ${filename}`,
      },
    })

    await logAdminAction(admin.dbUserId, "imported_document_template", request, {
      targetType: "document",
      targetId: String(template._id),
      details: `Imported "${title}" from ${filename} (${extracted.fields.length} fields)`,
    })

    return NextResponse.json(
      {
        success: true,
        template: {
          id: String(template._id),
          title: template.title,
          description: template.description,
          category: template.category,
          status: template.status,
          bodyHtml,
          fields: extracted.fields,
          sourcePdf,
        },
        parityErrors,
      },
      { status: 201 }
    )
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: `Could not save the template extracted from "${filename}": ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      },
      { status: 500 }
    )
  }
}
