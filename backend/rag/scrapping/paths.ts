// Storage layout for the TypeScript scrapers, resolved from the same environment
// variables the Python stack reads (rag/core/config.py).
//
// Kept deliberately tiny and duplicated rather than shared: these scripts run
// standalone via tsx, with no Python in the process, and the alternative is a
// build step or a subprocess call just to learn a directory name.

import { join } from "node:path";
import "dotenv/config";

const DEFAULT_DATA_ROOT = "/data";

export function dataRoot(): string {
  return process.env.DATA_ROOT?.trim() || DEFAULT_DATA_ROOT;
}

export function pdfRoot(): string {
  return process.env.PDF_ROOT?.trim() || join(dataRoot(), "documents");
}

export function backupRoot(): string {
  return process.env.BACKUP_ROOT?.trim() || join(dataRoot(), "backups");
}
