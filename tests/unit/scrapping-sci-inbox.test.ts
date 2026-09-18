// Regression tests for PRODUCTION_TODO.md T11: the SCI scraper used to POST
// each downloaded PDF to /api/v1/rag/ingest and await the job to a terminal
// status. With one gunicorn worker, a slow OCR run on an earlier document
// stalled every user query for as long as the scraper's own loop sat there
// polling. queueForIngest replaces that with a plain filesystem drop into
// INBOX_ROOT/<source>/, the same drop directory a manual bulk import uses and
// the same court-hint convention ingest_worker.py reads from a top-level
// subdirectory name -- so the scraper never talks to the serving API at all.

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ENV_KEYS = ["DATA_ROOT", "HDD_DATA_ROOT", "INBOX_ROOT"]
const savedEnv: Record<string, string | undefined> = {}

let root: string

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key]
  root = mkdtempSync(join(tmpdir(), "sci-scraper-inbox-test-"))
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
  rmSync(root, { recursive: true, force: true })
})

describe("queueForIngest", () => {
  it("copies the archived PDF into INBOX_ROOT/<source>/, not the serving API", async () => {
    process.env.HDD_DATA_ROOT = join(root, "hdd")
    delete process.env.INBOX_ROOT

    const src = join(root, "archive", "CNR-001.pdf")
    mkdirSync(join(root, "archive"), { recursive: true })
    writeFileSync(src, "%PDF-1.4 body for CNR-001")

    const { queueForIngest } = await import("../../backend/rag/scrapping/sources/sci-judgments/inbox.js")
    const queued = queueForIngest("sci", src, "CNR-001.pdf")

    const expected = join(root, "hdd", "inbox", "sci", "CNR-001.pdf")
    expect(queued).toBe(expected)
    expect(existsSync(expected)).toBe(true)
    expect(readFileSync(expected, "utf8")).toBe("%PDF-1.4 body for CNR-001")
    // No leftover .part file -- the rename must have landed, not just the copy.
    expect(existsSync(`${expected}.part`)).toBe(false)
    // The archived source copy is untouched -- this is a copy, not a move.
    expect(existsSync(src)).toBe(true)
  })

  it("lands in a court-named subdirectory ingest_worker.py's court-hint reader recognizes", async () => {
    // resolve_court("sci") in rag/core/paths.py resolves to a real court code
    // (PRODUCTION_TODO.md T11's whole point: this is not an arbitrary bucket
    // name, it's the exact string ingest_worker.py's _court_hint() reads from
    // a top-level inbox subdirectory).
    process.env.HDD_DATA_ROOT = join(root, "hdd")
    const src = join(root, "src.pdf")
    writeFileSync(src, "%PDF-1.4 body")

    const { queueForIngest } = await import("../../backend/rag/scrapping/sources/sci-judgments/inbox.js")
    queueForIngest("sci", src, "doc.pdf")

    const inboxRoot = join(root, "hdd", "inbox")
    expect(existsSync(join(inboxRoot, "sci", "doc.pdf"))).toBe(true)
  })

  it("returns null instead of throwing when the inbox cannot be written", async () => {
    // Point HDD_DATA_ROOT at a path that can never be a directory (a file
    // sitting where a directory needs to be created) -- mkdirSync must fail,
    // and that failure must not propagate: a scrape that downloaded and
    // archived the PDF correctly should not crash the whole run over this.
    const blocker = join(root, "not-a-directory")
    writeFileSync(blocker, "i am a file, not the hdd root")
    process.env.HDD_DATA_ROOT = blocker

    const src = join(root, "src.pdf")
    writeFileSync(src, "%PDF-1.4 body")

    const { queueForIngest } = await import("../../backend/rag/scrapping/sources/sci-judgments/inbox.js")
    expect(() => queueForIngest("sci", src, "doc.pdf")).not.toThrow()
    expect(queueForIngest("sci", src, "doc.pdf")).toBeNull()
  })

  it("honours an explicit INBOX_ROOT over the HDD_DATA_ROOT default", async () => {
    process.env.HDD_DATA_ROOT = join(root, "hdd")
    process.env.INBOX_ROOT = join(root, "custom-inbox")

    const src = join(root, "src.pdf")
    writeFileSync(src, "%PDF-1.4 body")

    const { queueForIngest } = await import("../../backend/rag/scrapping/sources/sci-judgments/inbox.js")
    const queued = queueForIngest("sci", src, "doc.pdf")

    expect(queued).toBe(join(root, "custom-inbox", "sci", "doc.pdf"))
    expect(existsSync(join(root, "hdd", "inbox"))).toBe(false)
  })
})
