export const ALLOWED_TAGS: string[] = [
  "h1", "h2", "h3", "p", "br", "hr",
  "strong", "b", "em", "i", "u", "s",
  "ul", "ol", "li", "blockquote", "a",
  "table", "thead", "tbody", "tr", "th", "td",
]

// `style` survives only so TipTap's TextAlign has a serialisation; both
// sanitizers narrow it to a single text-align declaration and drop the rest.
// `data-page` records which page of the uploaded file a block came from; it is
// inert data with no href or script surface, and the citation chips are lost
// the moment a sanitiser pass strips it.
export const ALLOWED_ATTR: string[] = ["href", "target", "rel", "colspan", "rowspan", "style", "data-page"]

export const ALLOWED_HREF = /^(?:https?:|mailto:|tel:|#|\/)/i

export function textAlignOf(style: string) {
  const match = /text-align\s*:\s*(left|right|center|justify)/i.exec(style || "")
  return match ? match[1].toLowerCase() : ""
}
