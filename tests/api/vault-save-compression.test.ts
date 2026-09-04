import { beforeEach, describe, expect, it, vi } from "vitest"
import { createHash } from "crypto"

/**
 * copyToVault is the shared helper behind every "save to vault" button in the
 * app -- draft exports, invoices, contract-review exports, corpus documents.
 * It had no compression at all, so a PDF that arrived through one of those
 * buttons was stored full-size while the identical file uploaded directly to
 * the vault was compressed. These pin that it now goes through compressPdf,
 * and that the stored hash describes the bytes that actually reached R2.
 */
const mockState = vi.hoisted(() => ({
  putPrivateObject: vi.fn(),
  getPrivateObject: vi.fn(),
  contentAddressedKey: vi.fn(),
  compressPdf: vi.fn(),
  countDocuments: vi.fn(),
  findOne: vi.fn(),
  create: vi.fn(),
}))

vi.mock("@/app/api/lib/storage/r2", () => ({
  putPrivateObject: mockState.putPrivateObject,
  getPrivateObject: mockState.getPrivateObject,
}))
vi.mock("@/app/api/lib/storage/dedupe", () => ({
  contentAddressedKey: mockState.contentAddressedKey,
}))
vi.mock("@/app/api/lib/storage/compressPdf", () => ({ compressPdf: mockState.compressPdf }))
vi.mock("@/app/api/lib/models/vault-document", () => ({
  default: {
    countDocuments: mockState.countDocuments,
    findOne: mockState.findOne,
    create: mockState.create,
  },
}))

const ORIGINAL = Buffer.from("%PDF-1.7 a generated invoice with raw content streams")
const COMPRESSED = Buffer.from("%PDF-1.7 deflated")

describe("save-to-vault compression", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.countDocuments.mockResolvedValue(0)
    mockState.putPrivateObject.mockResolvedValue(undefined)
    // No row for this key yet, so the save proceeds rather than deduping.
    mockState.findOne.mockReturnValue({ lean: () => Promise.resolve(null) })
    mockState.contentAddressedKey.mockResolvedValue({
      key: "user_1/vault/abc-invoice.pdf",
      exists: false,
      sha256: "abc",
    })
    mockState.create.mockImplementation((doc: any) =>
      Promise.resolve({ ...doc, _id: "doc_1" })
    )
  })

  it("compresses a generated PDF before it reaches R2", async () => {
    mockState.compressPdf.mockResolvedValue({
      buffer: COMPRESSED,
      originalBytes: ORIGINAL.length,
      storedBytes: COMPRESSED.length,
      compressed: true,
      imagesRecompressed: 0,
      streamsDeflated: 4,
      reason: "",
    })

    const { saveBufferToVault } = await import("@/app/api/lib/vault/copyToVault")
    const result = await saveBufferToVault({
      clerkUid: "user_1",
      filename: "invoice.pdf",
      mimeType: "application/pdf",
      bytes: ORIGINAL,
    })

    expect(mockState.compressPdf).toHaveBeenCalledOnce()
    // The compressed bytes are what land in R2, not the buffer handed in.
    expect(mockState.putPrivateObject).toHaveBeenCalledWith(
      "user_1/vault/abc-invoice.pdf",
      COMPRESSED,
      "application/pdf"
    )
    expect(result.ok && result.document.size).toBe(COMPRESSED.length)
  })

  it("records the hash of the stored bytes, not of the buffer it was given", async () => {
    // The vault verify endpoint re-hashes what is in R2 and compares it to this
    // column. Recording the pre-compression hash would mark every saved
    // document "corrupted" the first time it was checked.
    mockState.compressPdf.mockResolvedValue({
      buffer: COMPRESSED,
      originalBytes: ORIGINAL.length,
      storedBytes: COMPRESSED.length,
      compressed: true,
      imagesRecompressed: 0,
      streamsDeflated: 4,
      reason: "",
    })

    const { saveBufferToVault } = await import("@/app/api/lib/vault/copyToVault")
    await saveBufferToVault({
      clerkUid: "user_1",
      filename: "invoice.pdf",
      mimeType: "application/pdf",
      bytes: ORIGINAL,
    })

    const row = mockState.create.mock.calls[0][0]
    expect(row.sha256).toBe(createHash("sha256").update(COMPRESSED).digest("hex"))
    expect(row.originalSha256).toBe(createHash("sha256").update(ORIGINAL).digest("hex"))
    expect(row.originalSize).toBe(ORIGINAL.length)
    expect(row.compressionStatus).toBe("compressed")
  })

  it("stores the original and says why when compression declines", async () => {
    // A DOCX export goes through the same helper and must come out byte-identical.
    const docx = Buffer.from("PK\x03\x04 a docx export")
    mockState.compressPdf.mockResolvedValue({
      buffer: docx,
      originalBytes: docx.length,
      storedBytes: docx.length,
      compressed: false,
      imagesRecompressed: 0,
      streamsDeflated: 0,
      reason: "not-a-pdf",
    })

    const { saveBufferToVault } = await import("@/app/api/lib/vault/copyToVault")
    await saveBufferToVault({
      clerkUid: "user_1",
      filename: "draft.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes: docx,
    })

    expect(mockState.putPrivateObject.mock.calls[0][1]).toBe(docx)
    const row = mockState.create.mock.calls[0][0]
    expect(row.compressionStatus).toBe("unchanged")
    expect(row.compressionReason).toBe("not-a-pdf")
  })

  it("compresses a document copied in from another feature", async () => {
    mockState.getPrivateObject.mockResolvedValue({ ok: true, body: ORIGINAL })
    mockState.compressPdf.mockResolvedValue({
      buffer: COMPRESSED,
      originalBytes: ORIGINAL.length,
      storedBytes: COMPRESSED.length,
      compressed: true,
      imagesRecompressed: 1,
      streamsDeflated: 0,
      reason: "",
    })

    const { copyObjectToVault } = await import("@/app/api/lib/vault/copyToVault")
    await copyObjectToVault({
      clerkUid: "user_1",
      sourceR2Key: "user_1/corpus/x/source.pdf",
      filename: "source.pdf",
      mimeType: "application/pdf",
    })

    expect(mockState.compressPdf).toHaveBeenCalledOnce()
    expect(mockState.putPrivateObject.mock.calls[0][1]).toBe(COMPRESSED)
  })

  it("does not run the lossy pass twice on a source that is already compressed", async () => {
    // The corpus upload compressed this object already. A second image pass
    // would re-encode every scan at JPEG q72 from a q72 source to win a percent
    // or two -- generational loss on exactly the seals and fine print that
    // matter on a legal document.
    mockState.getPrivateObject.mockResolvedValue({ ok: true, body: COMPRESSED })

    const { copyObjectToVault } = await import("@/app/api/lib/vault/copyToVault")
    await copyObjectToVault({
      clerkUid: "user_1",
      sourceR2Key: "user_1/corpus/x/scan.pdf",
      filename: "scan.pdf",
      mimeType: "application/pdf",
      alreadyCompressed: true,
    })

    expect(mockState.compressPdf).not.toHaveBeenCalled()
    expect(mockState.putPrivateObject.mock.calls[0][1]).toBe(COMPRESSED)
    // Still recorded as compressed, because the stored bytes genuinely are.
    expect(mockState.create.mock.calls[0][0].compressionStatus).toBe("compressed")
  })

  it("does not write or re-compress when the document is already in the vault", async () => {
    mockState.findOne.mockReturnValue({
      lean: () =>
        Promise.resolve({ _id: "existing", filename: "invoice.pdf", mimeType: "application/pdf", size: 10 }),
    })

    const { saveBufferToVault } = await import("@/app/api/lib/vault/copyToVault")
    const result = await saveBufferToVault({
      clerkUid: "user_1",
      filename: "invoice.pdf",
      mimeType: "application/pdf",
      bytes: ORIGINAL,
    })

    expect(result.ok && result.alreadyInVault).toBe(true)
    expect(mockState.compressPdf).not.toHaveBeenCalled()
    expect(mockState.putPrivateObject).not.toHaveBeenCalled()
  })
})
