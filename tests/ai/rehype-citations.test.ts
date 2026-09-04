import { describe, expect, it } from "vitest"
import rehypeCitations from "@/lib/markdown/rehype-citations"

const text = (value: string) => ({ type: "text", value })
const el = (tagName: string, children: any[]) => ({ type: "element", tagName, children })
const run = (tree: any, maxN: number) => {
  rehypeCitations({ maxN })(tree)
  return tree
}
const flatten = (node: any): string =>
  node.type === "text" ? node.value : (node.children ?? []).map(flatten).join("")

describe("rehypeCitations", () => {
  it("splits a marker out into a cite element", () => {
    const tree = run(el("p", [text("Time-barred [1] on these facts.")]), 3)

    expect(tree.children).toHaveLength(3)
    expect(tree.children[0].value).toBe("Time-barred ")
    expect(tree.children[1]).toMatchObject({ tagName: "cite", properties: { dataCitation: "1" } })
    expect(tree.children[2].value).toBe(" on these facts.")
  })

  it("handles adjacent markers", () => {
    const tree = run(el("p", [text("Settled [1][2].")]), 2)
    const cites = tree.children.filter((c: any) => c.tagName === "cite")

    expect(cites.map((c: any) => c.properties.dataCitation)).toEqual(["1", "2"])
  })

  it("leaves a number higher than the source count alone", () => {
    const tree = run(el("p", [text('The clause reads "[7]" verbatim.')]), 3)

    expect(tree.children.every((c: any) => c.type === "text")).toBe(true)
    expect(flatten(tree)).toBe('The clause reads "[7]" verbatim.')
  })

  it("does not touch code or link labels", () => {
    const tree = run(el("p", [el("code", [text("arr[1]")]), el("a", [text("see [2]")])]), 5)

    expect(flatten(tree)).toBe("arr[1]see [2]")
    expect(tree.children[0].children[0].type).toBe("text")
    expect(tree.children[1].children[0].type).toBe("text")
  })

  it("recurses into nested elements", () => {
    const tree = run(el("ul", [el("li", [el("strong", [text("Held [2]")])])]), 2)
    const strong = tree.children[0].children[0]

    expect(strong.children.some((c: any) => c.tagName === "cite")).toBe(true)
  })

  it("is a no-op when the answer has no sources", () => {
    const tree = run(el("p", [text("Nothing here [1].")]), 0)

    expect(tree.children).toHaveLength(1)
    expect(flatten(tree)).toBe("Nothing here [1].")
  })

  it("preserves the surrounding text exactly", () => {
    const original = "A [1] B [2] C"
    const tree = run(el("p", [text(original)]), 2)

    expect(flatten(tree)).toBe("A 1 B 2 C")
    expect(tree.children.filter((c: any) => c.tagName === "cite")).toHaveLength(2)
  })
})
