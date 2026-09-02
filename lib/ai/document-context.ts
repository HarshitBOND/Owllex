/**
 * Trims a document to a token budget for prompt injection.
 *
 * The old behaviour was `.slice(-60000)`, which kept the tail and threw away
 * the start -- on a contract that means losing the parties, recitals and
 * definitions, which is where most of a clause's meaning is fixed. Keeping a
 * head and a tail with a marked gap loses the middle instead, which is the part
 * a model can most easily do without.
 *
 * 60k chars is roughly 15k tokens, re-sent on every turn because the document
 * changes as it is edited. At the balanced model's input rate that is about
 * Rs 1.57 per turn for context alone, so the budget is deliberately smaller
 * than the editor's 200k limit.
 */
export const MAX_CONTEXT_CHARS = 40000

const GAP = "\n\n[... middle of the document omitted for length ...]\n\n"

export function trimDocumentForPrompt(document: string, budget = MAX_CONTEXT_CHARS): string {
  if (document.length <= budget) return document

  // Two thirds to the head: openings carry the operative definitions, and the
  // tail is mostly execution blocks and schedules.
  const headBudget = Math.floor((budget - GAP.length) * 0.66)
  const tailBudget = budget - GAP.length - headBudget

  return document.slice(0, headBudget) + GAP + document.slice(-tailBudget)
}
