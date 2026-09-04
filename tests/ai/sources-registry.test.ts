import { describe, expect, it } from "vitest"
import { createSourceRegistry, formatNumberedPassage, MAX_SOURCES } from "@/lib/ai/sources"

const passage = (title: string, text: string, url: string | null = null) => ({ title, text, url })

describe("createSourceRegistry", () => {
  it("numbers passages from 1 in the order they arrive", () => {
    const registry = createSourceRegistry()
    const added = registry.add([passage("Kumar v Shah", "para one"), passage("Plaint.pdf", "para two")])

    expect(added.map((a) => a.source.n)).toEqual([1, 2])
    expect(registry.list().map((s) => s.title)).toEqual(["Kumar v Shah", "Plaint.pdf"])
  })

  it("keeps a repeated passage on its first number instead of re-citing it", () => {
    const registry = createSourceRegistry()
    registry.add([passage("Kumar v Shah", "para one")])
    registry.add([passage("Other", "para two"), passage("Kumar v Shah", "para one")])

    expect(registry.list()).toHaveLength(2)
    expect(registry.list().map((s) => s.n)).toEqual([1, 2])
  })

  it("numbers two different passages from the same document separately", () => {
    const registry = createSourceRegistry()
    const added = registry.add([passage("Plaint.pdf", "para one"), passage("Plaint.pdf", "para two")])

    expect(added.map((a) => a.source.n)).toEqual([1, 2])
    expect(registry.size).toBe(2)
  })

  it("drops passages with no text rather than numbering an empty source", () => {
    const registry = createSourceRegistry()
    const added = registry.add([passage("Empty", "   "), passage("Real", "text")])

    expect(added).toHaveLength(1)
    expect(added[0].source.n).toBe(1)
  })

  it("stops at the cap", () => {
    const registry = createSourceRegistry()
    registry.add(Array.from({ length: MAX_SOURCES + 5 }, (_, i) => passage("Doc", `para ${i}`)))

    expect(registry.size).toBe(MAX_SOURCES)
  })

  it("returns the full text to the model but only a snippet to the UI", () => {
    const long = "x".repeat(1000)
    const registry = createSourceRegistry()
    const [added] = registry.add([passage("Doc", long)])

    expect(added.text).toHaveLength(1000)
    expect(registry.list()[0].snippet.length).toBeLessThan(400)
    expect(formatNumberedPassage(added)).toBe(`[1] Doc\n${long}`)
  })

  it("falls back to a title rather than leaving a source unlabelled", () => {
    const registry = createSourceRegistry()
    registry.add([passage("", "text")])

    expect(registry.list()[0].title).toBe("Untitled document")
  })
})
