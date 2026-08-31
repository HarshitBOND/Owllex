// Turns Docling's markdown output into the small HTML subset the editor allows
// (see lib/html/allowlist.ts). Deliberately simple: the user can fix anything
// this gets wrong directly in the rich text editor afterward.

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function inline(text: string) {
  let html = escapeHtml(text)
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
  return html
}

function tableRowCells(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim())
}

function isTableSeparator(line: string) {
  return /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/.test(line.trim())
}

export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")
  const html: string[] = []

  let i = 0
  let paragraph: string[] = []

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${inline(paragraph.join(" "))}</p>`)
      paragraph = []
    }
  }

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      flushParagraph()
      i++
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (heading) {
      flushParagraph()
      const level = Math.min(heading[1].length, 3)
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      i++
      continue
    }

    if (/^>\s?/.test(trimmed)) {
      flushParagraph()
      const quoted: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoted.push(lines[i].trim().replace(/^>\s?/, ""))
        i++
      }
      html.push(`<blockquote><p>${inline(quoted.join(" "))}</p></blockquote>`)
      continue
    }

    if (/^(-|\*)\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      flushParagraph()
      const ordered = /^\d+\.\s+/.test(trimmed)
      const tag = ordered ? "ol" : "ul"
      const items: string[] = []
      const itemPattern = ordered ? /^\d+\.\s+(.*)$/ : /^(?:-|\*)\s+(.*)$/
      while (i < lines.length) {
        const m = itemPattern.exec(lines[i].trim())
        if (!m) break
        items.push(`<li>${inline(m[1])}</li>`)
        i++
      }
      html.push(`<${tag}>${items.join("")}</${tag}>`)
      continue
    }

    if (trimmed.startsWith("|")) {
      flushParagraph()
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        if (!isTableSeparator(lines[i])) rows.push(tableRowCells(lines[i]))
        i++
      }
      if (rows.length) {
        const [headerRow, ...bodyRows] = rows
        const thead = `<thead><tr>${headerRow.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>`
        const tbody = bodyRows.length
          ? `<tbody>${bodyRows
              .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
              .join("")}</tbody>`
          : ""
        html.push(`<table>${thead}${tbody}</table>`)
      }
      continue
    }

    if (/^-{3,}$/.test(trimmed) || /^_{3,}$/.test(trimmed)) {
      flushParagraph()
      html.push("<hr>")
      i++
      continue
    }

    paragraph.push(trimmed)
    i++
  }

  flushParagraph()
  return html.join("\n") || "<p></p>"
}
