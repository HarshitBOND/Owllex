/**
 * The typeface a draft is rendered and exported in.
 *
 * Matches the font the rest of the app's AI chat reads in, so a document
 * looks the same whether it's open in the editor or previewed inline in a
 * conversation. "Georgia" was the schema default before drafts were set in
 * Poppins, and it is no longer offered in the editor's typeface menu -- so a
 * stored "Georgia" means the advocate never chose one, and resolves to the
 * current default. Poppins is still an explicit, offered choice, so it is
 * honoured as written like anything else the advocate picked.
 */
export const DEFAULT_DRAFT_FONT = "Inter"
const LEGACY_DEFAULT = "Georgia"

export function resolveDraftFont(stored?: string | null) {
  if (!stored || stored === LEGACY_DEFAULT) return DEFAULT_DRAFT_FONT
  return stored
}
