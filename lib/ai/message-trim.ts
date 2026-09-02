import type { UIMessage } from "ai"

/**
 * Bounds what a conversation costs to store and to replay.
 *
 * Two separate leaks fed each other. Reasoning summaries (enabled by
 * `reasoningSummary: "auto"`) are attached to every assistant turn, and a
 * six-step tool loop adds a part per step -- none of which the model needs to
 * see again, but all of which were persisted and then re-sent as history.
 * And the whole array was written back with `$set` on every turn, so a long
 * conversation rewrote its entire document each time a message was added.
 */

/** Matches the slice sent to the model, so storage never outgrows the context. */
export const MAX_STORED_MESSAGES = 40

// Parts that only mattered while the turn was streaming. Text, files and the
// tool calls the UI renders are kept.
const EPHEMERAL_PART_TYPES = new Set(["reasoning", "step-start", "step-end", "source-url", "source-document"])

export function stripEphemeralParts(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    if (!Array.isArray(message.parts)) return message
    const parts = message.parts.filter(
      (part: { type?: string }) => !EPHEMERAL_PART_TYPES.has(part?.type ?? "")
    )
    // Never leave a message with no parts at all -- that reads as a malformed
    // turn to both the UI and convertToModelMessages.
    return parts.length ? { ...message, parts } : message
  })
}

/** What should actually be persisted: recent turns, minus the streaming scaffolding. */
export function messagesForStorage(messages: UIMessage[]): UIMessage[] {
  return stripEphemeralParts(messages.slice(-MAX_STORED_MESSAGES))
}
