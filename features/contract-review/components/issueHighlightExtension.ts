import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import type { Node as PMNode } from "@tiptap/pm/model"
import { severityStyles, type ContractIssue } from "../data"

export const issueHighlightKey = new PluginKey("issueHighlight")

export type IssueHighlightMeta = {
  issues: ContractIssue[]
  selectedId: string | null
  resolvedIds: Set<string>
}

function buildDecorations(doc: PMNode, { issues, selectedId, resolvedIds }: IssueHighlightMeta) {
  let text = ""
  const posMap: number[] = []

  doc.descendants((node, pos) => {
    if (node.isText) {
      const nodeText = node.text ?? ""
      for (let i = 0; i < nodeText.length; i++) posMap.push(pos + i)
      text += nodeText
    }
    return true
  })

  const decorations: Decoration[] = []

  for (const issue of issues) {
    if (resolvedIds.has(issue.id)) continue
    const quote = issue.quote?.trim()
    if (!quote || quote.length < 4) continue

    const idx = text.indexOf(quote)
    if (idx === -1) continue

    const from = posMap[idx]
    const to = posMap[idx + quote.length - 1] + 1
    const style = severityStyles[issue.severity]
    const isSelected = selectedId === issue.id

    decorations.push(
      Decoration.inline(from, to, {
        class: `rounded px-0.5 cursor-pointer transition-shadow ${style.highlightBg} ${
          isSelected ? `ring-2 ${style.ringColor}` : ""
        }`,
        "data-issue-id": issue.id,
      }),
    )
  }

  return DecorationSet.create(doc, decorations)
}

export interface IssueHighlightOptions {
  getMeta: () => IssueHighlightMeta
  onSelect: (issueId: string) => void
}

export const IssueHighlight = Extension.create<IssueHighlightOptions>({
  name: "issueHighlight",

  addOptions() {
    return {
      getMeta: () => ({ issues: [], selectedId: null, resolvedIds: new Set() }),
      onSelect: () => {},
    }
  },

  addProseMirrorPlugins() {
    const { getMeta, onSelect } = this.options

    return [
      new Plugin({
        key: issueHighlightKey,
        state: {
          init: (_, { doc }) => buildDecorations(doc, getMeta()),
          apply: (tr, old, _oldState, newState) => {
            const meta = tr.getMeta(issueHighlightKey) as IssueHighlightMeta | undefined
            if (meta) return buildDecorations(newState.doc, meta)
            if (tr.docChanged) return buildDecorations(newState.doc, getMeta())
            return old
          },
        },
        props: {
          decorations(state) {
            return issueHighlightKey.getState(state)
          },
          handleClick(_view, _pos, event) {
            const target = event.target as HTMLElement | null
            const el = target?.closest("[data-issue-id]") as HTMLElement | null
            if (el?.dataset.issueId) {
              onSelect(el.dataset.issueId)
              return true
            }
            return false
          },
        },
      }),
    ]
  },
})
