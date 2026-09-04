import { describe, expect, it } from "vitest"
import type { UIMessage } from "ai"
import { settleDanglingToolCalls, messagesForStorage } from "@/lib/ai/message-trim"

function assistant(parts: Record<string, unknown>[]): UIMessage {
  return { id: "a1", role: "assistant", parts } as unknown as UIMessage
}

describe("settleDanglingToolCalls", () => {
  it("settles a clarifying question the advocate answered in prose", () => {
    const out = settleDanglingToolCalls([
      assistant([
        { type: "text", text: "I need a few details." },
        {
          type: "tool-askClarification",
          toolCallId: "call_1",
          state: "input-available",
          input: { questions: ["What is the name of the Court?"] },
        },
      ]),
    ])

    const part = (out[0].parts as Record<string, unknown>[])[1]
    expect(part.state).toBe("output-available")
    expect(part.output).toMatchObject({ accepted: false })
  })

  it("leaves a call the advocate already acted on untouched", () => {
    const settled = {
      type: "tool-proposeDocument",
      toolCallId: "call_2",
      state: "output-available",
      output: { accepted: true },
    }
    const out = settleDanglingToolCalls([assistant([settled])])
    expect((out[0].parts as Record<string, unknown>[])[0]).toEqual(settled)
  })

  it("leaves a call that errored alone", () => {
    const errored = { type: "tool-setFields", toolCallId: "call_3", state: "output-error", errorText: "boom" }
    const out = settleDanglingToolCalls([assistant([errored])])
    expect((out[0].parts as Record<string, unknown>[])[0]).toEqual(errored)
  })

  it("settles a call still mid-stream, so a cut-off turn cannot poison the history", () => {
    const out = settleDanglingToolCalls([
      assistant([{ type: "tool-proposeDocument", toolCallId: "call_4", state: "input-streaming" }]),
    ])
    expect((out[0].parts as Record<string, unknown>[])[0].state).toBe("output-available")
  })

  it("never touches text parts or user turns", () => {
    const user = { id: "u1", role: "user", parts: [{ type: "text", text: "Delhi High Court" }] } as unknown as UIMessage
    const out = settleDanglingToolCalls([user, assistant([{ type: "text", text: "Right." }])])
    expect(out[0]).toEqual(user)
    expect((out[1].parts as Record<string, unknown>[])[0]).toEqual({ type: "text", text: "Right." })
  })

  it("settles every dangling call in one turn, not just the first", () => {
    const out = settleDanglingToolCalls([
      assistant([
        { type: "tool-setFields", toolCallId: "a", state: "input-available" },
        { type: "tool-askClarification", toolCallId: "b", state: "input-available" },
      ]),
    ])
    const parts = out[0].parts as Record<string, unknown>[]
    expect(parts.every((p) => p.state === "output-available")).toBe(true)
  })
})

describe("messagesForStorage", () => {
  it("settles dangling calls before they are persisted", () => {
    const stored = messagesForStorage([
      assistant([
        { type: "reasoning", text: "thinking" },
        { type: "tool-askClarification", toolCallId: "call_5", state: "input-available" },
      ]),
    ])
    const parts = stored[0].parts as Record<string, unknown>[]
    // Reasoning is dropped as streaming scaffolding; the tool call is settled.
    expect(parts).toHaveLength(1)
    expect(parts[0].state).toBe("output-available")
  })
})
