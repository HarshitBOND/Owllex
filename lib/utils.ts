import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parse courtDate strings that may be DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY, or ISO format.
 * Returns a valid Date or null.
 */
export function parseCourtDate(dateStr: string | undefined | null): Date | null {
  if (!dateStr) return null
  const parts = dateStr.split(/[.\/-]/)
  if (parts.length === 3) {
    const [a, b, c] = parts
    // If first part is 4 digits, it's YYYY-MM-DD (ISO-like)
    if (a.length === 4) {
      const d = new Date(`${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}T00:00:00`)
      return isNaN(d.getTime()) ? null : d
    }
    // Otherwise DD.MM.YYYY
    const d = new Date(`${c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}T00:00:00`)
    return isNaN(d.getTime()) ? null : d
  }
  // Fallback: try native parsing
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? null : d
}
