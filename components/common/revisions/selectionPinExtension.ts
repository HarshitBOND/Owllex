import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

export interface PinnedRange {
  from: number
  to: number
  /** Pulses the highlight while true -- the model is writing a revision for it. */
  revising?: boolean
}

export const selectionPinKey = new PluginKey<PinnedRange | null>("selectionPin")

/**
 * Keeps the passage a revision is scoped to visibly lit.
 *
 * A browser drops the painted selection as soon as focus leaves the editor,
 * and typing the instruction does exactly that -- so without this the advocate
 * is asked to describe a change to text that no longer looks selected. The
 * range is held as a decoration rather than a mark: a mark would be part of the
 * document, and would be saved and exported with it.
 *
 * The range is mapped through every transaction, so it follows the text it
 * points at while the model streams a revision in around it.
 */
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    selectionPin: {
      pinSelection: (range?: PinnedRange) => ReturnType
      clearPinnedSelection: () => ReturnType
      setPinRevising: (revising: boolean) => ReturnType
    }
  }
}

export const SelectionPin = Extension.create({
  name: "selectionPin",

  addCommands() {
    return {
      pinSelection:
        (range) =>
        ({ state, dispatch }) => {
          const next = range ?? { from: state.selection.from, to: state.selection.to }
          if (next.from >= next.to) return false
          dispatch?.(state.tr.setMeta(selectionPinKey, next))
          return true
        },
      clearPinnedSelection:
        () =>
        ({ state, dispatch }) => {
          dispatch?.(state.tr.setMeta(selectionPinKey, null))
          return true
        },
      setPinRevising:
        (revising) =>
        ({ state, dispatch }) => {
          const current = selectionPinKey.getState(state)
          if (!current) return false
          dispatch?.(state.tr.setMeta(selectionPinKey, { ...current, revising }))
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<PinnedRange | null>({
        key: selectionPinKey,
        state: {
          init: () => null,
          apply(tr, value) {
            // `undefined` means this transaction said nothing about the pin;
            // `null` is an explicit clear, so the two cannot be collapsed.
            const meta = tr.getMeta(selectionPinKey) as PinnedRange | null | undefined
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
            const pinned = selectionPinKey.getState(state)
            if (!pinned) return DecorationSet.empty
            const cls = pinned.revising ? "selection-pin selection-pin--revising" : "selection-pin"
            return DecorationSet.create(state.doc, [Decoration.inline(pinned.from, pinned.to, { class: cls })])
          },
        },
      }),
    ]
  },
})

export default SelectionPin
