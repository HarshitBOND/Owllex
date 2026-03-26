import { describe, expect, it } from "vitest"
import { hasValidCronSecret } from "@/app/api/lib/services/notificationRunnerAuth"

describe("notification runner auth security", () => {
  it("accepts matching x-cron-secret header", () => {
    const valid = hasValidCronSecret({
      configuredSecret: "my-secret-token",
      secretHeader: "my-secret-token",
    })

    expect(valid).toBe(true)
  })

  it("accepts matching bearer token", () => {
    const valid = hasValidCronSecret({
      configuredSecret: "my-secret-token",
      authorizationHeader: "Bearer my-secret-token",
    })

    expect(valid).toBe(true)
  })

  it("rejects mismatched secrets", () => {
    const valid = hasValidCronSecret({
      configuredSecret: "my-secret-token",
      secretHeader: "wrong-token",
    })

    expect(valid).toBe(false)
  })
})
