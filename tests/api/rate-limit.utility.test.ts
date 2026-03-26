import { describe, expect, it } from "vitest"
import type { NextRequest } from "next/server"
import { applyRateLimit } from "@/app/api/lib/rateLimit"

const makeRequest = (ip: string, userAgent = "vitest") => {
  return {
    headers: new Headers({
      "x-forwarded-for": ip,
      "user-agent": userAgent,
    }),
  } as unknown as NextRequest
}

describe("rate limit utility", () => {
  it("allows requests within limit and blocks overflow", async () => {
    const request = makeRequest("1.1.1.1")

    const first = await applyRateLimit({
      request,
      key: "test:rate:basic",
      max: 2,
      windowMs: 30_000,
    })
    const second = await applyRateLimit({
      request,
      key: "test:rate:basic",
      max: 2,
      windowMs: 30_000,
    })
    const third = await applyRateLimit({
      request,
      key: "test:rate:basic",
      max: 2,
      windowMs: 30_000,
    })

    expect(first.allowed).toBe(true)
    expect(second.allowed).toBe(true)
    expect(third.allowed).toBe(false)
    expect(third.retryAfterSeconds).toBeGreaterThan(0)
  })

  it("isolates rate buckets by key", async () => {
    const request = makeRequest("2.2.2.2")

    const bucketOne = await applyRateLimit({
      request,
      key: "test:rate:bucket-one",
      max: 1,
      windowMs: 30_000,
    })

    const bucketTwo = await applyRateLimit({
      request,
      key: "test:rate:bucket-two",
      max: 1,
      windowMs: 30_000,
    })

    expect(bucketOne.allowed).toBe(true)
    expect(bucketTwo.allowed).toBe(true)
  })
})
