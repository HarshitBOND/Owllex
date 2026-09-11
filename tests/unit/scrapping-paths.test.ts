// Regression tests for PRODUCTION_TODO.md T4: the TypeScript scrapers used to
// resolve storage roots only from DATA_ROOT/PDF_ROOT, so on a split host
// (HDD_DATA_ROOT + SSD_DATA_ROOT, per backend/.env.example) they wrote PDFs and
// the LMDB "downloaded" index to different volumes than the Python backend
// reads, and the year-bucketing bug in storage.ts turned "writing it twice is
// free" into two full copies of every scraped PDF.

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ENV_KEYS = ["DATA_ROOT", "HDD_DATA_ROOT", "SSD_DATA_ROOT", "LEGAL_CORPUS_ROOT", "PDF_ROOT", "BACKUP_ROOT"]
const savedEnv: Record<string, string | undefined> = {}

let root: string

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key]
  root = mkdtempSync(join(tmpdir(), "scrapping-paths-test-"))
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
  rmSync(root, { recursive: true, force: true })
})

describe("paths.ts on a split host", () => {
  it("resolves the corpus and backups under HDD_DATA_ROOT, not DATA_ROOT", async () => {
    process.env.DATA_ROOT = join(root, "data-root-should-not-be-used")
    process.env.HDD_DATA_ROOT = join(root, "hdd")
    process.env.SSD_DATA_ROOT = join(root, "ssd")
    delete process.env.LEGAL_CORPUS_ROOT
    delete process.env.PDF_ROOT
    delete process.env.BACKUP_ROOT

    const { pdfRoot, backupRoot } = await import("../../backend/rag/scrapping/paths.js")
    expect(pdfRoot()).toBe(join(root, "hdd", "legal_corpus"))
    expect(backupRoot()).toBe(join(root, "hdd", "backups"))
  })

  it("resolves the scrape LMDB default under SSD_DATA_ROOT, not DATA_ROOT", async () => {
    process.env.DATA_ROOT = join(root, "data-root-should-not-be-used")
    process.env.HDD_DATA_ROOT = join(root, "hdd")
    process.env.SSD_DATA_ROOT = join(root, "ssd")
    delete process.env.SCRAPE_LMDB_PATH

    // hashdb.ts opens its LMDB env as a side effect of import, at whatever
    // ssdDataRoot() resolves to at that instant -- dynamic import so the env
    // vars above are set first.
    const hashdb = await import("../../backend/rag/scrapping/hashdb.js")
    await hashdb.put("probe", 1)
    expect(existsSync(join(root, "ssd", "lmdb", "scrapping_hashdb"))).toBe(true)
    expect(existsSync(join(root, "hdd", "lmdb"))).toBe(false)
  })

  it("an explicit LEGAL_CORPUS_ROOT always wins, even over HDD_DATA_ROOT", async () => {
    process.env.HDD_DATA_ROOT = join(root, "hdd")
    process.env.LEGAL_CORPUS_ROOT = join(root, "wherever-the-operator-said")
    delete process.env.PDF_ROOT

    const { pdfRoot } = await import("../../backend/rag/scrapping/paths.js")
    expect(pdfRoot()).toBe(join(root, "wherever-the-operator-said"))
  })

  it("falls back to a non-empty pre-rename documents/ dir rather than presenting the corpus as empty", async () => {
    process.env.HDD_DATA_ROOT = join(root, "hdd")
    delete process.env.LEGAL_CORPUS_ROOT
    delete process.env.PDF_ROOT

    const legacy = join(root, "hdd", "documents")
    mkdirSync(legacy, { recursive: true })
    writeFileSync(join(legacy, "existing.pdf"), "already here")

    const { pdfRoot } = await import("../../backend/rag/scrapping/paths.js")
    expect(pdfRoot()).toBe(legacy)
  })

  it("a single-volume host (only DATA_ROOT set) resolves identically to before the split existed", async () => {
    process.env.DATA_ROOT = join(root, "single-volume")
    delete process.env.HDD_DATA_ROOT
    delete process.env.SSD_DATA_ROOT
    delete process.env.LEGAL_CORPUS_ROOT
    delete process.env.PDF_ROOT
    delete process.env.BACKUP_ROOT

    const { pdfRoot, backupRoot } = await import("../../backend/rag/scrapping/paths.js")
    expect(pdfRoot()).toBe(join(root, "single-volume", "legal_corpus"))
    expect(backupRoot()).toBe(join(root, "single-volume", "backups"))
  })
})

describe("storage.ts year bucketing", () => {
  it("buckets by the document's own year, not the day it was scraped", async () => {
    process.env.DATA_ROOT = root
    delete process.env.HDD_DATA_ROOT
    delete process.env.LEGAL_CORPUS_ROOT
    delete process.env.PDF_ROOT

    const { uploadRawDocument } = await import("../../backend/rag/scrapping/storage.js")
    const src = join(root, "src.pdf")
    writeFileSync(src, "%PDF-1.4 a 1998 judgment scraped in 2026")

    await uploadRawDocument("sci", "deadbeef", ".pdf", src, "1998")

    expect(existsSync(join(root, "legal_corpus", "sci", "1998", "deadbeef.pdf"))).toBe(true)
    expect(existsSync(join(root, "legal_corpus", "sci", String(new Date().getUTCFullYear())))).toBe(false)
  })

  it("buckets an unknown year under unknown-year/ instead of guessing the current year", async () => {
    process.env.DATA_ROOT = root
    delete process.env.HDD_DATA_ROOT
    delete process.env.LEGAL_CORPUS_ROOT
    delete process.env.PDF_ROOT

    const { uploadRawDocument } = await import("../../backend/rag/scrapping/storage.js")
    const src = join(root, "src.pdf")
    writeFileSync(src, "%PDF-1.4 no known date")

    await uploadRawDocument("sci", "cafef00d", ".pdf", src) // no year argument at all
    await uploadRawDocument("sci", "0000hash", ".pdf", src, "0000") // the india_code "we don't know" sentinel

    const bucket = join(root, "legal_corpus", "sci", "unknown-year")
    expect(readdirSync(bucket).sort()).toEqual(["0000hash.pdf", "cafef00d.pdf"])
  })
})
