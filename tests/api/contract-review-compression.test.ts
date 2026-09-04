import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Contract-review uploads used to be archived by the Python backend as a side
 * effect of the extraction call, which is the last place a PDF could be stored
 * full-size because a service was unreachable. These pin that the route
 * compresses and stores the file itself, and that extraction is now told
 * nothing about R2.
 */
const mockState = vi.hoisted(() => ({
  requireUserContext: vi.fn(),
  enforceRateLimit: vi.fn(),
  connectMongo: vi.fn(),
  validateUploadBuffer: vi.fn(),
  putPrivateObject: vi.fn(),
  contentAddressedKey: vi.fn(),
  compressPdf: vi.fn(),
  extractDocumentText: vi.fn(),
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
vi.mock("@/app/api/lib/storage/r2", () => ({ putPrivateObject: mockState.putPrivateObject }))
vi.mock("@/app/api/lib/storage/dedupe", () => ({
  contentAddressedKey: mockState.contentAddressedKey,
}))
vi.mock("@/app/api/lib/storage/compressPdf", () => ({ compressPdf: mockState.compressPdf }))
vi.mock("@/app/api/lib/storage/optimizeImage", () => ({
  optimizeImage: vi.fn(),
  withExtension: (name: string, ext: string) => name.replace(/\.[^.]+$/, "") + "." + ext,
}))
vi.mock("@/app/api/lib/contractExtract", () => ({
  extractDocumentText: mockState.extractDocumentText,
}))
vi.mock("@/app/api/lib/html/markdownToHtml", () => ({ markdownToHtml: (s: string) => s }))
vi.mock("@/app/api/lib/html/sanitizeHtml", () => ({ sanitizeDocumentHtml: (s: string) => s }))
vi.mock("@/app/api/lib/models/contract-review", () => ({ default: { create: mockState.create } }))

const ORIGINAL = Buffer.from("%PDF-1.7 a scanned lease agreement")
const COMPRESSED = Buffer.from("%PDF-1.7 smaller")

function uploadRequest() {
  const form = new FormData()
  form.append("file", new File([new Uint8Array(ORIGINAL)], "lease.pdf", { type: "application/pdf" }))
  return new Request("http://localhost/api/contract-review", { method: "POST", body: form }) as any
}

describe("contract review upload compression", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.requireUserContext.mockResolvedValue({ clerkUid: "user_1" })
    mockState.enforceRateLimit.mockResolvedValue({ blockedResponse: null })
    mockState.connectMongo.mockResolvedValue(undefined)
    mockState.validateUploadBuffer.mockReturnValue({
      ok: true,
      sanitizedFileName: "lease.pdf",
      resourceType: "document",
    })
    mockState.putPrivateObject.mockResolvedValue(undefined)
    mockState.contentAddressedKey.mockResolvedValue({
      key: "user_1/contract-review/abc-lease.pdf",
      exists: false,
      sha256: "abc",
    })
    mockState.compressPdf.mockResolvedValue({
      buffer: COMPRESSED,
      originalBytes: ORIGINAL.length,
      storedBytes: COMPRESSED.length,
      compressed: true,
      imagesRecompressed: 2,
      streamsDeflated: 0,
      reason: "",
    })
    mockState.extractDocumentText.mockResolvedValue({ success: true, text: "THIS LEASE..." })
    mockState.create.mockImplementation((doc: any) =>
      Promise.resolve({ ...doc, _id: "review_1", typography: {}, version: 1, save: vi.fn() })
    )
  })

  it("stores the compressed bytes and never hands R2 to the backend", async () => {
    const { POST } = await import("@/app/api/contract-review/route")
    const response = await POST(uploadRequest())

    expect(response.status).toBe(200)
    expect(mockState.putPrivateObject).toHaveBeenCalledWith(
      "user_1/contract-review/abc-lease.pdf",
      COMPRESSED,
      "application/pdf"
    )
    // The backend extracts and nothing else -- passing r2Key is what used to
    // make storage depend on it being reachable.
    expect(mockState.extractDocumentText.mock.calls[0][0].r2Key).toBeUndefined()
  })

  it("extracts from the original bytes, not the lossy compressed copy", async () => {
    const { POST } = await import("@/app/api/contract-review/route")
    await POST(uploadRequest())

    expect(mockState.extractDocumentText.mock.calls[0][0].bytes).toEqual(ORIGINAL)
  })

  it("keeps the file when extraction fails, because it was stored first", async () => {
    mockState.extractDocumentText.mockRejectedValue(new Error("Docling timed out"))

    const { POST } = await import("@/app/api/contract-review/route")
    const response = await POST(uploadRequest())

    expect(response.status).toBe(502)
    // Stored once, up front, with the compressed bytes -- and not re-stored on
    // the failure path.
    expect(mockState.putPrivateObject).toHaveBeenCalledOnce()
    expect(mockState.putPrivateObject.mock.calls[0][1]).toBe(COMPRESSED)
  })
})
