import DOMPurify from "dompurify"
import { ALLOWED_ATTR, ALLOWED_HREF, ALLOWED_TAGS, textAlignOf } from "./allowlist"

// Browser only. DOMPurify without a `window` sets isSupported = false and returns
// its input untouched, so this fails closed rather than passing raw HTML through.
// Server-side callers must use app/api/lib/html/sanitizeHtml.ts instead.
export function sanitizeDraftHtml(html: string) {
  if (!html) return ""
  if (typeof window === "undefined") return ""

  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_ATTR: ["onerror", "onclick", "onload", "onmouseover", "srcset"],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
  })

  const holder = document.createElement("div")
  holder.innerHTML = clean

  holder.querySelectorAll("[style]").forEach((el) => {
    const align = textAlignOf(el.getAttribute("style") || "")
    if (align) el.setAttribute("style", `text-align: ${align}`)
    else el.removeAttribute("style")
  })

  holder.querySelectorAll("a").forEach((el) => {
    const href = (el.getAttribute("href") || "").trim()
    if (!href || !ALLOWED_HREF.test(href)) {
      el.removeAttribute("href")
      el.removeAttribute("target")
      el.removeAttribute("rel")
      return
    }
    el.setAttribute("target", "_blank")
    el.setAttribute("rel", "noopener noreferrer")
  })

  return holder.innerHTML
}
