// Regression test for PRODUCTION_TODO.md T3: the SCI scraper used to mark a
// judgment "downloaded" in LMDB before the PDF and manifest row were actually
// written, so a crash in that window permanently hid the judgment from every
// future scrape run (the skip check at the top of the scrape loop is exactly
// that LMDB flag). persistDownloadedJudgment fixes the ordering; this test
// forces a failure partway through a "download" and asserts the CNR is *not*
// marked done until the write it names has actually landed on disk.

import { beforeAll, describe, expect, it, vi } from "vitest"
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { tmpdir } from "node:os"
import { join } from "node:path"

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>()
  return {
    ...actual,
    appendFileSync: vi.fn(actual.appendFileSync),
  }
})

let persistDownloadedJudgment: typeof import(
  "../../backend/rag/scrapping/sources/sci-judgments/persist.js"
).persistDownloadedJudgment
let has: typeof import("../../backend/rag/scrapping/hashdb.js").has
let put: typeof import("../../backend/rag/scrapping/hashdb.js").put
let fsMock: { appendFileSync: ReturnType<typeof vi.fn> }

let pdfDir: string
let manifestPath: string

beforeAll(async () => {
  // Must be set before the first import of hashdb.js -- it opens its LMDB
  // environment as a module-load side effect, at whatever SCRAPE_LMDB_PATH
  // resolves to at that instant. Hence the dynamic imports below rather than
  // static ones: a static import is hoisted above this assignment.
  const root = mkdtempSync(join(tmpdir(), "sci-scraper-test-"))
  pdfDir = join(root, "pdfs")
  manifestPath = join(root, "manifest.jsonl")
  mkdirSync(pdfDir, { recursive: true })

  process.env.SCRAPE_LMDB_PATH = join(root, "lmdb")
  process.env.DATA_ROOT = root
  process.env.PDF_ROOT = join(root, "archive")
  process.env.BACKUP_ROOT = join(root, "backups")

  const persistMod = await import("../../backend/rag/scrapping/sources/sci-judgments/persist.js")
  const hashdbMod = await import("../../backend/rag/scrapping/hashdb.js")
  const fsMod = await import("node:fs")
  persistDownloadedJudgment = persistMod.persistDownloadedJudgment
  has = hashdbMod.has
  put = hashdbMod.put
  fsMock = fsMod as unknown as { appendFileSync: ReturnType<typeof vi.fn> }
})

describe("persistDownloadedJudgment", () => {
  it("marks the CNR done only after the file and manifest row exist", async () => {
    const cnr = "CRASH-TEST-001"
    const buffer = Buffer.from("%PDF-1.4 fake judgment body for CRASH-TEST-001")

    // Simulate a crash between the file write and the manifest append -- the
    // exact window the old code got wrong (there it was worse: the CNR was
    // marked done before the file write even started).
    fsMock.appendFileSync.mockImplementationOnce(() => {
      throw new Error("simulated crash: process killed mid-write")
    })

    await expect(
      persistDownloadedJudgment(
        { cnr, title: "Kumar v. State", listingText: "listing", buffer },
        { source: "sci", pdfDir, manifestPath },
      ),
    ).rejects.toThrow("simulated crash")

    // The PDF landed on disk (writeFileSync ran before the simulated crash) --
    // this is deliberately not the assertion that matters. What matters is
    // the skip check, and that neither marker was set since the manifest
    // append -- the thing both markers now depend on -- never completed.
    expect(has(`sci:cnr:${cnr}`)).toBe(false)
    expect(has("sci:hash:" + createHash("sha256").update(buffer).digest("hex"))).toBe(false)

    // A second, uninterrupted run for the same CNR must therefore actually
    // retry it rather than silently skipping a judgment that was never
    // recorded -- this is the behavior the bug broke.
    const result = await persistDownloadedJudgment(
      { cnr, title: "Kumar v. State", listingText: "listing", buffer },
      { source: "sci", pdfDir, manifestPath },
    )
    expect(result.status).toBe("written")
    expect(has(`sci:cnr:${cnr}`)).toBe(true)

    // Exactly one manifest row -- the interrupted attempt must not have
    // partially appended anything for the retry to duplicate.
    const manifestLines = readFileSync(manifestPath, "utf8").trim().split("\n")
    expect(manifestLines).toHaveLength(1)
    expect(JSON.parse(manifestLines[0]).cnr).toBe(cnr)
  })

  it("a crash between the hash marker and the CNR marker does not lose the manifest row", async () => {
    // Regression for a gap the first version of this fix still had: moving
    // only the CNR marker to the end (per the task's literal instruction)
    // left the hash marker set *before* it. A crash in between made a retry
    // for the same CNR read its own interrupted attempt's hash marker as "someone
    // else already has this content", take the duplicate branch, and mark the
    // CNR done without ever writing its manifest row -- the file would exist
    // on disk with no manifest entry pointing at it. Fixed by writing the
    // manifest row before *either* marker, so this scenario can only be
    // reached with the manifest row already committed. Simulated directly
    // (rather than by injecting a failure between the two real put() calls,
    // which race-conditions on call order): construct the exact on-disk/LMDB
    // state a crash in that window would leave, then run the "restart".
    const cnr = "HALF-MARKED-001"
    const buffer = Buffer.from("%PDF-1.4 body for HALF-MARKED-001")
    const hash = createHash("sha256").update(buffer).digest("hex")
    const filename = `${cnr}.pdf`

    writeFileSync(join(pdfDir, filename), buffer)
    appendFileSync(manifestPath, JSON.stringify({ cnr, title: null, listingText: "", hash, filename }) + "\n")
    await put(`sci:hash:${hash}`, cnr); // the marker set before the simulated crash
    // sci:cnr:HALF-MARKED-001 deliberately left unset -- that's the crash.

    const linesBefore = readFileSync(manifestPath, "utf8").trim().split("\n").length

    const result = await persistDownloadedJudgment(
      { cnr, title: null, listingText: "", buffer },
      { source: "sci", pdfDir, manifestPath },
    )

    expect(result.status).toBe("duplicate")
    expect(has(`sci:cnr:${cnr}`)).toBe(true)
    // No second manifest row for a CNR whose row already exists.
    const linesAfter = readFileSync(manifestPath, "utf8").trim().split("\n").length
    expect(linesAfter).toBe(linesBefore)
  })

  it("marks a duplicate-content CNR done immediately -- there is nothing for a crash to lose", async () => {
    const buffer = Buffer.from("%PDF-1.4 identical body, filed under two CNRs")
    const first = await persistDownloadedJudgment(
      { cnr: "DUP-ORIGINAL", title: null, listingText: "", buffer },
      { source: "sci", pdfDir, manifestPath },
    )
    expect(first.status).toBe("written")

    const second = await persistDownloadedJudgment(
      { cnr: "DUP-COPY", title: null, listingText: "", buffer },
      { source: "sci", pdfDir, manifestPath },
    )
    expect(second.status).toBe("duplicate")
    expect(has("sci:cnr:DUP-COPY")).toBe(true)

    // No second PDF was written for the duplicate CNR.
    expect(readdirSync(pdfDir).filter((f) => f.startsWith("DUP-"))).toEqual(["DUP-ORIGINAL.pdf"])
  })

  it("never marks a CNR done when the write never happens at all", async () => {
    // Belt-and-braces: writeFileSync itself throwing (disk full, permissions)
    // must leave the CNR unmarked too, same as the manifest-append failure above.
    const cnr = "WRITE-FAILS"
    const buffer = Buffer.from("%PDF-1.4 body")

    const fsFull = await import("node:fs")
    const writeSpy = vi.spyOn(fsFull, "writeFileSync").mockImplementationOnce(() => {
      throw new Error("simulated ENOSPC")
    })

    await expect(
      persistDownloadedJudgment(
        { cnr, title: null, listingText: "", buffer },
        { source: "sci", pdfDir, manifestPath },
      ),
    ).rejects.toThrow("simulated ENOSPC")

    expect(has(`sci:cnr:${cnr}`)).toBe(false)
    writeSpy.mockRestore()
  })
})
