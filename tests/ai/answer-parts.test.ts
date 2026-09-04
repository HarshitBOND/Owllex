import { describe, expect, it } from "vitest"
import type { UIMessage } from "ai"
import { messagesForStorage, stripEphemeralParts } from "@/lib/ai/message-trim"
import { metaOf, sourcesOf, textOf, titleOf } from "@/features/dashboard/answer/answer-meta"

const sources = [
  { n: 1, title: "Kumar v Shah", url: "/api/documents/view?token=abc", snippet: "para one" },
  { n: 2, title: "Plaint.pdf", url: null, snippet: "para two" },
]

const answer = (parts: any[]): UIMessage => ({ id: "a1", role: "assistant", parts } as UIMessage)

const full = () =>
  answer([
    { type: "reasoning", text: "thinking out loud" },
    { type: "step-start" },
    { type: "text", text: "The suit is time-barred [1]." },
    { type: "data-sources", id: "sources", data: { sources } },
    { type: "data-answer-meta", id: "meta", data: { title: "Limitation", followUps: ["What about section 18?"] } },
  ])

describe("answer data parts", () => {
  it("survive the trim that strips streaming scaffolding", () => {
    const [stored] = messagesForStorage([full()])
    const types = stored.parts.map((p) => p.type)

    expect(types).toContain("data-sources")
    expect(types).toContain("data-answer-meta")
    expect(types).not.toContain("reasoning")
    expect(types).not.toContain("step-start")
  })

  it("read back off a stored message", () => {
    const [stored] = messagesForStorage([full()])

    expect(sourcesOf(stored)).toHaveLength(2)
    expect(sourcesOf(stored)[0].title).toBe("Kumar v Shah")
    expect(metaOf(stored).followUps).toEqual(["What about section 18?"])
    expect(titleOf(stored)).toBe("Limitation")
    expect(textOf(stored)).toBe("The suit is time-barred [1].")
  })

  it("still carry sources after being replayed as history", () => {
    const replayed = stripEphemeralParts(messagesForStorage([full()]))

    expect(sourcesOf(replayed[0])).toHaveLength(2)
  })

  it("report no sources for an answer that retrieved nothing", () => {
    const bare = answer([{ type: "text", text: "Two sentences and nothing else." }])

    expect(sourcesOf(bare)).toEqual([])
    expect(metaOf(bare).followUps).toBeUndefined()
  })
})

describe("titleOf", () => {
  it("prefers the model's title", () => {
    expect(titleOf(full())).toBe("Limitation")
  })

  it("falls back to the answer's first heading", () => {
    const m = answer([{ type: "text", text: "## Limitation on the Contract Claim\n\nBody text." }])
    expect(titleOf(m)).toBe("Limitation on the Contract Claim")
  })

  it("falls back to the opening line, stripped of markdown", () => {
    const m = answer([{ type: "text", text: "**The suit is time-barred.**\n\nMore." }])
    expect(titleOf(m)).toBe("The suit is time-barred.")
  })

  it("truncates a long opening line rather than running the header over", () => {
    const m = answer([{ type: "text", text: "x".repeat(200) }])
    expect(titleOf(m).length).toBeLessThanOrEqual(71)
  })

  it("never returns an empty header", () => {
    expect(titleOf(answer([{ type: "text", text: "" }]))).toBe("Answer")
  })
})
