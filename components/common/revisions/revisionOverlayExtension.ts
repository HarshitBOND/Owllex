import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

export interface RevisionOverlayState {
  from: number
  to: number
  /** Inline `<del>`/`<ins>` markup for the passage, from buildInlineRedline. */
  html: string
  /** Pulses while true; settles to a steady highlight once the answer is complete. */
  streaming: boolean
}

export const revisionOverlayKey = new PluginKey<RevisionOverlayState | null>("revisionOverlay")

/**
 * Shows a selection-scoped revision in place, without touching the document.
 *
 * The redline for a scoped edit is display-only markup (`<del>`/`<ins>` are not
 * in the document schema -- see lib/diff/htmlRedline.ts), so it can never be
 * written into the editor's actual content: that would be exactly the kind of
 * corruption RedlineView's docstring warns about, with an autosave debounce
 * ready to persist it. This stays a pure view-layer decoration instead -- the
 * real passage is hidden (`display:none`, so it takes no layout space) and the
 * diff is inserted as a widget beside it. `state.doc` never changes, so
 * `getHTML()` and autosave see the document exactly as it is; only what
 * renders on screen is different, and only for the range named here. The rest
 * of the document -- and the reader's scroll position in it -- is untouched.
 */
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    revisionOverlay: {
      showRevisionOverlay: (state: RevisionOverlayState) => ReturnType
      clearRevisionOverlay: () => ReturnType
    }
  }
}

export const RevisionOverlay = Extension.create({
  name: "revisionOverlay",

  addCommands() {
    return {
      showRevisionOverlay:
        (next) =>
        ({ state, dispatch }) => {
          if (next.from >= next.to) return false
          dispatch?.(state.tr.setMeta(revisionOverlayKey, next))
          return true
        },
      clearRevisionOverlay:
        () =>
        ({ state, dispatch }) => {
          dispatch?.(state.tr.setMeta(revisionOverlayKey, null))
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<RevisionOverlayState | null>({
        key: revisionOverlayKey,
        state: {
          init: () => null,
          apply(tr, value) {
            const meta = tr.getMeta(revisionOverlayKey) as RevisionOverlayState | null | undefined
            if (meta !== undefined) return meta
            if (!value) return null
            if (!tr.docChanged) return value

            const from = tr.mapping.map(value.from, 1)
            const to = tr.mapping.map(value.to, -1)
            return from < to ? { ...value, from, to } : null
          },
        },
        props: {
          decorations(state) {
            const overlay = revisionOverlayKey.getState(state)
            if (!overlay) return DecorationSet.empty

            const widget = Decoration.widget(
              overlay.from,
              () => {
                const span = document.createElement("span")
                span.className = `redline-view revision-inline-diff ${overlay.streaming ? "is-streaming" : "is-settled"}`
                span.innerHTML = overlay.html
                return span
              },
              { side: -1, key: `revision-overlay-${overlay.from}-${overlay.to}` }
            )

            return DecorationSet.create(state.doc, [
              widget,
              Decoration.inline(overlay.from, overlay.to, { class: "revision-overlay-hidden" }),
            ])
          },
        },
      }),
    ]
  },
})

export default RevisionOverlay
