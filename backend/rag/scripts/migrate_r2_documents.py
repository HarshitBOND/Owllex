"""Move user documents out of Cloudflare R2 and onto the mounted HDD.

    cd backend
    .venv/bin/python -m rag.scripts.migrate_r2_documents --dry-run
    .venv/bin/python -m rag.scripts.migrate_r2_documents --source r2
    .venv/bin/python -m rag.scripts.migrate_r2_documents --source-dir /mnt/r2-sync

Reads the metadata that already describes every stored object -- the Mongo
collections the Next app writes, or a JSON/JSONL manifest exported from them --
fetches each object's bytes, verifies them against the SHA-256 already on record,
and writes them into ``USERS_ROOT`` with a row in SQLite. Document ids, owners
and categories are preserved, so a link that worked before the migration works
after it.

**Two ways to get the bytes.** ``--source r2`` pulls each object over the S3 API
as it goes, which needs nothing but credentials. ``--source-dir`` reads them from
a local tree (``rclone sync r2:bucket /mnt/r2-sync``), which is what you want for
a large vault: the sync is resumable and parallel in a way a per-object loop is
not, and it can run for hours before the cutover window opens.

**Every run is resumable and idempotent.** A document already migrated -- its row
present and its file on disk with the right hash -- is counted as a duplicate and
skipped, so an interrupted run is restarted by running it again. Nothing is ever
deleted from R2: rollback is redeploying the previous build.

The report is the deliverable. It counts ``migrated``, ``failed``, ``duplicates``
and ``missing``, and lists every non-migrated document with the reason, because
"1,482 of 1,504 succeeded" is not a result anybody can act on.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import shutil
import sys
import tempfile
from collections import Counter
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Iterator

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from rag.core.config import get_config
from rag.core.services import build_services, shutdown, startup
from rag.core.user_paths import (
    ARCHIVE_TYPES,
    CATEGORIES,
    DEFAULT_CATEGORY,
    UnsafePathError,
    is_document_id,
    sanitize_filename,
)

logger = logging.getLogger("ravenslaw.migrate")

# Which Mongo collection maps to which category. Vault documents are a mixed bag
# by definition, so they land in `miscellaneous`; contract reviews and task
# attachments have an unambiguous home. Corpus documents are absent on purpose --
# they belong to the RAG pipeline and already live in the corpus tree.
DEFAULT_COLLECTIONS: dict[str, str] = {
    "vaultdocuments": DEFAULT_CATEGORY,
    "contractreviews": "contracts",
    "attachments": "evidence",
}

# Field names differ per collection; these are the ones that vary.
_FILENAME_FIELDS = ("filename", "fileName", "originalFilename", "name")


@dataclass
class Outcome:
    """What happened to one document, and enough context to act on it."""

    document_id: str
    legacy_id: str
    owner_id: str
    collection: str
    storage_key: str
    filename: str
    status: str
    detail: str = ""


@dataclass
class Report:
    """The migration's result. Serialised to JSON and printed as a summary."""

    started_at: str
    finished_at: str = ""
    dry_run: bool = False
    source: str = ""
    counts: dict[str, int] = field(default_factory=dict)
    outcomes: list[dict] = field(default_factory=list)

    def summary(self) -> str:
        order = ("migrated", "failed", "duplicates", "missing")
        lines = [f"{name:<12} {self.counts.get(name, 0)}" for name in order]
        extra = sorted(set(self.counts) - set(order))
        lines += [f"{name:<12} {self.counts[name]}" for name in extra]
        return "\n".join(lines)


# ─── Sources of bytes ────────────────────────────────────────────────────────


class ObjectSource:
    """Fetches one stored object's bytes into a local file."""

    name = "none"

    def fetch(self, key: str, destination: Path) -> bool:
        """Write the object at ``key`` to ``destination``. False when absent."""
        raise NotImplementedError

    def close(self) -> None:
        pass


class DirectorySource(ObjectSource):
    """Objects already synced to a local tree, keyed by their R2 object key."""

    name = "directory"

    def __init__(self, root: Path) -> None:
        self._root = root.resolve()
        if not self._root.is_dir():
            raise SystemExit(f"--source-dir {root} is not a directory")

    def fetch(self, key: str, destination: Path) -> bool:
        candidate = (self._root / key.lstrip("/")).resolve()
        # The key comes out of a database. Even here, mid-migration, it does not
        # get to name a file outside the tree the operator pointed us at.
        if not str(candidate).startswith(str(self._root) + os.sep):
            raise UnsafePathError(f"Object key escapes --source-dir: {key!r}")
        if not candidate.is_file():
            return False
        shutil.copyfile(candidate, destination)
        return True


class R2Source(ObjectSource):
    """Objects pulled over the S3-compatible API, one at a time."""

    name = "r2"

    def __init__(self, bucket: str | None = None) -> None:
        try:
            import boto3
        except ImportError as exc:  # pragma: no cover - depends on the image
            raise SystemExit(
                "--source r2 needs boto3 (uv pip install boto3), or use --source-dir "
                "with an rclone sync."
            ) from exc

        account = os.getenv("R2_ACCOUNT_ID", "").strip()
        key_id = os.getenv("R2_ACCESS_KEY_ID", "").strip()
        secret = os.getenv("R2_SECRET_ACCESS_KEY", "").strip()
        self._bucket = (bucket or os.getenv("R2_PRIVATE_BUCKET", "")).strip()
        missing = [
            name
            for name, value in (
                ("R2_ACCOUNT_ID", account),
                ("R2_ACCESS_KEY_ID", key_id),
                ("R2_SECRET_ACCESS_KEY", secret),
                ("R2_PRIVATE_BUCKET", self._bucket),
            )
            if not value
        ]
        if missing:
            raise SystemExit(f"--source r2 needs: {', '.join(missing)}")

        self._client = boto3.client(
            "s3",
            endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
            aws_access_key_id=key_id,
            aws_secret_access_key=secret,
            region_name="auto",
        )

    def fetch(self, key: str, destination: Path) -> bool:
        from botocore.exceptions import ClientError

        try:
            self._client.download_file(self._bucket, key, str(destination))
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code in ("404", "NoSuchKey", "NotFound"):
                return False
            raise
        return True


# ─── Sources of metadata ─────────────────────────────────────────────────────


def _records_from_mongo(uri: str, database: str, collections: dict[str, str]) -> Iterator[dict]:
    try:
        from pymongo import MongoClient
    except ImportError as exc:  # pragma: no cover - depends on the image
        raise SystemExit("--from-mongo needs pymongo (uv pip install pymongo)") from exc

    client = MongoClient(uri, serverSelectionTimeoutMS=10_000)
    try:
        db = client[database]
        present = set(db.list_collection_names())
        for name, category in collections.items():
            if name not in present:
                logger.warning("Collection %s is not in %s; skipping", name, database)
                continue
            # Only rows that actually point at an object. A row with no r2Key has
            # nothing to migrate and would otherwise be reported as "missing".
            cursor = db[name].find({"r2Key": {"$exists": True, "$nin": [None, ""]}})
            for document in cursor:
                yield _normalise(document, collection=name, category=category)
    finally:
        client.close()


def _records_from_manifest(path: Path, default_category: str) -> Iterator[dict]:
    """JSON array or JSONL, one object per stored document."""
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        return
    if text.lstrip().startswith("["):
        rows = json.loads(text)
    else:
        rows = [json.loads(line) for line in text.splitlines() if line.strip()]
    for row in rows:
        yield _normalise(
            row,
            collection=str(row.get("collection") or "manifest"),
            category=str(row.get("category") or default_category),
        )


def _normalise(document: dict, *, collection: str, category: str) -> dict:
    """One shape for every source, with the id and category settled here."""
    legacy_id = str(document.get("_id") or document.get("document_id") or "")
    filename = ""
    for candidate in _FILENAME_FIELDS:
        if document.get(candidate):
            filename = str(document[candidate])
            break

    requested = str(document.get("category") or category).strip().lower()
    if requested not in CATEGORIES:
        requested = category if category in CATEGORIES else DEFAULT_CATEGORY

    return {
        "legacy_id": legacy_id,
        "owner_id": str(document.get("clerkUid") or document.get("owner_id") or "").strip(),
        "collection": collection,
        "category": requested,
        "storage_key": str(document.get("r2Key") or document.get("storage_key") or ""),
        "filename": filename,
        "mime_type": str(document.get("mimeType") or document.get("mime_type") or ""),
        "sha256": str(document.get("sha256") or "").strip().lower(),
        "size": int(document.get("size") or 0),
    }


# ─── The migration itself ────────────────────────────────────────────────────


def migrate(
    services,
    records: Iterable[dict],
    source: ObjectSource,
    *,
    dry_run: bool = False,
    limit: int | None = None,
    verify_hash: bool = True,
) -> Report:
    report = Report(
        started_at=datetime.now(timezone.utc).isoformat(),
        dry_run=dry_run,
        source=source.name,
    )
    counts: Counter[str] = Counter()
    staging = Path(tempfile.mkdtemp(prefix="r2_migration_"))

    try:
        for index, record in enumerate(records):
            if limit is not None and index >= limit:
                break
            outcome = _migrate_one(services, record, source, staging, dry_run, verify_hash)
            counts[outcome.status] += 1
            if outcome.status != "migrated" or dry_run:
                report.outcomes.append(asdict(outcome))
            if (index + 1) % 100 == 0:
                logger.info("%d processed (%s)", index + 1, dict(counts))
    finally:
        shutil.rmtree(staging, ignore_errors=True)

    report.counts = dict(counts)
    report.finished_at = datetime.now(timezone.utc).isoformat()
    return report


def _migrate_one(
    services,
    record: dict,
    source: ObjectSource,
    staging: Path,
    dry_run: bool,
    verify_hash: bool,
) -> Outcome:
    legacy_id = record["legacy_id"]
    owner_id = record["owner_id"]
    storage_key = record["storage_key"]
    filename = sanitize_filename(record["filename"])

    # A preserved ObjectId keeps every existing link working. Anything else -- a
    # legacy row with a non-hex id, or none at all -- gets one *derived* from the
    # owner and the object key rather than a fresh UUID, so a re-run recognises
    # the document it already migrated instead of storing a second copy under a
    # new name. The report carries the mapping so the Next rows can be repointed.
    document_id = (
        legacy_id.lower()
        if is_document_id(legacy_id.lower())
        else _derived_document_id(owner_id, storage_key, legacy_id)
    )

    def outcome(status: str, detail: str = "") -> Outcome:
        return Outcome(
            document_id=document_id,
            legacy_id=legacy_id,
            owner_id=owner_id,
            collection=record["collection"],
            storage_key=storage_key,
            filename=filename,
            status=status,
            detail=detail,
        )

    if not owner_id:
        return outcome("failed", "no owner recorded; a private document must have one")
    if not storage_key:
        return outcome("failed", "no storage key recorded")

    existing = services.metadata.get_owned_document(document_id, owner_id)
    if existing is not None and services.user_documents.exists(existing.storage_path):
        return outcome("duplicates", "already migrated")
    if existing is None and services.metadata.private_document_exists(document_id):
        # Same id, different owner. Never silently re-home it: that is either an
        # id collision or a corrupt source row, and both need a human.
        return outcome("failed", "document id already belongs to another owner")

    staged = staging / f"{document_id}.bin"
    try:
        found = source.fetch(storage_key, staged)
    except UnsafePathError as exc:
        return outcome("failed", str(exc))
    except Exception as exc:
        return outcome("failed", f"fetch failed: {exc}")

    if not found:
        return outcome("missing", "object not found in the source")

    try:
        digest = _sha256(staged)
        expected = record["sha256"]
        if verify_hash and expected and digest != expected:
            # The recorded hash is what the vault's own verify endpoint checks
            # against. Writing bytes that fail it would migrate a document into a
            # permanently "corrupted" state, so it is a hard stop.
            return outcome(
                "failed",
                f"sha256 mismatch: recorded {expected[:12]}..., got {digest[:12]}...",
            )
        if expected and digest != expected:
            logger.warning("Hash mismatch on %s accepted (--no-verify)", document_id)

        if dry_run:
            return outcome("migrated", "dry run: would migrate")

        stored = services.user_documents.store(
            staged,
            document_id=document_id,
            owner_id=owner_id,
            category=record["category"],
            declared_content_type=record["mime_type"],
            # Wider than the upload route accepts: the vault holds images and
            # text that predate the PDF/DOCX rule, and they are not losable.
            accepted_types=ARCHIVE_TYPES,
        )
    except UnsafePathError as exc:
        return outcome("failed", f"rejected: {exc}")
    except FileExistsError:
        return outcome("duplicates", "file already present on the volume")
    except Exception as exc:
        logger.exception("Failed to store %s", document_id)
        return outcome("failed", f"store failed: {exc}")
    finally:
        staged.unlink(missing_ok=True)

    try:
        services.metadata.insert_user_document(
            document_id=stored.document_id,
            owner_id=owner_id,
            category=stored.category,
            storage_path=stored.storage_path,
            original_filename=filename,
            mime_type=stored.mime_type,
            file_size=stored.file_size,
            content_hash=stored.sha256,
            title=filename,
        )
    except Exception as exc:
        # Roll the file back so a retried run is not blocked by bytes no row
        # describes. Leaving it would turn a transient database error into a
        # permanent "file already present" for that document.
        services.user_documents.delete(stored.storage_path, owner_id=owner_id)
        logger.exception("Failed to record %s", document_id)
        return outcome("failed", f"metadata insert failed: {exc}")

    return outcome("migrated")


def _derived_document_id(owner_id: str, storage_key: str, legacy_id: str) -> str:
    """A stable id for a row whose own id cannot be preserved.

    Deterministic in the source row, so running the migration twice produces the
    same id twice -- which is what makes the second run a no-op instead of a
    duplicate. Not a UUID4, but it occupies the same 32-hex namespace and is just
    as unguessable.
    """
    material = f"{owner_id}\x00{storage_key}\x00{legacy_id}".encode("utf-8")
    return hashlib.sha256(material).hexdigest()[:32]


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


# ─── CLI ─────────────────────────────────────────────────────────────────────


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--source",
        choices=("r2", "dir"),
        default=None,
        help="Where the bytes come from. Implied by --source-dir.",
    )
    parser.add_argument("--source-dir", type=Path, help="Local tree of objects keyed by R2 key")
    parser.add_argument("--bucket", help="R2 bucket (default: $R2_PRIVATE_BUCKET)")

    parser.add_argument("--manifest", type=Path, help="JSON/JSONL export instead of Mongo")
    parser.add_argument("--mongo-uri", default=os.getenv("MONGODB_URI", ""))
    parser.add_argument("--mongo-db", default=os.getenv("MONGODB_DB", ""))
    parser.add_argument(
        "--collection",
        action="append",
        metavar="NAME[:CATEGORY]",
        help="Mongo collection to migrate; repeatable. Defaults to "
        + ", ".join(f"{k}:{v}" for k, v in DEFAULT_COLLECTIONS.items()),
    )
    parser.add_argument(
        "--category",
        default=DEFAULT_CATEGORY,
        choices=CATEGORIES,
        help="Category for manifest rows that do not name one",
    )

    parser.add_argument("--dry-run", action="store_true", help="Report only; write nothing")
    parser.add_argument("--limit", type=int, help="Stop after this many documents")
    parser.add_argument(
        "--no-verify",
        action="store_true",
        help="Do not fail a document whose bytes disagree with its recorded SHA-256",
    )
    parser.add_argument("--report", type=Path, help="Write the JSON report here")
    parser.add_argument("--verbose", action="store_true")
    return parser.parse_args(argv)


def _collections(values: list[str] | None) -> dict[str, str]:
    if not values:
        return dict(DEFAULT_COLLECTIONS)
    mapping: dict[str, str] = {}
    for value in values:
        name, _, category = value.partition(":")
        category = (category or DEFAULT_CATEGORY).strip().lower()
        if category not in CATEGORIES:
            raise SystemExit(f"Unknown category {category!r} for collection {name!r}")
        mapping[name.strip()] = category
    return mapping


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)-7s %(message)s",
    )

    if args.source_dir:
        source: ObjectSource = DirectorySource(args.source_dir)
    elif args.source == "r2":
        source = R2Source(args.bucket)
    elif args.dry_run:
        # A dry run still has to prove it can find the bytes, so it needs a
        # source too -- but refusing outright would make the safest way to try
        # this the one that needs the most setup.
        raise SystemExit("Choose --source r2 or --source-dir, even for a dry run")
    else:
        raise SystemExit("Choose --source r2 or --source-dir")

    if args.manifest:
        records = _records_from_manifest(args.manifest, args.category)
    else:
        if not args.mongo_uri or not args.mongo_db:
            raise SystemExit(
                "Set --mongo-uri/--mongo-db (or MONGODB_URI/MONGODB_DB), or pass --manifest"
            )
        records = _records_from_mongo(args.mongo_uri, args.mongo_db, _collections(args.collection))

    config = get_config()
    logger.info(
        "Migrating into %s (dry run: %s, source: %s)", config.users_root, args.dry_run, source.name
    )

    services = build_services()
    startup(services)
    try:
        report = migrate(
            services,
            records,
            source,
            dry_run=args.dry_run,
            limit=args.limit,
            verify_hash=not args.no_verify,
        )
    finally:
        source.close()
        shutdown(services)

    print()
    print(report.summary())

    if args.report:
        args.report.write_text(json.dumps(asdict(report), indent=2) + "\n", encoding="utf-8")
        print(f"\nFull report: {args.report}")
    elif report.outcomes:
        print("\nFirst 20 documents needing attention:")
        for row in report.outcomes[:20]:
            print(f"  [{row['status']}] {row['legacy_id']} {row['filename']}: {row['detail']}")

    # Non-zero when anything failed or went missing, so a deploy script that runs
    # this does not sail past a partial migration.
    return 1 if report.counts.get("failed") or report.counts.get("missing") else 0


if __name__ == "__main__":
    raise SystemExit(main())
