import { createHash } from "crypto"
import { getPrivateObject, putPrivateObject } from "@/app/api/lib/storage/r2"
import { contentAddressedKey } from "@/app/api/lib/storage/dedupe"
import { compressPdf } from "@/app/api/lib/storage/compressPdf"
import VaultDocument from "@/app/api/lib/models/vault-document"

const MAX_DOCS_PER_VAULT = 200

export type VaultSaveResult =
  | {
      ok: true
      alreadyInVault: boolean
      document: { id: string; filename: string; mimeType: string; size: number }
    }
  | { ok: false; error: string }

async function storeBytesInVault(opts: {
  clerkUid: string
  filename: string
  mimeType: string
  bytes: Buffer
  /**
   * Set when the source was already put through compressPdf by the route that
   * stored it. The image pass is lossy, so running it a second time softens
   * seals and fine print again to win a percent or two -- a bad trade on a
   * legal document. Legacy rows predate the field and default to false, so
   * anything stored before compression existed still gets a pass.
   */
  alreadyCompressed?: boolean
}): Promise<VaultSaveResult> {
  const { clerkUid, filename, mimeType, bytes, alreadyCompressed } = opts

  const { key: r2Key } = await contentAddressedKey({
    prefix: `${clerkUid}/vault`,
    bytes,
    filename,
  })

  // Saving the same source twice (double-click, retry) should not create a
  // second row -- the content-addressed key already makes that a no-op in R2,
  // so it must be one in Mongo too.
  const existingDoc = await VaultDocument.findOne({ clerkUid, r2Key }).lean<any>()
  if (existingDoc) {
    return {
      ok: true,
      alreadyInVault: true,
      document: {
        id: String(existingDoc._id),
        filename: existingDoc.filename,
        mimeType: existingDoc.mimeType,
        size: existingDoc.size,
      },
    }
  }

  const count = await VaultDocument.countDocuments({ clerkUid })
  if (count >= MAX_DOCS_PER_VAULT) {
    return { ok: false, error: `Your vault can hold at most ${MAX_DOCS_PER_VAULT} documents` }
  }

  // Everything arriving here is a PDF the app generated (a draft export, a
  // rendered invoice) or a copy of an already-stored upload. Both used to be
  // written to R2 byte-for-byte -- this helper had no compression at all, so a
  // document saved to the vault from elsewhere in the app was stored full-size
  // while the same file uploaded directly to the vault was compressed.
  // compressPdf returns non-PDF input (a DOCX export) unchanged.
  const compressed = alreadyCompressed ? null : await compressPdf(bytes)
  const payload = compressed?.buffer ?? bytes

  if (compressed && !compressed.compressed) {
    console.warn(
      `[vault] stored file uncompressed (${compressed.reason}): ${bytes.byteLength} bytes, user ${clerkUid}`
    )
  }

  // A row for this key returned above, so reaching here with the object already
  // present means it is orphaned (a deleted row, an interrupted save) and may
  // hold bytes from a different compression pass. Overwriting with what this
  // request produced is what makes the sha256 below true.
  await putPrivateObject(r2Key, payload, mimeType)
  const storedBytes = payload.length

  // sha256 has to describe the bytes actually in R2 -- it is what the verify
  // endpoint re-checks, and compression changes them. originalSha256 keeps the
  // hash of the buffer as it was handed to us.
  const doc = await VaultDocument.create({
    clerkUid,
    filename,
    mimeType,
    size: storedBytes,
    r2Key,
    sha256: createHash("sha256").update(payload).digest("hex"),
    originalSha256: createHash("sha256").update(bytes).digest("hex"),
    originalSize: bytes.byteLength,
    verifyStatus: "verified",
    lastVerifiedAt: new Date(),
    compressionStatus: !compressed || compressed.compressed ? "compressed" : "unchanged",
    compressionReason: compressed && !compressed.compressed ? compressed.reason : "",
  })

  return {
    ok: true,
    alreadyInVault: false,
    document: { id: String(doc._id), filename: doc.filename, mimeType: doc.mimeType, size: doc.size },
  }
}

/** Stores a freshly generated buffer (an export, a rendered PDF) as its own vault entry. */
export async function saveBufferToVault(opts: {
  clerkUid: string
  filename: string
  mimeType: string
  bytes: Buffer
}): Promise<VaultSaveResult> {
  return storeBytesInVault(opts)
}

/** Copies an already-stored private object (a contract upload, a corpus document) into the vault. */
export async function copyObjectToVault(opts: {
  clerkUid: string
  sourceR2Key: string
  filename: string
  mimeType: string
  /** Pass the source row's compressionStatus === "compressed". See storeBytesInVault. */
  alreadyCompressed?: boolean
}): Promise<VaultSaveResult> {
  const object = await getPrivateObject(opts.sourceR2Key)
  if (!object.ok || !object.body) {
    return { ok: false, error: "The original file could not be found in storage" }
  }
  return storeBytesInVault({
    clerkUid: opts.clerkUid,
    filename: opts.filename,
    mimeType: opts.mimeType,
    bytes: object.body,
    alreadyCompressed: opts.alreadyCompressed,
  })
}
