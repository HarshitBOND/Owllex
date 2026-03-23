import { describe, expect, it } from "vitest"
import { hasTeamPermission } from "@/app/api/lib/services/rbac"

describe("RBAC permissions", () => {
  it("grants firm manage only to owner", () => {
    expect(hasTeamPermission("owner", "firm.manage")).toBe(true)
    expect(hasTeamPermission("admin", "firm.manage")).toBe(false)
    expect(hasTeamPermission("member", "firm.manage")).toBe(false)
    expect(hasTeamPermission("viewer", "firm.manage")).toBe(false)
  })

  it("grants read permissions to viewer", () => {
    expect(hasTeamPermission("viewer", "case.read")).toBe(true)
    expect(hasTeamPermission("viewer", "invoice.read")).toBe(true)
    expect(hasTeamPermission("viewer", "case.write")).toBe(false)
  })
})
