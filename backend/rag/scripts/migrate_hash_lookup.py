"""One-time migration: hash_lookup.json -> LMDB hash index.

Old architecture kept a full hash_lookup.json loaded into memory at startup.
That file, if one still exists on disk, is never read during normal
application execution anymore -- run this once to move its entries into
rag/data/hash_index.lmdb, then it can be deleted.

Usage:
    python -m rag.scripts.migrate_hash_lookup [path/to/hash_lookup.json]
"""

import json
import sys
from pathlib import Path

from rag import hash_db

DEFAULT_PATH = Path(__file__).resolve().parents[1] / "data" / "hash_lookup.json"


def main():
    json_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PATH
    if not json_path.exists():
        print(f"No hash_lookup.json found at {json_path}, nothing to migrate.")
        return

    data = json.loads(json_path.read_text())
    hashes = dict(data.items()) if isinstance(data, dict) else {h: "1" for h in data}

    for content_hash, value in hashes.items():
        hash_db.put(content_hash, str(value))

    verified = sum(1 for h in hashes if hash_db.exists(h))
    print(f"Migrated {len(hashes)} distinct hashes from {json_path}.")
    print(f"Verified {verified}/{len(hashes)} present in LMDB (total in index: {hash_db.count()}).")
    if verified != len(hashes):
        print("WARNING: verification count mismatch -- some entries did not land in LMDB.")


if __name__ == "__main__":
    main()
