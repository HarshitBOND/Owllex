import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import type { Node as PMNode } from "@tiptap/pm/model"

export const pageAnchorKey = new PluginKey("pageAnchor")

/**
 * Citation chips tying each block back to its page in the uploaded original.
 *
 * The page number rides on the block as a `data-page` attribute (written at
 * upload time by pagedMarkdownToHtml). The chip itself is a widget decoration,
 * never a node: a real node would be selectable, editable, savable and
 * exportable, and the first person to backspace into one would put "3" in the
 * middle of their contract. A decoration is display only and cannot leak into
 * contentHtml.
 */

export interface PageAnchorOptions {
  onOpenPage: (page: number) => void
}

function buildDecorations(doc: PMNode, onOpenPage: (page: number) => void) {
  const decorations: Decoration[] = []
  let lastPage = 0

  doc.descendants((node, pos) => {
    // Only top-level blocks carry the attribute, and only the first block of a
    // page gets a chip -- one per paragraph would be visual noise on a
    // twenty-paragraph page.
    const raw = node.attrs?.dataPage
    if (!raw) return true

    const page = Number(raw)
    if (!Number.isFinite(page) || page === lastPage) return true
    lastPage = page

    decorations.push(
      Decoration.widget(
        pos,
        () => {
          const chip = document.createElement("button")
          chip.type = "button"
          chip.className = "page-anchor-chip"
          chip.textContent = String(page)
          chip.title = `Open page ${page} of the original`
          chip.setAttribute("contenteditable", "false")
          chip.addEventListener("mousedown", (event) => {
            // Without this the click first moves the caret, which fights the
            // editor for focus and makes the chip feel unresponsive.
            event.preventDefault()
            onOpenPage(page)
          })
          return chip
        },
        { side: -1, ignoreSelection: true },
      ),
    )
    return true
  })

  return DecorationSet.create(doc, decorations)
}

/**
 * Teaches the block nodes to round-trip `data-page`.
 *
 * Without this TipTap drops the attribute on parse, so the first autosave
 * writes back a document with no page provenance at all -- the chips would
 * disappear the moment anyone typed.
 */
export const PageAttribute = Extension.create({
  name: "pageAttribute",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading", "listItem", "blockquote", "table"],
        attributes: {
          dataPage: {
            default: null,
            parseHTML: (element: HTMLElement) => element.getAttribute("data-page"),
            renderHTML: (attributes: Record<string, unknown>) =>
              attributes.dataPage ? { "data-page": String(attributes.dataPage) } : {},
          },
        },
      },
    ]
  },
})

export const PageAnchor = Extension.create<PageAnchorOptions>({
  name: "pageAnchor",

  addOptions() {
    return { onOpenPage: () => {} }
  },

  addProseMirrorPlugins() {
    const { onOpenPage } = this.options

    return [
      new Plugin({
        key: pageAnchorKey,
        state: {
          init: (_, { doc }) => buildDecorations(doc, onOpenPage),
          apply: (tr, old) => (tr.docChanged ? buildDecorations(tr.doc, onOpenPage) : old),
        },
        props: {
          decorations(state) {
            return pageAnchorKey.getState(state)
          },
        },
      }),
    ]
  },
})
