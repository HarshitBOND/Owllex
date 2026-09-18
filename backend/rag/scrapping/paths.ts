// Storage layout for the TypeScript scrapers, resolved from the same environment
// variables the Python stack reads (rag/core/config.py).
//
// Kept deliberately tiny and duplicated rather than shared: these scripts run
// standalone via tsx, with no Python in the process, and the alternative is a
// build step or a subprocess call just to learn a directory name.
//
// Storage is two-tier on a split host (PRODUCTION_TODO.md T4):
//   HDD_DATA_ROOT   bulk, sequential -- legal_corpus/, backups/
//   SSD_DATA_ROOT   small, random-access -- the scrape LMDB index
// Both fall back to DATA_ROOT, exactly like rag/core/config.py::RagConfig.from_env,
// so an unsplit single-volume host resolves identically on both sides.

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import "dotenv/config";

const DEFAULT_DATA_ROOT = "/data";

function env(name: string): string {
  return process.env[name]?.trim() || "";
}

export function dataRoot(): string {
  return env("DATA_ROOT") || DEFAULT_DATA_ROOT;
}

export function hddDataRoot(): string {
  return env("HDD_DATA_ROOT") || dataRoot();
}

export function ssdDataRoot(): string {
  return env("SSD_DATA_ROOT") || dataRoot();
}

/**
 * Where the public corpus lives -- mirrors
 * rag/core/config.py::_resolve_legal_corpus_root exactly, including its two
 * fallbacks: an explicit LEGAL_CORPUS_ROOT (or the legacy PDF_ROOT) always
 * wins, and failing that, an existing pre-rename `documents/` directory with
 * something in it is used as-is rather than presenting a live corpus as
 * empty. Without this, a scraped PDF and the same PDF ingested through
 * Python can land under different roots on a split host and never see each
 * other's copy.
 */
export function pdfRoot(): string {
  const explicit = env("LEGAL_CORPUS_ROOT") || env("PDF_ROOT");
  if (explicit) return explicit;

  const hdd = hddDataRoot();
  const renamed = join(hdd, "legal_corpus");
  const legacy = join(hdd, "documents");
  if (!existsSync(renamed) && existsSync(legacy) && readdirSync(legacy).length > 0) {
    return legacy;
  }
  return renamed;
}

// Bulk, sequential, immutable-once-written -- the HDD tier, same as
// rag/core/config.py's backup_root (HDD_DATA_ROOT/backups, not DATA_ROOT/backups).
export function backupRoot(): string {
  return env("BACKUP_ROOT") || join(hddDataRoot(), "backups");
}

// Where owllex-ingest.service watches for new documents -- same default as
// rag/core/config.py's inbox_root (HDD_DATA_ROOT/inbox). A scraper drops a
// finished PDF here instead of calling the ingest API directly (PRODUCTION_TODO.md
// T11): a top-level subdirectory matching a known court code (e.g. "sci") is
// read by the worker as a court hint, same as an operator's manual drop.
export function inboxRoot(): string {
  return env("INBOX_ROOT") || join(hddDataRoot(), "inbox");
}
