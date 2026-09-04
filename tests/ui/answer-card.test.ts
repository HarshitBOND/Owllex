import React from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import type { UIMessage } from "ai"

;(globalThis as any).React = React

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))
vi.mock("@/components/ui/chat-reasoning", () => ({ default: () => "reasoning-mock" }))

import { AnswerCard } from "@/features/dashboard/answer/AnswerCard"

const sources = [
  { n: 1, title: "Kumar v Shah", url: "/api/documents/view?token=abc", snippet: "Article 55 runs three years." },
  { n: 2, title: "Kumar v Shah", url: "/api/documents/view?token=abc", snippet: "Acknowledgment in writing." },
  { n: 3, title: "Plaint.pdf", url: null, snippet: "The cause of action arose on 12-03-2021." },
]

const message = (parts: any[]): UIMessage => ({ id: "a1", role: "assistant", parts } as UIMessage)

const render = (parts: any[], overrides: Record<string, unknown> = {}) =>
  renderToString(
    React.createElement(AnswerCard, {
      message: message(parts),
      chatId: "chat-1",
      streaming: false,
      thinkingParts: [],
      thinkingOpen: false,
      renderThinkingPart: () => null,
      reduceMotion: true,
      reserveRail: true,
      onPickFollowUp: () => {},
      ...overrides,
    } as any)
  )

const answered = [
  { type: "text", text: "The suit is time-barred [1]. Section 18 may still save it [2][3]." },
  { type: "data-sources", id: "sources", data: { sources } },
  {
    type: "data-answer-meta",
    id: "meta",
    data: {
      title: "Limitation on the Written Contract Claim",
      followUps: ["Does the email of 04-08-2023 amount to an acknowledgment?"],
    },
  },
]

describe("AnswerCard", () => {
  it("heads the answer with the model's title and a meta line", () => {
    const markup = render(answered)

    expect(markup).toContain("Limitation on the Written Contract Claim")
    expect(markup).toContain("3 sources")
  })

  it("renders the [n] markers as citation chips rather than literal brackets", () => {
    const markup = render(answered)

    expect(markup).toContain("Source 1: Kumar v Shah")
    expect(markup).toContain("Source 3: Plaint.pdf")
    expect(markup).not.toContain("[1]")
    expect(markup).not.toContain("[2][3]")
  })

  it("groups the rail by document, so one judgment cited twice is one row", () => {
    const markup = render(answered)
    const rows = markup.match(/Kumar v Shah/g) ?? []

    // Two chips reference it, but it appears as a single titled row in the rail
    // and in the mobile disclosure.
    expect(markup).toContain("Plaint.pdf")
    expect(rows.length).toBeGreaterThan(0)
    expect(markup).toContain("/api/documents/view?token=abc")
  })

  it("offers the follow-ups the model suggested", () => {
    const markup = render(answered)

    expect(markup).toContain("Follow-ups")
    expect(markup).toContain("Does the email of 04-08-2023 amount to an acknowledgment?")
  })

  it("shows the action bar once the answer has finished", () => {
    const markup = render(answered)

    expect(markup).toContain("Good response")
    expect(markup).toContain("Bad response")
    expect(markup).toContain("Copy response")
    expect(markup).toContain("Download response")
  })

  it("hides actions and follow-ups while still streaming", () => {
    const markup = render(answered, { streaming: true })

    expect(markup).not.toContain("Good response")
    expect(markup).not.toContain("Follow-ups")
    // The prose itself is still rendered as it arrives.
    expect(markup).toContain("The suit is time-barred")
  })

  it("renders an answer that retrieved nothing, with no empty sources furniture", () => {
    const markup = render([{ type: "text", text: "A suit on a written contract falls under Article 55." }])

    expect(markup).toContain("Article 55")
    expect(markup).not.toContain("Sources")
    expect(markup).not.toContain("0 sources")
  })

  it("falls back to the answer's own heading when the model gave no title", () => {
    const markup = render([{ type: "text", text: "## Bail Under BNSS 483\n\nThe accused has been in custody." }])

    expect(markup).toContain("Bail Under BNSS 483")
  })

  it("leaves a bracketed number that is not a citation as written", () => {
    const markup = render([
      { type: "text", text: 'The clause reads "[9]" verbatim.' },
      { type: "data-sources", id: "sources", data: { sources: [sources[0]] } },
    ])

    expect(markup).toContain("[9]")
  })
})
