import { beforeEach, describe, expect, it, vi } from "vitest"
import { createHash } from "crypto"

const mockState = vi.hoisted(() => ({
  requireUserContext: vi.fn(),
  enforceRateLimit: vi.fn(),
  connectMongo: vi.fn(),
  validateUploadBuffer: vi.fn(),
  putPrivateObject: vi.fn(),
  contentAddressedKey: vi.fn(),
  compressPdf: vi.fn(),
  countDocuments: vi.fn(),
  findOne: vi.fn(),
  create: vi.fn(),
}))

vi.mock("@/app/api/lib/routeGuards", () => ({
  requireUserContext: mockState.requireUserContext,
  enforceRateLimit: mockState.enforceRateLimit,
}))
vi.mock("@/app/api/lib/db/connectMongo", () => ({ default: mockState.connectMongo }))
vi.mock("@/app/api/lib/uploadValidation", () => ({
  validateUploadBuffer: mockState.validateUploadBuffer,
}))
vi.mock("@/app/api/lib/securityLogger", () => ({ logSecurityEvent: vi.fn() }))
vi.mock("@/app/api/lib/storage/r2", () => ({
  putPrivateObject: mockState.putPrivateObject,
  headPrivateObject: vi.fn(),
}))
vi.mock("@/app/api/lib/storage/dedupe", () => ({
  contentAddressedKey: mockState.contentAddressedKey,
}))
vi.mock("@/app/api/lib/storage/compressPdf", () => ({ compressPdf: mockState.compressPdf }))
vi.mock("@/app/api/lib/storage/optimizeImage", () => ({
  optimizeImage: vi.fn(),
  withExtension: (name: string, ext: string) => name.replace(/\.[^.]+$/, "") + "." + ext,
}))
vi.mock("@/app/api/lib/models/vault-document", () => ({
  default: {
    countDocuments: mockState.countDocuments,
    findOne: mockState.findOne,
    create: mockState.create,
  },
}))

const ORIGINAL = Buffer.from("%PDF-1.7 a big scanned judgment")
const COMPRESSED = Buffer.from("%PDF-1.7 smaller")
const COMPRESSED_SHA = createHash("sha256").update(COMPRESSED).digest("hex")

function uploadRequest() {
  const form = new FormData()
  form.append("file", new File([new Uint8Array(ORIGINAL)], "judgment.pdf", {
    type: "application/pdf",
  }))
  return new Request("http://localhost/api/vault/documents", { method: "POST", body: form }) as any
}

describe("vault upload compression", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.requireUserContext.mockResolvedValue({ clerkUid: "user_1" })
    mockState.enforceRateLimit.mockResolvedValue({ blockedResponse: null })
    mockState.connectMongo.mockResolvedValue(undefined)
    mockState.countDocuments.mockResolvedValue(0)
    mockState.validateUploadBuffer.mockReturnValue({
      ok: true,
      sanitizedFileName: "judgment.pdf",
      resourceType: "document",
    })
    mockState.putPrivateObject.mockResolvedValue(undefined)
    mockState.compressPdf.mockResolvedValue({
      buffer: COMPRESSED,
      originalBytes: ORIGINAL.length,
      storedBytes: COMPRESSED.length,
      compressed: true,
      imagesRecompressed: 2,
      streamsDeflated: 4,
      reason: "",
    })
    mockState.create.mockImplementation(async (doc: any) => ({
      ...doc,
      _id: "doc_1",
      createdAt: new Date(),
    }))
  })

  it("stores the compressed bytes and records their hash, not the upload's", async () => {
    mockState.contentAddressedKey.mockResolvedValue({
      key: "user_1/vault/abc-judgment.pdf",
      exists: false,
      sha256: "unused",
    })

    const { POST } = await import("@/app/api/vault/documents/route")
    const response = await POST(uploadRequest())
    expect(response.status).toBe(200)

    // What actually reached R2 must be the compressed buffer.
    expect(mockState.putPrivateObject).toHaveBeenCalledWith(
      "user_1/vault/abc-judgment.pdf",
      COMPRESSED,
      "application/pdf"
    )

    const row = mockState.create.mock.calls[0][0]
    expect(row.size).toBe(COMPRESSED.length)
    expect(row.originalSize).toBe(ORIGINAL.length)
    expect(row.sha256).toBe(COMPRESSED_SHA)
    expect(row.compressionStatus).toBe("compressed")
  })

  it("reuses the stored hash on a dedupe hit rather than the upload's", async () => {
    // Re-uploading a PDF hits the content-addressed key of the *original*
    // bytes, but R2 holds the compressed object. Recording the original hash
    // here is what made a deep verify report the document as corrupted.
    mockState.contentAddressedKey.mockResolvedValue({
      key: "user_1/vault/abc-judgment.pdf",
      exists: true,
      sha256: "unused",
    })
    mockState.findOne.mockReturnValue({
      select: () => ({
        lean: async () => ({
          sha256: "hash-from-the-earlier-upload",
          size: 4242,
          mimeType: "application/pdf",
        }),
      }),
    })

    const { POST } = await import("@/app/api/vault/documents/route")
    await POST(uploadRequest())

    expect(mockState.putPrivateObject).not.toHaveBeenCalled()

    const row = mockState.create.mock.calls[0][0]
    expect(row.sha256).toBe("hash-from-the-earlier-upload")
    expect(row.size).toBe(4242)
    expect(row.originalSha256).toBe(createHash("sha256").update(ORIGINAL).digest("hex"))
  })

  it("stores the original and says why when compression declines", async () => {
    mockState.contentAddressedKey.mockResolvedValue({
      key: "user_1/vault/abc-judgment.pdf",
      exists: false,
      sha256: "unused",
    })
    mockState.compressPdf.mockResolvedValue({
      buffer: ORIGINAL,
      originalBytes: ORIGINAL.length,
      storedBytes: ORIGINAL.length,
      compressed: false,
      imagesRecompressed: 0,
      streamsDeflated: 0,
      reason: "unparseable-or-encrypted",
    })

    const { POST } = await import("@/app/api/vault/documents/route")
    const response = await POST(uploadRequest())
    expect(response.status).toBe(200)

    const row = mockState.create.mock.calls[0][0]
    expect(row.compressionStatus).toBe("unchanged")
    expect(row.compressionReason).toBe("unparseable-or-encrypted")
    expect(row.size).toBe(ORIGINAL.length)
  })
})
