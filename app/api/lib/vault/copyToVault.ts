import { createHash } from "crypto"
import { getPrivateObject, headPrivateObject, putPrivateObject } from "@/app/api/lib/storage/r2"
import { contentAddressedKey } from "@/app/api/lib/storage/dedupe"
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
}): Promise<VaultSaveResult> {
  const { clerkUid, filename, mimeType, bytes } = opts

  const { key: r2Key, exists } = await contentAddressedKey({
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

  let storedBytes = bytes.byteLength
  if (exists) {
    const head = await headPrivateObject(r2Key)
    storedBytes = head.contentLength ?? storedBytes
  } else {
    await putPrivateObject(r2Key, bytes, mimeType)
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex")

  const doc = await VaultDocument.create({
    clerkUid,
    filename,
    mimeType,
    size: storedBytes,
    r2Key,
    sha256,
    originalSha256: sha256,
    originalSize: bytes.byteLength,
    verifyStatus: "verified",
    lastVerifiedAt: new Date(),
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
  })
}
