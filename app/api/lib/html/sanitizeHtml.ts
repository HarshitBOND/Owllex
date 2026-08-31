import * as cheerio from "cheerio"
import { ALLOWED_ATTR, ALLOWED_HREF, ALLOWED_TAGS, textAlignOf } from "@/lib/html/allowlist"

const DROP_WITH_CONTENT = "script, style, iframe, object, embed, noscript, template, svg, math, form, input, button"

// Server-side sanitizer. Never use dompurify here: with no `window` it silently
// returns its input unchanged, which would ship unsanitized HTML looking correct.
export function sanitizeDocumentHtml(html: string) {
  if (!html) return ""

  const $ = cheerio.load(html, null, false)
  $(DROP_WITH_CONTENT).remove()

  // Unwrapping a disallowed tag can expose another one beneath it, so repeat
  // until the tree is clean. Text is always kept — nothing is silently dropped.
  for (let pass = 0; pass < 10; pass++) {
    const bad = $("*").filter((_, el) => "tagName" in el && !ALLOWED_TAGS.includes(el.tagName.toLowerCase()))
    if (bad.length === 0) break
    bad.each((_, el) => {
      $(el).replaceWith($(el).contents())
    })
  }

  $("*").each((_, el) => {
    if (!("tagName" in el)) return
    const $el = $(el)

    for (const [name, value] of Object.entries({ ...el.attribs })) {
      const lower = name.toLowerCase()
      if (!ALLOWED_ATTR.includes(lower)) {
        $el.removeAttr(name)
        continue
      }
      if (lower === "style") {
        const align = textAlignOf(value)
        if (align) $el.attr("style", `text-align: ${align}`)
        else $el.removeAttr("style")
      }
      if (lower === "href" && !ALLOWED_HREF.test((value || "").trim())) {
        $el.removeAttr("href")
      }
    }

    if (el.tagName.toLowerCase() === "a") {
      if ($el.attr("href")) {
        $el.attr("target", "_blank")
        $el.attr("rel", "noopener noreferrer")
      } else {
        $el.removeAttr("target")
        $el.removeAttr("rel")
      }
    }
  })

  return $.html()
}

export function htmlToPlainText(html: string) {
  if (!html) return ""
  return cheerio.load(html, null, false).text().replace(/\s+/g, " ").trim()
}
