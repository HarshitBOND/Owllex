import { describe, expect, it } from "vitest"
import { validateUploadBuffer } from "@/app/api/lib/uploadValidation"

describe("upload validation security", () => {
  it("accepts valid PNG signature", () => {
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])
    const result = validateUploadBuffer("evidence.png", pngHeader)

    expect(result.ok).toBe(true)
    expect(result.resourceType).toBe("image")
  })

  it("rejects spoofed extension with invalid signature", () => {
    const fakeBytes = new Uint8Array([0x41, 0x42, 0x43, 0x44])
    const result = validateUploadBuffer("payload.png", fakeBytes)

    expect(result.ok).toBe(false)
    expect(result.error).toBe("Invalid file signature")
  })

  it("rejects unsupported extensions", () => {
    const randomBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46])
    const result = validateUploadBuffer("script.exe", randomBytes)

    expect(result.ok).toBe(false)
    expect(result.error).toBe("Unsupported file extension")
  })
})
