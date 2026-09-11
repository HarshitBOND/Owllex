"""Reconcile a scraper's "downloaded" LMDB index against its manifest.

PRODUCTION_TODO.md T3: the SCI scraper used to mark a CNR as downloaded in
LMDB (`sci:cnr:<cnr>`) before the PDF and its manifest row were written. A
crash, kill or OOM between those two events left an orphan: LMDB says the
judgment is fetched, nothing is on disk, and the scrape loop's skip check
(`has("sci:cnr:...")`) means no future run ever tries again. persist.ts fixes
the ordering going forward; this script finds orphans left behind by any run
before that fix landed (or by a bug like it in some future source), and can
remove them so the next scrape retries.

Reads `<source>:cnr:*` keys directly out of the scraper's LMDB environment --
not through rag/core/hash_index.py, which is a different index entirely (see
rag/scrapping/hashdb.ts's module docstring: that one means "ingested", this
one means "downloaded").

Cross-runtime caveat: the npm `lmdb` package this index is written with
defaults to on-disk data format V2, which Python's `lmdb` binding cannot open
(`lmdb.InvalidError: ... File is not an LMDB file`). Rebuild it in the
legacy, cross-compatible V1 format once, wherever a scrape actually runs:

    npm run scrape:setup-lmdb-v1

This is deliberately not wired into `npm install` for the whole project --
the scraper (and this script) run on whatever machine does the scraping, not
in the Vercel build, and forcing every install everywhere to compile a native
module from source is a bigger call than this task's scope. See
rag/scrapping/README.md.

Usage:
    cd backend
    .venv/bin/python -m rag.scripts.audit_scrape_index [--source sci] [--fix]

Exit status: 0 if no orphans (or --fix removed all of them), 1 if orphans
remain, 2 if the LMDB environment could not be read at all.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import lmdb


def _scrape_lmdb_path() -> Path:
    """Mirrors rag/scrapping/hashdb.ts's DB_PATH resolution exactly.

    Not rag/core/config.py's tiered DATA_ROOT resolution -- the TypeScript
    scrapers don't read that (see PRODUCTION_TODO.md T4), so matching what
    they actually do today is what makes this script look at the right file.
    """
    override = os.environ.get("SCRAPE_LMDB_PATH", "").strip()
    if override:
        return Path(override)
    data_root = os.environ.get("DATA_ROOT", "").strip() or "/data"
    return Path(data_root) / "lmdb" / "scrapping_hashdb"


def _manifest_path(source: str) -> Path:
    """Mirrors download.ts's SOURCE_DIR: rag/scrapping/data/raw/<source>/."""
    return Path(__file__).resolve().parents[1] / "scrapping" / "data" / "raw" / source / "manifest.jsonl"


def _cnr_keys_in_lmdb(env: lmdb.Environment, prefix: bytes) -> set[str]:
    keys: set[str] = set()
    with env.begin() as txn:
        cursor = txn.cursor()
        if not cursor.set_range(prefix):
            return keys
        for key, _value in cursor:
            if not key.startswith(prefix):
                break
            keys.add(key[len(prefix) :].decode("utf-8", errors="replace"))
    return keys


def _cnrs_in_manifest(path: Path) -> set[str]:
    cnrs: set[str] = set()
    if not path.exists():
        return cnrs
    with path.open("r", encoding="utf-8") as fh:
        for line_no, raw_line in enumerate(fh, start=1):
            line = raw_line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                print(f"  warning: {path}:{line_no} is not valid JSON, skipping", file=sys.stderr)
                continue
            cnr = row.get("cnr")
            if cnr:
                cnrs.add(str(cnr))
    return cnrs


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--source", default="sci", help="Key namespace and manifest directory to audit (default: sci)"
    )
    parser.add_argument(
        "--fix",
        action="store_true",
        help="Delete orphaned '<source>:cnr:*' keys so the next scrape run retries them",
    )
    parser.add_argument(
        "--map-size-mb",
        type=int,
        default=4096,
        help="LMDB map size in MiB (default: 4096, matching rag/core/hash_index.py)",
    )
    args = parser.parse_args()

    lmdb_path = _scrape_lmdb_path()
    if not lmdb_path.exists():
        print(f"{lmdb_path} does not exist -- nothing scraped yet, nothing to audit.")
        return 0

    try:
        env = lmdb.open(
            str(lmdb_path),
            map_size=args.map_size_mb * 1024 * 1024,
            readonly=not args.fix,
            lock=True,
            max_dbs=0,
        )
    except lmdb.InvalidError as exc:
        print(
            f"Could not open {lmdb_path} as an LMDB environment: {exc}\n\n"
            "This almost always means the npm `lmdb` package that wrote it was built "
            "with the default on-disk data format (V2), which Python's `lmdb` binding "
            "cannot read. Rebuild it in the legacy, cross-compatible V1 format on "
            "whichever machine runs the scraper:\n\n"
            "    npm run scrape:setup-lmdb-v1\n\n"
            "then re-run the scrape (existing V2-format data has to be re-scraped; "
            "there is no in-place format conversion). See rag/scrapping/README.md.",
            file=sys.stderr,
        )
        return 2

    try:
        prefix = f"{args.source}:cnr:".encode("utf-8")
        cnr_keys = _cnr_keys_in_lmdb(env, prefix)

        manifest_path = _manifest_path(args.source)
        manifest_cnrs = _cnrs_in_manifest(manifest_path)

        orphans = sorted(cnr_keys - manifest_cnrs)
        # The reverse case -- a manifest row with no LMDB marker -- is not data
        # loss (the row and its PDF exist; only the "don't refetch" flag is
        # missing), just wasted bandwidth on the next run. Worth surfacing,
        # never worth failing the check over.
        unmarked = sorted(manifest_cnrs - cnr_keys)

        print(f"LMDB {lmdb_path}: {len(cnr_keys)} '{args.source}:cnr:*' key(s)")
        print(f"Manifest {manifest_path}: {len(manifest_cnrs)} row(s) with a cnr")
        print(f"Orphaned (marked downloaded, no manifest row -- will NEVER be re-fetched): {len(orphans)}")
        for cnr in orphans:
            print(f"  {cnr}")
        if unmarked:
            print(f"Unmarked (manifest row exists, LMDB marker missing -- harmless): {len(unmarked)}")
            for cnr in unmarked:
                print(f"  {cnr}")

        if args.fix and orphans:
            with env.begin(write=True) as txn:
                for cnr in orphans:
                    txn.delete(f"{args.source}:cnr:{cnr}".encode("utf-8"))
            print(f"--fix: deleted {len(orphans)} orphaned key(s); the next scrape run will retry them.")
            orphans = []
    finally:
        env.close()

    return 1 if orphans else 0


if __name__ == "__main__":
    raise SystemExit(main())
