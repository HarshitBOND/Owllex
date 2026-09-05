import { describe, expect, it } from "vitest"
import { MAX_REVISIONS, trimRevisionSnapshots } from "@/app/api/lib/models/revision"
import { revertToRevision, spliceSelection, type RevisableDoc } from "@/app/api/lib/services/revise"

type Row = {
  id: string
  instruction: string
  status: "pending" | "done" | "cancelled" | "error"
  errorMessage: string
  scope: { selectedText: string; from: number; to: number }
  contentHtmlBefore: string
  modelKey: string
  createdAt: Date
}

function row(id: string, before: string): Row {
  return {
    id,
    instruction: `instruction ${id}`,
    status: "done",
    errorMessage: "",
    scope: { selectedText: "", from: 0, to: 0 },
    contentHtmlBefore: before,
    modelKey: "balanced",
    createdAt: new Date(),
  }
}

function doc(contentHtml: string, revisions: Row[]): RevisableDoc & { revisions: Row[] } {
  return {
    _id: "000000000000000000000000" as unknown as RevisableDoc["_id"],
    contentHtml,
    revisions,
    version: revisions.length,
    save: async () => undefined,
  }
}

describe("trimRevisionSnapshots", () => {
  it("keeps every restore point while under the cap", () => {
    const rows = Array.from({ length: MAX_REVISIONS }, (_, i) => row(`r${i}`, `<p>${i}</p>`))
    trimRevisionSnapshots(rows)
    expect(rows.every((r) => r.contentHtmlBefore !== "")).toBe(true)
  })

  it("empties only the oldest once past the cap, leaving the rows in place", () => {
    const rows = Array.from({ length: MAX_REVISIONS + 3 }, (_, i) => row(`r${i}`, `<p>${i}</p>`))
    trimRevisionSnapshots(rows)

    expect(rows).toHaveLength(MAX_REVISIONS + 3)
    expect(rows.slice(0, 3).every((r) => r.contentHtmlBefore === "")).toBe(true)
    expect(rows.slice(3).every((r) => r.contentHtmlBefore !== "")).toBe(true)
    // The history itself must survive -- only the restore point goes.
    expect(rows[0].instruction).toBe("instruction r0")
  })
})

describe("revertToRevision", () => {
  it("restores the document and drops that revision and everything after it", () => {
    const d = doc("<p>third</p>", [
      row("a", "<p>original</p>"),
      row("b", "<p>first</p>"),
      row("c", "<p>second</p>"),
    ])

    const outcome = revertToRevision(d, "b")

    expect(outcome.ok).toBe(true)
    expect(d.contentHtml).toBe("<p>first</p>")
    expect(d.revisions.map((r) => r.id)).toEqual(["a"])
    expect(d.version).toBe(4)
  })

  it("refuses a revision whose snapshot was trimmed away", () => {
    const d = doc("<p>now</p>", [row("a", ""), row("b", "<p>first</p>")])

    const outcome = revertToRevision(d, "a")

    expect(outcome.ok).toBe(false)
    expect(d.contentHtml).toBe("<p>now</p>")
    expect(d.revisions).toHaveLength(2)
  })

  it("refuses an id that is not in the timeline", () => {
    const d = doc("<p>now</p>", [row("a", "<p>before</p>")])

    const outcome = revertToRevision(d, "nope")

    expect(outcome.ok).toBe(false)
    expect(d.contentHtml).toBe("<p>now</p>")
    expect(d.revisions).toHaveLength(1)
  })
})

describe("spliceSelection", () => {
  it("replaces only the selected passage", () => {
    const out = spliceSelection("<p>one</p><p>two</p>", "<p>two</p>", "<p>TWO</p>")
    expect(out).toBe("<p>one</p><p>TWO</p>")
  })

  it("returns null when the selection is gone, rather than corrupting the document", () => {
    expect(spliceSelection("<p>one</p>", "<p>missing</p>", "<p>new</p>")).toBeNull()
  })
})
