/**
 * Credits are the unit of AI work in Owllex.
 *
 * They are deliberately *not* money. Internally every model call is budgeted in
 * paise (see `lib/ai/rates.ts`) because that is how we buy capacity, but a user
 * should never be shown what a question of theirs "cost" — that framing makes
 * people ration themselves and reads as a bill rather than an allowance.
 *
 * One credit is a fixed slice of that internal budget. The ratio below is an
 * implementation detail, not a price: it exists only so plan caps land on whole,
 * human-sized numbers, and it is intentionally not 1 credit = ₹1. Nothing
 * outside this module should divide or multiply by it, and nothing in the UI
 * should surface a currency figure for AI usage.
 */
export const PAISE_PER_CREDIT = 5

/** Credits a user has spent, from internal paise. Rounds up so usage is never understated. */
export function creditsUsed(paise: number): number {
  return Math.ceil(Math.max(paise, 0) / PAISE_PER_CREDIT)
}

/** Credits a cap is worth, from internal paise. Rounds down so an allowance is never overstated. */
export function creditsAllowed(paise: number): number {
  return Math.floor(Math.max(paise, 0) / PAISE_PER_CREDIT)
}

/** Percent of an allowance consumed, clamped to 0-100. */
export function percentUsed(usedPaise: number, capPaise: number): number {
  if (capPaise <= 0) return 100
  return Math.min(Math.round((usedPaise / capPaise) * 100), 100)
}

/** "1,200" / "1,50,000" — grouped for readability, never prefixed with a currency symbol. */
export function formatCredits(credits: number): string {
  return new Intl.NumberFormat("en-IN").format(Math.max(Math.round(credits), 0))
}
