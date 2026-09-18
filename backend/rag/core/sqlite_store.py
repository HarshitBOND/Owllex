"""SQLite metadata database: documents, chunks, and their FAISS row ids.

FAISS stores vectors and nothing else, so everything a retrieval result needs to
be useful -- the chunk's text, the page it came from, the document's court,
citation, title and file path -- lives here, joined back by ``faiss_id``.

Design notes worth keeping in mind before changing this file:

* **``faiss_id`` is the join key and is allocated here.** It is a
  monotonically increasing int64 handed to ``faiss.IndexIDMap2.add_with_ids``.
  Ids are never reused, so a vector deleted from FAISS can never be confused
  with a later one, and a crash between the SQLite write and the FAISS write
  leaves an orphan row rather than a mislabelled hit.
* **Documents carry a ``status``**, which is what makes a 50,000-document
  ingest resumable: a run that dies mid-corpus restarts from the rows that
  never reached ``complete``.
* **Paths are relative, never absolute.** ``file_path``/``storage_path`` are
  relative to whichever root ``visibility`` names -- ``LEGAL_CORPUS_ROOT`` for
  ``public``, ``USERS_ROOT`` for ``private``. The volume has to be remountable
  without rewriting the database, and an absolute path in a row outlives the
  mount point it was written for.
* **The public/private invariants are enforced by triggers, not by convention.**
  A public document has no owner; a private one must have an owner, a category
  and a storage path, and neither its owner nor its path may ever be updated.
  Triggers rather than CHECK constraints because SQLite cannot add a table-level
  CHECK to an existing table -- a migrated database would silently have weaker
  rules than a fresh one, which is the worst possible outcome for a rule whose
  whole job is deciding who may read a file.
"""

from __future__ import annotations

import base64
import json
import logging
import sqlite3
import threading
from collections.abc import Callable, Iterable, Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import zstandard as zstd

logger = logging.getLogger("ravenslaw.rag.sqlite")

from rag.core.vector_index import PRIVATE_ID_MIN, PUBLIC_ID_MIN, SearchFilter

SCHEMA_VERSION = 4

# ─── chunk_text compression (PRODUCTION_TODO.md T16, step 1) ────────────────
#
# chunk_text is stored as a zstd-compressed blob rather than plain text --
# 4-6x smaller for 2KB legal-English chunks, which is ~90% of the metadata
# database's size at scale (T16's "Why"). The column keeps its TEXT type
# affinity in the DDL (a full ALTER to BLOB would mean rebuilding the whole
# table); SQLite stores BLOB values in a TEXT-affinity column unchanged
# regardless, so this is a data-format change, not a schema one, and is
# rolled out as a resumable backfill (_backfill_chunk_compression) rather
# than a numbered _MIGRATIONS step -- see that method's docstring.
#
# A dictionary trained once on the first boot's existing corpus (whatever is
# still plain text at that point) buys most of the ratio back on individual
# 2KB chunks, which are too small alone for zstd to find much redundancy in.
# It is persisted in `meta` (and therefore in every sqlite backup, see T2a)
# because without it the compressed data cannot be read back at all.
_ZSTD_DICT_META_KEY = "chunk_text_zstd_dict_b64"
_ZSTD_DICT_TRAINED_META_KEY = "chunk_text_zstd_dict_trained"
_ZSTD_DICT_SAMPLE_LIMIT = 20_000
_ZSTD_DICT_MIN_SAMPLES = 32
_CHUNK_COMPRESSION_ROWID_META_KEY = "chunk_text_compression_rowid"
_CHUNK_COMPRESSION_DONE_META_KEY = "chunk_text_compression_done"


def _zstd_compress_text(text: str, level: int, zdict: "zstd.ZstdCompressionDict | None") -> bytes:
    return zstd.ZstdCompressor(level=level, dict_data=zdict).compress(text.encode("utf-8"))


def _zstd_decompress_text(blob: bytes, zdict: "zstd.ZstdCompressionDict | None") -> str:
    return zstd.ZstdDecompressor(dict_data=zdict).decompress(bytes(blob)).decode("utf-8")

# Upper bound of the private partition. int64 is signed, so this is where ids
# would wrap into negatives -- FAISS treats -1 as "no result", so an id must
# never reach it.
_PRIVATE_ID_CEILING = (1 << 63) - 1

VISIBILITY_PUBLIC = "public"
VISIBILITY_PRIVATE = "private"

# Pipeline stages, in order. A document is resumable from whichever it reached.
STATUS_PENDING = "pending"
STATUS_PARSED = "parsed"
STATUS_CHUNKED = "chunked"
STATUS_EMBEDDED = "embedded"
STATUS_INDEXED = "indexed"
STATUS_COMPLETE = "complete"
STATUS_FAILED = "failed"

_TERMINAL_STATUSES = (STATUS_COMPLETE,)

_SCHEMA_TABLES = """
CREATE TABLE IF NOT EXISTS documents (
    document_id   TEXT PRIMARY KEY,
    collection    TEXT NOT NULL,
    court         TEXT,
    citation      TEXT,
    title         TEXT,
    file_path     TEXT,
    content_hash  TEXT,
    document_type TEXT,
    doc_date      TEXT,
    -- Which retrieval lane this document was routed to at ingest -- 'dense'
    -- (embedded + FTS5) or 'lexical' (FTS5 only). See
    -- rag/app/ingest/pipeline.py::_route_lane and PRODUCTION_TODO.md T14.
    -- lane_reason records which rule fired, so a mis-routed corpus is
    -- diagnosable and a wrong call is recoverable (rag/scripts/promote_lane.py)
    -- without a training set or a re-ingest.
    lane          TEXT NOT NULL DEFAULT 'dense',
    lane_reason   TEXT,
    source_url    TEXT,
    storage_ref   TEXT,
    corpus_id     TEXT,
    clerk_uid     TEXT,
    owner_id          TEXT,
    visibility        TEXT NOT NULL DEFAULT 'public',
    category          TEXT,
    storage_path      TEXT,
    original_filename TEXT,
    mime_type         TEXT,
    file_size         INTEGER NOT NULL DEFAULT 0,
    page_count    INTEGER NOT NULL DEFAULT 0,
    chunk_count   INTEGER NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'pending',
    error         TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chunks (
    chunk_id     TEXT PRIMARY KEY,
    document_id  TEXT NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,
    collection   TEXT NOT NULL,
    -- Denormalised from documents.owner_id, and deliberately so: this is the
    -- tenant boundary, and resolving it must be a single-table index scan. A
    -- join would put the security-critical lookup on the query path for every
    -- search, and correlated joins are exactly where filter bugs hide.
    -- NULL means the public legal corpus. Kept in step by a trigger (below).
    owner_id     TEXT,
    chunk_index  INTEGER NOT NULL,
    chunk_text   TEXT NOT NULL,
    page_number  INTEGER,
    -- The id this chunk's vector carries inside FAISS. Allocated from the
    -- public or private partition according to the document's visibility --
    -- see rag/core/vector_index.py for why the id space is split.
    --
    -- UNIQUE is not incidental: it is the last line of defence against
    -- allocate_faiss_ids ever handing out the same id twice (see that
    -- method's docstring, and PRODUCTION_TODO.md T2b). Do not drop it as
    -- redundant even after that method is made atomic -- it is what turns
    -- any future double-allocation bug into a loud IntegrityError on the
    -- losing writer instead of one document's vectors silently resolving to
    -- another's text.
    faiss_id     INTEGER NOT NULL UNIQUE,
    created_at   TEXT NOT NULL
);

-- Lexical (BM25) retrieval lane, alongside the dense FAISS index -- see
-- rag/app/retrieval/retriever.py::search_lexical and PRODUCTION_TODO.md T7.
-- Contentless external-content table: chunk_text is not duplicated, `chunks`
-- stays the single source of truth. Nothing writes to this table directly --
-- new/changed rows arrive through the sync triggers below, and rows that
-- predate this table arrive through SqliteStore._backfill_fts. Query it only
-- through SqliteStore.search_lexical, which is what applies the same tenant
-- scoping the dense path enforces.
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    chunk_text,
    content='chunks',
    content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- An API-submitted ingest job (see app/rag_routes.py and
-- rag/scripts/ingest_worker.py). The API writes the row and the file into
-- INBOX_ROOT and returns job_id immediately; only the ingest worker -- the
-- sole FAISS writer -- ever runs the pipeline and moves the row to a terminal
-- status. Distinct from `documents`: a job that turns out to be a duplicate
-- never gets a `documents` row of its own, but it still needs one here so a
-- caller polling this specific job_id gets a terminal answer instead of
-- polling forever.
CREATE TABLE IF NOT EXISTS ingest_jobs (
    job_id       TEXT PRIMARY KEY,
    status       TEXT NOT NULL DEFAULT 'queued',
    document_id  TEXT,
    filename     TEXT,
    result       TEXT,
    error        TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);

"""

# Applied only after any pending migration has widened the table -- an index on
# documents(owner_id) cannot be created against a v1 database that has no such
# column, and initialize() runs this script on every boot.
_SCHEMA_INDEXES = """
CREATE INDEX IF NOT EXISTS idx_documents_court        ON documents(court);
CREATE INDEX IF NOT EXISTS idx_documents_citation     ON documents(citation);
CREATE INDEX IF NOT EXISTS idx_documents_hash         ON documents(content_hash);
CREATE INDEX IF NOT EXISTS idx_documents_collection   ON documents(collection);
CREATE INDEX IF NOT EXISTS idx_documents_status       ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_corpus       ON documents(corpus_id, clerk_uid);
-- The private-document listing is always "this owner, newest first", optionally
-- narrowed to one category. Covering it here keeps a user with 2000 documents
-- off a full table scan of a corpus with millions.
CREATE INDEX IF NOT EXISTS idx_documents_owner        ON documents(owner_id, visibility, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_owner_cat    ON documents(owner_id, category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_visibility   ON documents(visibility);
-- Reporting the dense/lexical split (PRODUCTION_TODO.md T14 "Done when") is a
-- GROUP BY lane over the whole table; without an index that's a full scan at
-- every tier this system targets.
CREATE INDEX IF NOT EXISTS idx_documents_lane         ON documents(lane);
-- The tenant-isolation lookup: SELECT faiss_id FROM chunks WHERE owner_id = ?.
-- Covering (owner_id, faiss_id), so building an allow-list is an index-only
-- scan that never touches the chunk rows themselves -- which matters because
-- this runs on every private search.
CREATE INDEX IF NOT EXISTS idx_chunks_owner           ON chunks(owner_id, faiss_id);
CREATE INDEX IF NOT EXISTS idx_chunks_owner_coll      ON chunks(owner_id, collection, faiss_id);
CREATE INDEX IF NOT EXISTS idx_chunks_document        ON chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_collection      ON chunks(collection);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chunks_doc_index ON chunks(document_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_ingest_jobs_status ON ingest_jobs(status, created_at);
"""


# Applied on every boot, to fresh and migrated databases alike. Written as
# triggers rather than CHECK constraints because SQLite has no way to add a
# table-level CHECK to an existing table: the invariant below is what decides
# whether a row is readable by everyone or by exactly one person, so it must not
# be weaker on an upgraded database than on a new one.
# Two invariants the whole isolation model rests on, enforced by the database
# rather than by whichever code path happens to be writing:
#
#   1. A private chunk (owner_id set) carries a faiss_id from the private
#      partition, and a public chunk (owner_id NULL) one from the public range.
#      A private vector that landed in the public range would be returned by
#      every public search -- that is the leak, and it would be silent.
#   2. A chunk's owner matches its document's *effective* owner, which is
#      COALESCE(owner_id, clerk_uid). Two columns record ownership for
#      historical reasons: `owner_id` for documents this backend stores under
#      USERS_ROOT, `clerk_uid` for per-advocate corpus documents the Next app
#      stores itself and only indexes here. Either one means the row is somebody
#      private property, and both must therefore land in the private partition.
#
# Written as triggers because SQLite CHECK constraints cannot reference another
# table, and because these must hold for any writer, including a migration or a
# hand-run UPDATE during an incident.
_TRIGGERS = f"""
DROP TRIGGER IF EXISTS chunks_partition_insert;
DROP TRIGGER IF EXISTS chunks_partition_update;
DROP TRIGGER IF EXISTS documents_visibility_insert;
DROP TRIGGER IF EXISTS documents_visibility_update;
DROP TRIGGER IF EXISTS documents_private_immutable;
DROP TRIGGER IF EXISTS chunks_fts_insert;
DROP TRIGGER IF EXISTS chunks_fts_delete;
DROP TRIGGER IF EXISTS chunks_fts_update;

CREATE TRIGGER chunks_partition_insert
BEFORE INSERT ON chunks
FOR EACH ROW
WHEN (NEW.owner_id IS NULL AND NOT (NEW.faiss_id BETWEEN {PUBLIC_ID_MIN} AND {PRIVATE_ID_MIN - 1}))
  OR (NEW.owner_id IS NOT NULL AND NEW.faiss_id < {PRIVATE_ID_MIN})
  OR (NEW.owner_id IS NOT NULL AND TRIM(NEW.owner_id) = '')
  OR NEW.owner_id IS NOT (SELECT COALESCE(owner_id, clerk_uid)
                            FROM documents WHERE document_id = NEW.document_id)
BEGIN
    SELECT RAISE(ABORT, 'chunks: owner_id must match the document, and faiss_id must come from that owner''s id partition');
END;

CREATE TRIGGER chunks_partition_update
BEFORE UPDATE ON chunks
FOR EACH ROW
WHEN (NEW.owner_id IS NULL AND NOT (NEW.faiss_id BETWEEN {PUBLIC_ID_MIN} AND {PRIVATE_ID_MIN - 1}))
  OR (NEW.owner_id IS NOT NULL AND NEW.faiss_id < {PRIVATE_ID_MIN})
  OR NEW.owner_id IS NOT (SELECT COALESCE(owner_id, clerk_uid)
                            FROM documents WHERE document_id = NEW.document_id)
BEGIN
    SELECT RAISE(ABORT, 'chunks: owner_id must match the document, and faiss_id must come from that owner''s id partition');
END;

CREATE TRIGGER documents_visibility_insert
BEFORE INSERT ON documents
FOR EACH ROW
WHEN NEW.visibility NOT IN ('public', 'private')
  OR (NEW.visibility = 'private' AND (
        NEW.owner_id IS NULL OR TRIM(NEW.owner_id) = ''
     OR NEW.storage_path IS NULL OR TRIM(NEW.storage_path) = ''
     OR NEW.category IS NULL OR TRIM(NEW.category) = ''
     OR NEW.storage_path LIKE '/%' OR NEW.storage_path LIKE '%..%'))
  OR (NEW.visibility = 'public' AND NEW.owner_id IS NOT NULL)
BEGIN
    SELECT RAISE(ABORT, 'documents: a private document needs an owner, a category and a relative storage_path; a public one must have no owner');
END;

CREATE TRIGGER documents_visibility_update
BEFORE UPDATE ON documents
FOR EACH ROW
WHEN NEW.visibility NOT IN ('public', 'private')
  OR (NEW.visibility = 'private' AND (
        NEW.owner_id IS NULL OR TRIM(NEW.owner_id) = ''
     OR NEW.storage_path IS NULL OR TRIM(NEW.storage_path) = ''
     OR NEW.category IS NULL OR TRIM(NEW.category) = ''
     OR NEW.storage_path LIKE '/%' OR NEW.storage_path LIKE '%..%'))
  OR (NEW.visibility = 'public' AND NEW.owner_id IS NOT NULL)
BEGIN
    SELECT RAISE(ABORT, 'documents: a private document needs an owner, a category and a relative storage_path; a public one must have no owner');
END;

-- Re-parenting a private document to a different owner, or re-pointing it at a
-- different file, is never a legitimate update -- there is no product flow that
-- does either. Both are exactly what a compromised route or a bad migration
-- would do, so the database refuses them outright.
CREATE TRIGGER documents_private_immutable
BEFORE UPDATE ON documents
FOR EACH ROW
WHEN OLD.visibility = 'private'
 AND (NEW.owner_id IS NOT OLD.owner_id
   OR NEW.storage_path IS NOT OLD.storage_path
   OR NEW.visibility IS NOT OLD.visibility)
BEGIN
    SELECT RAISE(ABORT, 'documents: owner_id, storage_path and visibility of a private document are immutable');
END;

-- Keep chunks_fts in step with chunks. Standard external-content-table sync
-- triggers (https://sqlite.org/fts5.html#external_content_tables): a delete
-- is expressed as an INSERT of the special 'delete' command so FTS5 can
-- remove the old tokenisation, and an update is a delete-then-insert rather
-- than an in-place change.
--
-- chunk_text is zstd-compressed (PRODUCTION_TODO.md T16) but FTS5 must index
-- plain text -- it cannot tokenise a compressed blob, and it is contentless
-- for chunk_text (content='chunks'), so this is the only place that text
-- ever gets rebuilt from the compressed column. rag_zstd_decompress is a
-- Python function registered on every connection in SqliteStore._connect().
-- The typeof() guard is what lets one trigger definition serve a database
-- mid-migration: a row not yet reached by the compression backfill still
-- carries plain TEXT and must be passed through unchanged, not decompressed.
CREATE TRIGGER chunks_fts_insert
AFTER INSERT ON chunks
FOR EACH ROW
BEGIN
    INSERT INTO chunks_fts(rowid, chunk_text) VALUES (
        new.rowid,
        CASE WHEN typeof(new.chunk_text) = 'blob'
             THEN rag_zstd_decompress(new.chunk_text) ELSE new.chunk_text END
    );
END;

CREATE TRIGGER chunks_fts_delete
AFTER DELETE ON chunks
FOR EACH ROW
BEGIN
    INSERT INTO chunks_fts(chunks_fts, rowid, chunk_text) VALUES (
        'delete', old.rowid,
        CASE WHEN typeof(old.chunk_text) = 'blob'
             THEN rag_zstd_decompress(old.chunk_text) ELSE old.chunk_text END
    );
END;

CREATE TRIGGER chunks_fts_update
AFTER UPDATE ON chunks
FOR EACH ROW
BEGIN
    INSERT INTO chunks_fts(chunks_fts, rowid, chunk_text) VALUES (
        'delete', old.rowid,
        CASE WHEN typeof(old.chunk_text) = 'blob'
             THEN rag_zstd_decompress(old.chunk_text) ELSE old.chunk_text END
    );
    INSERT INTO chunks_fts(rowid, chunk_text) VALUES (
        new.rowid,
        CASE WHEN typeof(new.chunk_text) = 'blob'
             THEN rag_zstd_decompress(new.chunk_text) ELSE new.chunk_text END
    );
END;
"""

# Columns added by the v1 -> v2 migration, in the order they are applied. Each is
# nullable or carries a non-NULL default, which is what SQLite requires of
# ALTER TABLE ADD COLUMN.
_V2_COLUMNS: tuple[tuple[str, str], ...] = (
    ("owner_id", "TEXT"),
    ("visibility", "TEXT NOT NULL DEFAULT 'public'"),
    ("category", "TEXT"),
    ("storage_path", "TEXT"),
    ("original_filename", "TEXT"),
    ("mime_type", "TEXT"),
    ("file_size", "INTEGER NOT NULL DEFAULT 0"),
)


def _migrate_v1_to_v2(conn: sqlite3.Connection) -> None:
    """Add the ownership/visibility columns and backfill the existing corpus.

    Every row that exists at v1 is public legal corpus -- private user documents
    lived in Cloudflare R2 and had no row here at all -- so the backfill is
    unambiguous: ``visibility='public'``, ``owner_id=NULL``, and ``storage_path``
    copied from ``file_path`` so both names address the same file from day one.

    ``file_path`` is kept rather than dropped. The ingest pipeline and the
    retrieval join still write and read it, and rewriting those in the same
    change as a schema migration would mean a failed upgrade could not be rolled
    back by deploying the previous build.
    """
    existing = {row["name"] for row in conn.execute("PRAGMA table_info(documents)")}
    for column, definition in _V2_COLUMNS:
        if column not in existing:
            conn.execute(f"ALTER TABLE documents ADD COLUMN {column} {definition}")

    conn.execute(
        "UPDATE documents SET visibility = 'public' "
        "WHERE visibility IS NULL OR TRIM(visibility) = ''"
    )
    conn.execute(
        "UPDATE documents SET storage_path = file_path "
        "WHERE storage_path IS NULL AND file_path IS NOT NULL"
    )
    conn.execute(
        "UPDATE documents SET mime_type = 'application/pdf' "
        "WHERE mime_type IS NULL AND file_path LIKE '%.pdf'"
    )


def _migrate_v2_to_v3(conn: "sqlite3.Connection") -> None:
    """Rename ``embedding_id`` to ``faiss_id`` and give chunks their own owner.

    Both changes serve the same end: the tenant allow-list becomes a single-table
    index scan instead of a join against documents.

    Existing rows are all public corpus (private user documents were not indexed
    before this version), so ``owner_id`` backfills to NULL and the ids they
    already hold are inside the public partition by construction -- they were
    allocated from 1 upwards. The counter is renamed to match.
    """
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(chunks)")}

    if "faiss_id" not in columns and "embedding_id" in columns:
        conn.execute("ALTER TABLE chunks RENAME COLUMN embedding_id TO faiss_id")
    if "owner_id" not in columns:
        conn.execute("ALTER TABLE chunks ADD COLUMN owner_id TEXT")

    # Backfill from documents for anything that already had an owner, so a
    # database written by a build that indexed private documents converges too.
    conn.execute(
        """
        UPDATE chunks
           SET owner_id = (SELECT COALESCE(d.owner_id, d.clerk_uid) FROM documents d
                            WHERE d.document_id = chunks.document_id)
         WHERE owner_id IS NULL
        """
    )

    # Split the single id counter into the two partition counters.
    row = conn.execute("SELECT value FROM meta WHERE key = 'next_embedding_id'").fetchone()
    if row is not None:
        conn.execute(
            "INSERT INTO meta(key, value) VALUES('next_public_faiss_id', ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (row["value"],),
        )
        conn.execute("DELETE FROM meta WHERE key = 'next_embedding_id'")

    # Any pre-existing private chunk holds a public-range id and has to be
    # re-indexed; it cannot simply be renumbered, because the vector in FAISS
    # still carries the old id. Flagging it is enough -- rebuild_index.py
    # reallocates from the right partition on the next run.
    stale = conn.execute(
        "SELECT COUNT(*) FROM chunks WHERE owner_id IS NOT NULL AND faiss_id < ?",
        (PRIVATE_ID_MIN,),
    ).fetchone()[0]
    if stale:
        logger.warning(
            "%d private chunk(s) still hold public-partition ids. Run "
            "rag/scripts/rebuild_index.py to reallocate them before serving "
            "private search.", stale,
        )


def _migrate_v3_to_v4(conn: "sqlite3.Connection") -> None:
    """Add the dense/lexical lane columns (PRODUCTION_TODO.md T14).

    Every row that exists at v3 was ingested before the lane split existed, so
    it was embedded unconditionally -- 'dense' with no recorded reason is the
    only truthful backfill.
    """
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(documents)")}
    if "lane" not in columns:
        conn.execute("ALTER TABLE documents ADD COLUMN lane TEXT NOT NULL DEFAULT 'dense'")
    if "lane_reason" not in columns:
        conn.execute("ALTER TABLE documents ADD COLUMN lane_reason TEXT")


_MIGRATIONS: dict[int, "Callable[[sqlite3.Connection], None]"] = {
    1: _migrate_v1_to_v2,
    2: _migrate_v2_to_v3,
    3: _migrate_v3_to_v4,
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass(frozen=True)
class DocumentRecord:
    """One ingested document."""

    document_id: str
    collection: str
    court: str | None
    citation: str | None
    title: str | None
    file_path: str | None
    content_hash: str | None
    document_type: str | None
    doc_date: str | None
    lane: str
    """'dense' (embedded + FTS5) or 'lexical' (FTS5 only). See T14."""
    lane_reason: str | None
    """Which routing rule fired -- e.g. 'court:sci', 'pages', 'phrase:held',
    'length', 'default', or 'promoted:<previous reason>'."""
    source_url: str | None
    storage_ref: str | None
    corpus_id: str | None
    clerk_uid: str | None
    owner_id: str | None
    """NULL for the public legal corpus. Required for a private user document --
    it is the value the download route compares the caller against."""
    visibility: str
    category: str | None
    storage_path: str | None
    """Relative to LEGAL_CORPUS_ROOT or USERS_ROOT depending on ``visibility``.
    Never leaves the backend: the API returns document ids, not paths."""
    original_filename: str | None
    mime_type: str | None
    file_size: int
    page_count: int
    chunk_count: int
    status: str
    error: str | None
    created_at: str
    updated_at: str

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> "DocumentRecord":
        return cls(**{f: row[f] for f in cls.__dataclass_fields__})


@dataclass(frozen=True)
class ChunkRecord:
    """A chunk joined to its document -- the shape a search result needs."""

    chunk_id: str
    document_id: str
    chunk_index: int
    chunk_text: str
    page_number: int | None
    faiss_id: int
    title: str | None
    court: str | None
    citation: str | None
    document_type: str | None
    doc_date: str | None
    source_url: str | None
    storage_ref: str | None
    file_path: str | None

    @classmethod
    def from_row(
        cls, row: sqlite3.Row, *, decode_chunk_text: "Callable[[Any], str] | None" = None
    ) -> "ChunkRecord":
        """``decode_chunk_text`` un-compresses ``row['chunk_text']`` (T16) --
        pass :meth:`SqliteStore.decode_chunk_text` from a store, or leave it
        unset only where the caller already guarantees plain text (tests
        constructing a row by hand)."""
        data = {f: row[f] for f in cls.__dataclass_fields__}
        if decode_chunk_text is not None:
            data["chunk_text"] = decode_chunk_text(data["chunk_text"])
        return cls(**data)


_CHUNK_SELECT = """
SELECT c.chunk_id, c.document_id, c.chunk_index, c.chunk_text, c.page_number,
       c.faiss_id, d.title, d.court, d.citation, d.document_type,
       d.doc_date, d.source_url, d.storage_ref, d.file_path
  FROM chunks c
  JOIN documents d ON d.document_id = c.document_id
"""


class SqliteStore:
    """Thread-safe metadata store.

    FastAPI runs blocking handlers on a thread pool, so every thread gets its
    own connection (SQLite connections are not shareable across threads) while
    WAL mode lets those readers run concurrently with the single ingest writer.
    """

    def __init__(
        self,
        path: Path | str,
        busy_timeout_ms: int = 15_000,
        *,
        zstd_level: int = 19,
        zstd_dict_size: int = 112_640,
        page_size: int = 8192,
        mmap_size_mb: int = 2048,
        cache_size_mb: int = 64,
    ) -> None:
        self._path = Path(path)
        self._busy_timeout_ms = busy_timeout_ms
        # PRODUCTION_TODO.md T18. Only `page_size` has the "must be set before
        # anything else touches this connection" constraint -- see _connect.
        self._page_size = page_size
        self._mmap_size_mb = mmap_size_mb
        self._cache_size_mb = cache_size_mb
        self._local = threading.local()
        # Serialises id allocation and multi-statement writes. SQLite would
        # serialise them anyway; taking the lock here turns a would-be
        # SQLITE_BUSY under load into a short wait.
        self._write_lock = threading.Lock()
        # chunk_text compression (T16). Read by every thread's connection via
        # the closures below, but only ever written once, by
        # _ensure_zstd_dictionary() during this instance's own initialize() --
        # see that method for why a later, concurrent write of the same value
        # from another process is harmless rather than a race.
        self._zstd_level = zstd_level
        self._zstd_dict_size = zstd_dict_size
        self._zstd_dict: "zstd.ZstdCompressionDict | None" = None

    # ─── Connection handling ─────────────────────────────────────────────────

    @property
    def path(self) -> Path:
        return self._path

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._path, timeout=self._busy_timeout_ms / 1000)
        conn.row_factory = sqlite3.Row
        # PRODUCTION_TODO.md T18: page_size MUST be the first pragma issued on
        # a connection, before journal_mode -- SQLite only honours a page_size
        # change on a database that has no tables yet *and* is not already in
        # WAL mode; once either is true it is silently ignored (not an error)
        # for the rest of this connection's life. On a brand-new database (the
        # only case where this has any effect) this is what makes the very
        # first CREATE TABLE in initialize() land at the configured page size
        # instead of SQLite's own 4096 default. On an existing database this
        # is a costless no-op -- see rag/scripts/vacuum_page_size.py for how
        # to actually change the page size of one that already has data.
        conn.execute(f"PRAGMA page_size={self._page_size}")
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute(f"PRAGMA busy_timeout={self._busy_timeout_ms}")
        # mmap_size: pages read straight from the OS's mapping of the file
        # instead of copied into SQLite's own pager cache first -- and that
        # mapping is backed by the shared OS page cache, so this is safe to
        # set generously (megabytes-to-gigabytes) even with one connection per
        # thread; it does not multiply resident memory by thread count the
        # way cache_size below would.
        conn.execute(f"PRAGMA mmap_size={self._mmap_size_mb * 1024 * 1024}")
        # cache_size: SQLite's own *private* pager cache, real heap memory,
        # one allocation per connection -- not shared like mmap_size above.
        # Negative means kibibytes (the documented way to size this pragma by
        # memory rather than by page count, so it stays correct regardless of
        # page_size). Kept modest by default for exactly the reason mmap_size
        # is not: this store is one connection per thread.
        conn.execute(f"PRAGMA cache_size=-{self._cache_size_mb * 1024}")
        # Backs the chunks_fts sync triggers -- see their comment in
        # _TRIGGERS. A bound method, not a lambda, so it always reads
        # self._zstd_dict fresh rather than whatever it was at registration
        # time (None, on every connection's first use, until
        # _ensure_zstd_dictionary runs during this instance's initialize()).
        conn.create_function("rag_zstd_decompress", 1, self.decode_chunk_text)
        return conn

    @property
    def connection(self) -> sqlite3.Connection:
        conn = getattr(self._local, "conn", None)
        if conn is None:
            conn = self._connect()
            self._local.conn = conn
        return conn

    @contextmanager
    def _write(self) -> Iterator[sqlite3.Connection]:
        with self._write_lock:
            conn = self.connection
            with conn:
                yield conn

    def close(self) -> None:
        conn = getattr(self._local, "conn", None)
        if conn is not None:
            conn.close()
            self._local.conn = None

    # ─── Lifecycle ───────────────────────────────────────────────────────────

    def initialize(self) -> None:
        """Create or upgrade the schema. Idempotent, safe on every boot."""
        if sqlite3.sqlite_version_info < (3, 35, 0):
            # allocate_faiss_ids relies on UPDATE ... RETURNING (SQLite 3.35+)
            # to make id allocation atomic across processes -- see
            # PRODUCTION_TODO.md T2b. Failing loudly here beats a confusing
            # sqlite3.OperationalError the first time a document is ingested.
            raise RuntimeError(
                f"SQLite {sqlite3.sqlite_version} is too old (need 3.35+ for "
                "UPDATE ... RETURNING, used by allocate_faiss_ids). Upgrade the "
                "system sqlite3 library."
            )
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with self._write() as conn:
            existed = bool(
                conn.execute(
                    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='documents'"
                ).fetchone()
            )
            try:
                conn.executescript(_SCHEMA_TABLES)
            except sqlite3.OperationalError as exc:
                if "no such module: fts5" in str(exc):
                    raise RuntimeError(
                        "This SQLite build has no FTS5 module compiled in, needed for "
                        "lexical search (search_lexical / PRODUCTION_TODO.md T7). Rebuild "
                        "or upgrade the system sqlite3 library with FTS5 enabled."
                    ) from exc
                raise
            # A database that predates the meta table is at v1 by definition; a
            # brand-new one is created at the current version.
            conn.execute(
                "INSERT OR IGNORE INTO meta(key, value) VALUES('schema_version', ?)",
                (str(1 if existed else SCHEMA_VERSION),),
            )

        stored = int(self.get_meta("schema_version") or SCHEMA_VERSION)
        if stored > SCHEMA_VERSION:
            raise RuntimeError(
                f"SQLite schema version {stored} is newer than this build supports "
                f"({SCHEMA_VERSION}). Deploy the matching code or restore a backup."
            )
        if stored < SCHEMA_VERSION:
            stored = self._migrate(stored)

        # Both after the migration, so neither is built against a table that is
        # still missing the columns it references.
        with self._write() as conn:
            conn.executescript(_SCHEMA_INDEXES)
            conn.executescript(_TRIGGERS)

        logger.info("SQLite ready at %s (schema v%d)", self._path, stored)
        # Order matters: FTS must be caught up on plain-text rows before the
        # dictionary samples them and the compression backfill rewrites them,
        # or a duplicate rowid would land in chunks_fts twice (once from a
        # trigger, once from this scan) instead of once. The dictionary must
        # be resolved before compression starts, since compression needs it,
        # and training needs rows that are still plain text to sample from.
        self._backfill_fts()
        self._ensure_zstd_dictionary()
        self._backfill_chunk_compression()

    def _backfill_fts(self, batch_size: int = 2000) -> None:
        """Populate ``chunks_fts`` for rows written before it existed.

        The sync triggers only cover rows written *after* ``chunks_fts`` was
        created, so a database that carried chunks before this feature landed
        needs its lexical index built from what is already there -- the
        "backfill the FTS index for existing rows in a migration step,
        resumably" half of PRODUCTION_TODO.md T7.

        Batched and checkpointed via a meta key (the highest chunk ``rowid``
        already indexed) rather than one large transaction, so a crash or a
        restart mid-backfill resumes from the last committed batch instead of
        redoing the whole table -- the same "persisted watermark" shape
        :meth:`allocate_faiss_ids` uses for its counters. Idempotent and cheap
        once caught up: a single indexed ``rowid > ?`` scan that returns
        nothing.

        Runs on every :meth:`initialize`, not only right after a migration --
        the ingest worker and the API each call it at their own startup, and
        either can be first to catch a corpus that predates this feature.
        """
        while True:
            last = int(self.get_meta("fts_backfill_rowid") or 0)
            try:
                with self._write() as conn:
                    rows = conn.execute(
                        "SELECT rowid, chunk_text FROM chunks WHERE rowid > ? "
                        "ORDER BY rowid LIMIT ?",
                        (last, batch_size),
                    ).fetchall()
                    if not rows:
                        return
                    conn.executemany(
                        "INSERT INTO chunks_fts(rowid, chunk_text) VALUES (?, ?)",
                        # decode_chunk_text: a row here may already be a T16
                        # compressed blob (a database upgraded past this
                        # feature already, then restarted before catching up
                        # on some pre-chunks_fts historical rows) or still
                        # plain text (never touched by either backfill yet).
                        # It handles both.
                        [(r["rowid"], self.decode_chunk_text(r["chunk_text"])) for r in rows],
                    )
                    conn.execute(
                        "INSERT INTO meta(key, value) VALUES ('fts_backfill_rowid', ?) "
                        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                        (str(rows[-1]["rowid"]),),
                    )
            except sqlite3.DatabaseError:
                # Another process's backfill (API and ingest worker both call
                # initialize() at their own startup) committed this same batch
                # first, so the rowid range we just tried to insert now
                # collides with what it already wrote. Not a real failure --
                # re-read the watermark it just advanced and carry on from
                # there instead of crashing this process's boot.
                logger.info("FTS backfill batch already applied by another process; resuming")
                continue
            if len(rows) < batch_size:
                return

    def _ensure_zstd_dictionary(self) -> None:
        """Train the chunk_text compression dictionary, once, ever.

        Runs before :meth:`_backfill_chunk_compression` so it can sample rows
        that are still plain text. Only the *first* process to reach this on
        a given database trains anything; every later boot (this process
        restarting, or the other of the API/ingest pair starting up) just
        loads whatever got persisted, via ``_ZSTD_DICT_TRAINED_META_KEY`` --
        training is neither cheap nor idempotent-by-content (it samples up to
        ``_ZSTD_DICT_SAMPLE_LIMIT`` rows), so it must not repeat on every
        restart the way the backfills below deliberately do.

        Two processes can still race to be "first" (API and ingest worker
        both call ``initialize()`` at their own startup). That is harmless
        here specifically because the sample query has no randomness --
        plain ``LIMIT``, no ``ORDER BY random()`` -- so two processes reading
        the same still-untouched rows train byte-identical dictionaries
        (zstd's dictionary trainer is deterministic for a given input) and
        their writes to ``meta`` simply agree instead of conflicting.
        """
        if self.get_meta(_ZSTD_DICT_TRAINED_META_KEY) is not None:
            stored = self.get_meta(_ZSTD_DICT_META_KEY)
            self._zstd_dict = zstd.ZstdCompressionDict(base64.b64decode(stored)) if stored else None
            return

        samples = [
            row["chunk_text"].encode("utf-8")
            for row in self.connection.execute(
                "SELECT chunk_text FROM chunks WHERE typeof(chunk_text) = 'text' LIMIT ?",
                (_ZSTD_DICT_SAMPLE_LIMIT,),
            )
        ]
        if not samples:
            # A database that has never held a single plain-text chunk --
            # most commonly a brand-new install, where initialize() runs
            # before the first document is ever ingested. Do NOT lock in
            # "no dictionary" permanently here: unlike the >0-but-too-few
            # case below, there is nothing yet to have made a real decision
            # about. Leave the flags unset so a later call (this process's
            # own initialize() is the only one that re-runs it, but a fresh
            # process against a since-populated database will too) gets a
            # real chance to train once real content exists.
            return

        trained: bytes | None = None
        if len(samples) >= _ZSTD_DICT_MIN_SAMPLES:
            try:
                trained = zstd.train_dictionary(self._zstd_dict_size, samples).as_bytes()
            except zstd.ZstdError as exc:
                # Too little variety in the sample, or too little data for
                # the requested dict size. Compressing without a dictionary
                # still works -- it just gets less of the ratio T16 asks
                # for -- so this is a degraded mode, not a failure.
                logger.warning(
                    "zstd dictionary training failed (%s); chunk_text will be "
                    "compressed without a dictionary", exc,
                )
        else:
            logger.info(
                "only %d chunk(s) to sample (need %d); chunk_text will be "
                "compressed without a dictionary until a rebuild retrains it",
                len(samples), _ZSTD_DICT_MIN_SAMPLES,
            )

        with self._write() as conn:
            conn.execute(
                "INSERT INTO meta(key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (_ZSTD_DICT_META_KEY, base64.b64encode(trained).decode("ascii") if trained else ""),
            )
            conn.execute(
                "INSERT INTO meta(key, value) VALUES (?, '1') "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (_ZSTD_DICT_TRAINED_META_KEY,),
            )
        self._zstd_dict = zstd.ZstdCompressionDict(trained) if trained else None

    def _backfill_chunk_compression(self, batch_size: int = 2000) -> None:
        """Compress every ``chunk_text`` row still stored as plain text.

        Same "batched, watermarked, resumable" shape as :meth:`_backfill_fts`
        -- a crash or restart mid-backfill picks up from the last committed
        batch. Differs from it in one way that matters at scale: once every
        row is compressed, this method must never scan the table again on a
        later boot just to confirm that -- at tier 3's 450M chunks that scan
        alone would dominate startup forever. ``_CHUNK_COMPRESSION_DONE_META_KEY``
        is that "never again" marker, set the moment a scan past the
        watermark comes back empty.

        Each UPDATE runs through ``chunks_fts_update`` (see ``_TRIGGERS``),
        which re-derives the FTS entry from the *decompressed* new value --
        so the lexical index is unaffected by this method ever running, or
        running twice.
        """
        if self.get_meta(_CHUNK_COMPRESSION_DONE_META_KEY) is not None:
            return
        while True:
            last = int(self.get_meta(_CHUNK_COMPRESSION_ROWID_META_KEY) or 0)
            try:
                with self._write() as conn:
                    rows = conn.execute(
                        "SELECT rowid, chunk_text FROM chunks "
                        "WHERE rowid > ? AND typeof(chunk_text) = 'text' "
                        "ORDER BY rowid LIMIT ?",
                        (last, batch_size),
                    ).fetchall()
                    if not rows:
                        if last == 0 and conn.execute(
                            "SELECT 1 FROM chunks LIMIT 1"
                        ).fetchone() is None:
                            # Never made any progress, and the table has
                            # never held a single row (any type) either --
                            # most commonly a brand-new install running its
                            # very first initialize() before any document
                            # exists. Don't lock in "done" here: a database
                            # that predates T16 needs this same empty-scan
                            # result to mean "confirmed fully migrated", but
                            # that confirmation is only valid once the table
                            # has actually been observed to hold data.
                            return
                        conn.execute(
                            "INSERT INTO meta(key, value) VALUES (?, '1') "
                            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                            (_CHUNK_COMPRESSION_DONE_META_KEY,),
                        )
                        return
                    conn.executemany(
                        "UPDATE chunks SET chunk_text = ? WHERE rowid = ?",
                        [
                            (self._compress_chunk_text(r["chunk_text"]), r["rowid"])
                            for r in rows
                        ],
                    )
                    conn.execute(
                        "INSERT INTO meta(key, value) VALUES (?, ?) "
                        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                        (_CHUNK_COMPRESSION_ROWID_META_KEY, str(rows[-1]["rowid"])),
                    )
            except sqlite3.DatabaseError:
                # Same race as _backfill_fts: another process (API vs. ingest
                # worker, both migrating at their own startup) already
                # compressed and committed this batch.
                logger.info(
                    "chunk-text compression batch already applied by another "
                    "process; resuming"
                )
                continue

    def _compress_chunk_text(self, text: str) -> bytes:
        return _zstd_compress_text(text, self._zstd_level, self._zstd_dict)

    def decode_chunk_text(self, raw: "bytes | str") -> str:
        """Read back a ``chunks.chunk_text`` value, compressed or not.

        Public (unlike ``_compress_chunk_text``) because it has callers
        outside this class: ``rag/scripts/build_index.py`` and
        ``rag/scripts/rebuild_index.py`` both bulk-scan ``chunks`` directly
        with their own pagination for embedding, rather than going through
        :meth:`chunks_by_faiss_ids`, and it is also what
        ``rag_zstd_decompress`` (the SQL function backing the FTS sync
        triggers -- see ``_TRIGGERS``) is bound to.

        A plain ``str`` passes through unchanged -- a legacy row the
        compression backfill has not reached yet, or a value a test
        inserted by hand.
        """
        if isinstance(raw, str):
            return raw
        return _zstd_decompress_text(raw, self._zstd_dict)

    # ─── Migrations ──────────────────────────────────────────────────────────

    def _migrate(self, from_version: int) -> int:
        """Bring an older database up to :data:`SCHEMA_VERSION`.

        Each step is its own transaction that ends by writing the new version, so
        an interrupted upgrade resumes at the step it died on rather than
        re-running one that already completed.
        """
        version = from_version
        while version < SCHEMA_VERSION:
            step = _MIGRATIONS.get(version)
            if step is None:
                raise RuntimeError(
                    f"No migration from schema v{version} to v{version + 1}. "
                    f"Restore a backup taken with a supported build."
                )
            logger.info("Migrating SQLite schema v%d -> v%d", version, version + 1)
            with self._write() as conn:
                step(conn)
                conn.execute(
                    "INSERT INTO meta(key, value) VALUES('schema_version', ?) "
                    "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    (str(version + 1),),
                )
            version += 1
        return version

    def verify_integrity(self) -> None:
        """Fail fast on a corrupt database rather than mid-request."""
        result = self.connection.execute("PRAGMA quick_check").fetchone()[0]
        if result != "ok":
            raise RuntimeError(f"SQLite integrity check failed for {self._path}: {result}")

    def get_meta(self, key: str) -> str | None:
        row = self.connection.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else None

    def set_meta(self, key: str, value: str) -> None:
        with self._write() as conn:
            conn.execute(
                "INSERT INTO meta(key, value) VALUES(?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, value),
            )

    # ─── FAISS id allocation ─────────────────────────────────────────────────

    def allocate_faiss_ids(self, count: int, *, private: bool = False) -> range:
        """Reserve ``count`` never-before-used FAISS ids from one partition.

        Two counters, not one. Public ids come from ``[PUBLIC_ID_MIN, ...)`` and
        private ids from ``[PRIVATE_ID_MIN, ...)``, which is what lets a public
        search be an ``IDSelectorRange`` instead of a materialised allow-list --
        see rag/core/vector_index.py.

        Both counters only ever move forward. Ids are never reused, even after
        their rows are deleted: a vector that outlives its row must be able to
        fail to resolve, never to resolve to somebody else's chunk.

        Every statement below is a single atomic ``UPDATE`` (or ``INSERT OR
        IGNORE``), never a separate read followed by a write. That matters
        across *processes*, not just threads: SQLite's default deferred
        isolation runs a bare ``SELECT`` outside any transaction, so two
        processes reading the same counter and then each writing back
        ``value + count`` can both read the same stale value and hand out the
        same range -- reproduced with two real processes, see
        PRODUCTION_TODO.md T2b. ``self._write_lock`` above only ever
        serialised this within one process.
        """
        if count <= 0:
            return range(0)

        key = "next_private_faiss_id" if private else "next_public_faiss_id"
        floor = PRIVATE_ID_MIN if private else PUBLIC_ID_MIN
        ceiling = _PRIVATE_ID_CEILING if private else PRIVATE_ID_MIN

        with self._write() as conn:
            # Seed the counter on its very first use -- atomically a no-op if
            # another process already has.
            conn.execute(
                "INSERT OR IGNORE INTO meta(key, value) VALUES (?, ?)", (key, str(floor))
            )
            # A counter restored from an older backup, or one that somehow fell
            # below its partition, would hand out ids in the wrong range -- which
            # would put private vectors inside the public range and serve them to
            # everyone. Clamp rather than trust. Guarded in the WHERE clause so
            # two processes racing this either both find nothing to do or agree
            # on the same outcome -- neither can regress what the other just set.
            clamped = conn.execute(
                "UPDATE meta SET value = ? WHERE key = ? AND CAST(value AS INTEGER) < ? "
                "RETURNING 1",
                (str(floor), key, floor),
            ).fetchone()
            if clamped is not None:
                logger.warning("%s was below its partition floor %d; clamped to it", key, floor)

            # The allocation: increment and report the pre-increment value in
            # one statement, and only when the result still fits under the
            # ceiling -- so an exhausted call touches nothing, matching the
            # old check-before-write behaviour rather than burning a range on
            # every failed attempt.
            row = conn.execute(
                "UPDATE meta SET value = CAST(value AS INTEGER) + ? WHERE key = ? "
                "AND CAST(value AS INTEGER) + ? < ? "
                "RETURNING CAST(value AS INTEGER) - ? AS start",
                (count, key, count, ceiling, count),
            ).fetchone()
            if row is None:
                kind = "Private" if private else "Public"
                raise RuntimeError(f"{kind} FAISS id partition is exhausted")
            start = int(row["start"])

        return range(start, start + count)

    # ─── Documents ───────────────────────────────────────────────────────────

    def upsert_document(
        self,
        *,
        document_id: str,
        collection: str,
        court: str | None = None,
        citation: str | None = None,
        title: str | None = None,
        file_path: str | None = None,
        content_hash: str | None = None,
        document_type: str | None = None,
        doc_date: str | None = None,
        lane: str = "dense",
        lane_reason: str | None = None,
        source_url: str | None = None,
        storage_ref: str | None = None,
        corpus_id: str | None = None,
        clerk_uid: str | None = None,
        page_count: int = 0,
        status: str = STATUS_PENDING,
    ) -> None:
        """Insert a document, or update the mutable columns of an existing one.

        ``created_at`` is preserved on update so a resumed ingest does not
        rewrite when the document first arrived.

        ``lane``/``lane_reason`` are written as given, not ``COALESCE``d like
        the identity fields above: the pipeline's first call (before routing
        runs) leaves them at the 'dense' default, and its second call (once
        :func:`rag.app.ingest.pipeline._route_lane` has decided) always carries
        the real, current answer -- there is no earlier value worth preserving
        over it, unlike a court or citation that a caller might genuinely omit.
        """
        now = _now()
        with self._write() as conn:
            conn.execute(
                """
                INSERT INTO documents (
                    document_id, collection, court, citation, title, file_path,
                    storage_path, visibility,
                    content_hash, document_type, doc_date, lane, lane_reason,
                    source_url, storage_ref,
                    corpus_id, clerk_uid, page_count, status, created_at, updated_at
                ) VALUES (?,?,?,?,?,?,?,'public',?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(document_id) DO UPDATE SET
                    collection    = excluded.collection,
                    court         = COALESCE(excluded.court, documents.court),
                    citation      = COALESCE(excluded.citation, documents.citation),
                    title         = COALESCE(excluded.title, documents.title),
                    file_path     = COALESCE(excluded.file_path, documents.file_path),
                    -- Kept identical to file_path for corpus rows so the two
                    -- names never drift; the migration backfilled the same way.
                    storage_path  = COALESCE(excluded.storage_path, documents.storage_path),
                    content_hash  = COALESCE(excluded.content_hash, documents.content_hash),
                    document_type = COALESCE(excluded.document_type, documents.document_type),
                    doc_date      = COALESCE(excluded.doc_date, documents.doc_date),
                    lane          = excluded.lane,
                    lane_reason   = excluded.lane_reason,
                    source_url    = COALESCE(excluded.source_url, documents.source_url),
                    storage_ref   = COALESCE(excluded.storage_ref, documents.storage_ref),
                    corpus_id     = COALESCE(excluded.corpus_id, documents.corpus_id),
                    clerk_uid     = COALESCE(excluded.clerk_uid, documents.clerk_uid),
                    page_count    = MAX(excluded.page_count, documents.page_count),
                    status        = excluded.status,
                    updated_at    = excluded.updated_at
                """,
                (
                    document_id, collection, court, citation, title, file_path,
                    file_path,
                    content_hash, document_type, doc_date, lane, lane_reason,
                    source_url, storage_ref,
                    corpus_id, clerk_uid, page_count, status, now, now,
                ),
            )

    def set_status(self, document_id: str, status: str, error: str | None = None) -> None:
        with self._write() as conn:
            conn.execute(
                "UPDATE documents SET status = ?, error = ?, updated_at = ? WHERE document_id = ?",
                (status, error, _now(), document_id),
            )

    def get_document(self, document_id: str) -> DocumentRecord | None:
        row = self.connection.execute(
            "SELECT * FROM documents WHERE document_id = ?", (document_id,)
        ).fetchone()
        return DocumentRecord.from_row(row) if row else None

    def get_document_by_hash(self, content_hash: str) -> DocumentRecord | None:
        row = self.connection.execute(
            "SELECT * FROM documents WHERE content_hash = ? ORDER BY created_at LIMIT 1",
            (content_hash,),
        ).fetchone()
        return DocumentRecord.from_row(row) if row else None

    def incomplete_documents(self, collection: str | None = None) -> list[DocumentRecord]:
        """Documents that never reached ``complete`` -- the resume worklist."""
        sql = "SELECT * FROM documents WHERE status NOT IN ({})".format(
            ",".join("?" for _ in _TERMINAL_STATUSES)
        )
        params: list[Any] = list(_TERMINAL_STATUSES)
        if collection:
            sql += " AND collection = ?"
            params.append(collection)
        sql += " ORDER BY created_at"
        return [DocumentRecord.from_row(r) for r in self.connection.execute(sql, params)]

    # ─── Public corpus ───────────────────────────────────────────────────────

    def get_public_corpus_document(self, document_id: str) -> DocumentRecord | None:
        """A document only if it is part of the *public* legal corpus.

        Three conditions, all in SQL rather than in the caller, because this is
        the query that decides what any authenticated user may download:

        * ``visibility = 'public'`` -- not a private user document.
        * ``owner_id IS NULL`` -- redundant with the above given the triggers,
          and kept so that a row that somehow violates them still fails closed.
        * ``corpus_id IS NULL AND clerk_uid IS NULL`` -- a document ingested into
          somebody's *private research corpus* physically lives in the corpus
          tree, but it is theirs, not the public archive's. Serving it here would
          be the exact leak this endpoint exists to avoid.
        """
        row = self.connection.execute(
            """
            SELECT * FROM documents
             WHERE document_id = ?
               AND visibility = 'public'
               AND owner_id IS NULL
               AND corpus_id IS NULL
               AND clerk_uid IS NULL
            """,
            (document_id,),
        ).fetchone()
        return DocumentRecord.from_row(row) if row else None

    # ─── Private user documents ──────────────────────────────────────────────

    def insert_user_document(
        self,
        *,
        document_id: str,
        owner_id: str,
        category: str,
        storage_path: str,
        original_filename: str,
        mime_type: str,
        file_size: int,
        content_hash: str | None = None,
        title: str | None = None,
        collection: str = "user_documents",
    ) -> DocumentRecord:
        """Record one private document. Fails rather than overwriting.

        A plain INSERT, never an upsert: the id is freshly minted per upload, so
        a conflict means either a UUID collision or a replayed request, and
        silently updating the row would repoint an existing document at a
        different file.
        """
        if not owner_id or not owner_id.strip():
            raise ValueError("owner_id is required for a private document")
        if not storage_path or storage_path.startswith("/") or ".." in storage_path:
            raise ValueError(f"storage_path must be a relative path: {storage_path!r}")

        now = _now()
        with self._write() as conn:
            conn.execute(
                """
                INSERT INTO documents (
                    document_id, collection, visibility, owner_id, category,
                    storage_path, original_filename, mime_type, file_size,
                    content_hash, title, status, created_at, updated_at
                ) VALUES (?,?,'private',?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    document_id, collection, owner_id.strip(), category,
                    storage_path, original_filename, mime_type, file_size,
                    content_hash, title, STATUS_COMPLETE, now, now,
                ),
            )
        record = self.get_document(document_id)
        assert record is not None  # just inserted, inside the same connection
        return record

    def get_owned_document(self, document_id: str, owner_id: str) -> DocumentRecord | None:
        """A private document, only if ``owner_id`` owns it.

        The ownership predicate is in the WHERE clause on purpose. Fetching by id
        and comparing in Python is one forgotten ``if`` away from serving another
        user's file; this way the only row the query can ever return is one the
        caller is entitled to.
        """
        if not owner_id or not owner_id.strip():
            return None
        row = self.connection.execute(
            """
            SELECT * FROM documents
             WHERE document_id = ?
               AND visibility = 'private'
               AND owner_id = ?
            """,
            (document_id, owner_id.strip()),
        ).fetchone()
        return DocumentRecord.from_row(row) if row else None

    def private_document_exists(self, document_id: str) -> bool:
        """Whether *any* owner has a private document under this id.

        Only used to tell "not yours" apart from "no such thing" when shaping the
        error, never to return content.
        """
        row = self.connection.execute(
            "SELECT 1 FROM documents WHERE document_id = ? AND visibility = 'private'",
            (document_id,),
        ).fetchone()
        return row is not None

    def list_user_documents(
        self,
        owner_id: str,
        *,
        category: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[DocumentRecord]:
        """One owner's private documents, newest first."""
        if not owner_id or not owner_id.strip():
            return []
        sql = [
            "SELECT * FROM documents WHERE visibility = 'private' AND owner_id = ?"
        ]
        params: list[Any] = [owner_id.strip()]
        if category:
            sql.append("AND category = ?")
            params.append(category)
        sql.append("ORDER BY created_at DESC, document_id DESC LIMIT ? OFFSET ?")
        params.extend([max(1, min(limit, 500)), max(0, offset)])
        rows = self.connection.execute(" ".join(sql), params)
        return [DocumentRecord.from_row(r) for r in rows]

    def user_document_usage(self, owner_id: str) -> dict[str, int]:
        """Row count and recorded byte total for one owner.

        The authoritative number for the *volume* is what
        :meth:`UserDocumentStore.owner_usage` measures on disk; this is the
        cheap one, for showing a user their own storage without a directory walk.
        """
        if not owner_id or not owner_id.strip():
            return {"document_count": 0, "total_bytes": 0}
        row = self.connection.execute(
            """
            SELECT COUNT(*) AS n, COALESCE(SUM(file_size), 0) AS b
              FROM documents
             WHERE visibility = 'private' AND owner_id = ?
            """,
            (owner_id.strip(),),
        ).fetchone()
        return {"document_count": int(row["n"]), "total_bytes": int(row["b"])}

    def delete_user_document(self, document_id: str, owner_id: str) -> DocumentRecord | None:
        """Delete one owned private document, returning the row that was removed.

        The caller needs the row to unlink the file, and it has to come from the
        same ownership-filtered query that authorised the delete -- re-reading it
        afterwards would be a second chance to get the predicate wrong.
        """
        record = self.get_owned_document(document_id, owner_id)
        if record is None:
            return None
        with self._write() as conn:
            conn.execute(
                "DELETE FROM documents WHERE document_id = ? AND visibility = 'private' AND owner_id = ?",
                (document_id, owner_id.strip()),
            )
        return record

    def iter_private_documents(self, batch_size: int = 500) -> Iterator[DocumentRecord]:
        """Every private document, oldest first. For backups and integrity sweeps."""
        offset = 0
        while True:
            rows = self.connection.execute(
                "SELECT * FROM documents WHERE visibility = 'private' "
                "ORDER BY created_at, document_id LIMIT ? OFFSET ?",
                (batch_size, offset),
            ).fetchall()
            if not rows:
                return
            for row in rows:
                yield DocumentRecord.from_row(row)
            offset += len(rows)

    # ─── Ingest jobs ─────────────────────────────────────────────────────────
    #
    # The async ingest contract (see PRODUCTION_TODO.md T2): an API request
    # enqueues a file into INBOX_ROOT and creates a `queued` row here, the
    # ingest worker is the only process that ever moves it onward, and a
    # caller polls `get_ingest_job` for a terminal status. Kept as its own
    # table rather than reusing `documents`, because a duplicate or a failure
    # that happens before the pipeline creates a document row still needs
    # somewhere to report that outcome to the specific job_id that was polled.

    def create_ingest_job(self, job_id: str, filename: str | None = None) -> None:
        now = _now()
        with self._write() as conn:
            conn.execute(
                "INSERT INTO ingest_jobs (job_id, status, filename, created_at, updated_at) "
                "VALUES (?, 'queued', ?, ?, ?)",
                (job_id, filename, now, now),
            )

    def update_ingest_job(
        self,
        job_id: str,
        *,
        status: str,
        document_id: str | None = None,
        result: dict[str, Any] | None = None,
        error: str | None = None,
    ) -> None:
        with self._write() as conn:
            conn.execute(
                "UPDATE ingest_jobs SET status = ?, document_id = COALESCE(?, document_id), "
                "result = COALESCE(?, result), error = COALESCE(?, error), updated_at = ? "
                "WHERE job_id = ?",
                (
                    status,
                    document_id,
                    json.dumps(result) if result is not None else None,
                    error,
                    _now(),
                    job_id,
                ),
            )

    def get_ingest_job(self, job_id: str) -> dict[str, Any] | None:
        row = self.connection.execute(
            "SELECT * FROM ingest_jobs WHERE job_id = ?", (job_id,)
        ).fetchone()
        if row is None:
            return None
        job = dict(row)
        job["result"] = json.loads(job["result"]) if job["result"] else None
        return job

    # ─── Chunks ──────────────────────────────────────────────────────────────

    def replace_chunks(
        self,
        document_id: str,
        collection: str,
        chunks: Sequence[tuple[str, int | None]],
        faiss_ids: Sequence[int],
        owner_id: str | None = None,
    ) -> list[int]:
        """Write a document's chunks, replacing any previous attempt's rows.

        ``chunks`` is ``(chunk_text, page_number)`` in order. Returns the FAISS
        ids that the *previous* attempt left behind so the caller can drop them
        from the index -- a resumed ingest must not leave old vectors pointing at
        rows that no longer exist. This is also what makes a delete-then-reingest
        replace a document's vectors rather than accumulate a second copy.

        ``owner_id`` is the tenant boundary and is copied onto every chunk row.
        Passing ``None`` means the public corpus. It is read back from the
        document rather than trusted when omitted, so a caller cannot
        accidentally widen a private document by forgetting the argument.
        """
        if len(chunks) != len(faiss_ids):
            raise ValueError("chunks and faiss_ids must be the same length")

        now = _now()
        with self._write() as conn:
            # The document row is the authority on who owns these chunks. Reading
            # it here rather than trusting the argument means a caller that
            # forgets owner_id writes a correctly-scoped row instead of a
            # world-readable one -- the failure mode points at "too private".
            # The effective owner: owner_id for documents this backend stores,
            # clerk_uid for per-advocate corpus documents the Next app stores and
            # only indexes here. Either means private.
            row = conn.execute(
                "SELECT COALESCE(owner_id, clerk_uid) AS effective_owner "
                "FROM documents WHERE document_id = ?",
                (document_id,),
            ).fetchone()
            if row is not None:
                owner_id = row["effective_owner"]
            elif owner_id is None:
                raise ValueError(
                    f"replace_chunks: no document row for {document_id!r} and no owner_id given"
                )

            stale = [
                r["faiss_id"]
                for r in conn.execute(
                    "SELECT faiss_id FROM chunks WHERE document_id = ?", (document_id,)
                )
            ]
            conn.execute("DELETE FROM chunks WHERE document_id = ?", (document_id,))
            conn.executemany(
                """
                INSERT INTO chunks (
                    chunk_id, document_id, collection, owner_id, chunk_index,
                    chunk_text, page_number, faiss_id, created_at
                ) VALUES (?,?,?,?,?,?,?,?,?)
                """,
                [
                    (
                        f"{document_id}_{index}",
                        document_id,
                        collection,
                        owner_id,
                        index,
                        self._compress_chunk_text(text),
                        page_number,
                        faiss_id,
                        now,
                    )
                    for index, ((text, page_number), faiss_id) in enumerate(
                        zip(chunks, faiss_ids)
                    )
                ],
            )
            conn.execute(
                "UPDATE documents SET chunk_count = ?, updated_at = ? WHERE document_id = ?",
                (len(chunks), now, document_id),
            )
        return stale

    def chunks_for_document(self, document_id: str) -> list[tuple[int, str]]:
        """``(faiss_id, chunk_text)`` for one document, in chunk order.

        What ``rag/scripts/promote_lane.py`` embeds: a lexical-lane chunk
        already holds a ``faiss_id`` (the schema requires one regardless of
        lane -- see the column comment above), it was simply never added to
        the index, so promotion embeds this text and adds it under the id it
        already has rather than reallocating one.
        """
        rows = self.connection.execute(
            "SELECT faiss_id, chunk_text FROM chunks WHERE document_id = ? ORDER BY chunk_index",
            (document_id,),
        ).fetchall()
        return [(row["faiss_id"], self.decode_chunk_text(row["chunk_text"])) for row in rows]

    def set_lane(self, document_id: str, lane: str, lane_reason: str | None) -> None:
        """Change a document's lane without touching any of its other fields.

        Used by ``rag/scripts/promote_lane.py`` after it has added a
        lexical-lane document's vectors to the index -- at that point the
        document really is dense, and the update must not go through
        :meth:`upsert_document`'s ``COALESCE`` logic for the identity fields,
        which would require re-supplying all of them.
        """
        with self._write() as conn:
            conn.execute(
                "UPDATE documents SET lane = ?, lane_reason = ?, updated_at = ? WHERE document_id = ?",
                (lane, lane_reason, _now(), document_id),
            )

    def lexical_document_ids(self, court: str | None = None) -> list[str]:
        """Ids of every lexical-lane document, optionally narrowed to one court.

        Feeds ``rag/scripts/promote_lane.py --court``, for bulk-correcting a
        routing rule that turns out to have been too conservative for a whole
        court rather than one document.
        """
        sql = "SELECT document_id FROM documents WHERE lane = 'lexical'"
        params: list[Any] = []
        if court is not None:
            sql += " AND court = ?"
            params.append(court)
        return [row["document_id"] for row in self.connection.execute(sql, params)]

    def lane_histogram(self, collection: str | None = None) -> dict[str, int]:
        """Count of documents per ``(lane, lane_reason)``, most common first.

        What T14's "Done when" asks to be reported: a split far from the
        expected ~80 lakh dense estimate means the routing rules need tuning
        before the GPU spend in T10.
        """
        sql = "SELECT lane, lane_reason, COUNT(*) AS n FROM documents"
        params: list[Any] = []
        if collection is not None:
            sql += " WHERE collection = ?"
            params.append(collection)
        sql += " GROUP BY lane, lane_reason ORDER BY n DESC"
        return {
            f"{row['lane']}:{row['lane_reason']}": row["n"]
            for row in self.connection.execute(sql, params)
        }

    def chunks_by_faiss_ids(self, faiss_ids: Sequence[int]) -> dict[int, ChunkRecord]:
        """Hydrate FAISS hits. Missing ids are simply absent from the result."""
        if not faiss_ids:
            return {}
        found: dict[int, ChunkRecord] = {}
        # Chunked to stay under SQLITE_MAX_VARIABLE_NUMBER (999 on older builds).
        for batch in _batched(list(faiss_ids), 500):
            placeholders = ",".join("?" for _ in batch)
            rows = self.connection.execute(
                f"{_CHUNK_SELECT} WHERE c.faiss_id IN ({placeholders})", batch
            )
            for row in rows:
                record = ChunkRecord.from_row(row, decode_chunk_text=self.decode_chunk_text)
                found[record.faiss_id] = record
        return found

    def search_lexical(
        self, query: str, scope: "SearchFilter", limit: int
    ) -> list[tuple[int, float]]:
        """BM25 full-text search, scoped by exactly what the dense path sees.

        Returns ``(faiss_id, score)`` pairs, best match first, ``score``
        negated from FTS5's ``bm25()`` (a cost -- smaller is better) so that
        "higher score is a better match" holds across both retrieval lanes,
        the same convention the cosine-similarity dense path already
        documents.

        Takes the identical :class:`~rag.core.vector_index.SearchFilter` the
        dense path resolves once in ``Retriever._scope_for`` and applies it as
        one predicate on ``chunks.faiss_id`` in the same query as the MATCH --
        never a separate unscoped fetch narrowed afterwards in Python. That is
        what makes this "the same owner scoping in SQL" PRODUCTION_TODO.md T7
        asks for, rather than a second, independently-written filter that
        could drift from the one FAISS enforces.

        The only method in this file that touches ``chunks_fts`` -- see that
        table's comment in ``_SCHEMA_TABLES``.
        """
        if limit <= 0 or not query.strip():
            return []
        if scope.matches_nothing:
            return []

        match_expr = _fts_match_expression(query)
        if not match_expr:
            return []
        clause, params = _scope_sql(scope)

        sql = (
            "SELECT c.faiss_id AS faiss_id, bm25(chunks_fts) AS cost "
            "FROM chunks_fts JOIN chunks c ON c.rowid = chunks_fts.rowid "
            f"WHERE chunks_fts MATCH ? AND ({clause}) "
            "ORDER BY cost LIMIT ?"
        )
        try:
            rows = self.connection.execute(sql, [match_expr, *params, limit]).fetchall()
        except sqlite3.OperationalError:
            # A malformed MATCH expression is a query-shape problem, not "no
            # matches" -- swallowing it as an empty result would silently hide
            # a broken lexical lane behind a still-working dense one, which
            # is worse than logging and returning nothing from this lane only.
            logger.warning("chunks_fts rejected query %r; skipping the lexical lane", query)
            return []
        return [(int(r["faiss_id"]), -float(r["cost"])) for r in rows]

    def faiss_ids_for_owner(
        self,
        owner_id: str,
        *,
        collection: str | None = None,
        document_id: str | None = None,
    ) -> list[int]:
        """Every FAISS id belonging to one owner. The tenant-isolation lookup.

        Single-table and index-only against ``idx_chunks_owner`` -- no join. The
        allow-list this returns is the *entire* basis on which FAISS decides what
        a tenant may see, so it is kept as simple as a query can be: one equality
        predicate on an indexed column, no OR, no outer join, nothing whose
        result changes when a row on the other side is missing.

        An owner with nothing indexed correctly returns ``[]``, and callers must
        pass that straight through to a zero-result search. See
        :meth:`rag.core.vector_index.VectorIndex.search`.
        """
        if not owner_id or not owner_id.strip():
            # A blank owner is a caller bug, not "the public corpus" -- and if it
            # were ever treated as a wildcard it would match every private row.
            raise ValueError("faiss_ids_for_owner requires a non-empty owner_id")

        sql = "SELECT faiss_id FROM chunks WHERE owner_id = ?"
        params: list[Any] = [owner_id]
        if collection is not None:
            sql += " AND collection = ?"
            params.append(collection)
        if document_id is not None:
            sql += " AND document_id = ?"
            params.append(document_id)
        return [r["faiss_id"] for r in self.connection.execute(sql, params)]

    def effective_owner(self, document_id: str) -> str | None:
        """Who owns a document: ``owner_id``, else ``clerk_uid``, else nobody.

        One definition, used by the chunk writer, the triggers and the migration
        alike -- three places deciding "is this private?" separately is how they
        end up disagreeing.
        """
        row = self.connection.execute(
            "SELECT COALESCE(owner_id, clerk_uid) AS effective_owner "
            "FROM documents WHERE document_id = ?",
            (document_id,),
        ).fetchone()
        return row["effective_owner"] if row else None

    def mispartitioned_chunks(self) -> list[tuple[str, str | None, int]]:
        """Chunks whose ``faiss_id`` is in the wrong partition for their owner.

        Only ever non-empty on a database migrated from before the partition
        existed. A private chunk sitting in the public id range is reachable by
        every public search, so this is checked at startup and repaired by
        ``rag/scripts/rebuild_index.py`` rather than left for someone to notice.
        """
        rows = self.connection.execute(
            """
            SELECT chunk_id, owner_id, faiss_id FROM chunks
             WHERE (owner_id IS NOT NULL AND faiss_id < ?)
                OR (owner_id IS NULL AND faiss_id >= ?)
            """,
            (PRIVATE_ID_MIN, PRIVATE_ID_MIN),
        ).fetchall()
        return [(r["chunk_id"], r["owner_id"], r["faiss_id"]) for r in rows]

    def repartition_chunks(self) -> dict[str, int]:
        """Move mis-partitioned chunks onto ids from the right partition.

        Returns ``{chunk_id: new_faiss_id}``. The vectors themselves are *not*
        touched here -- the old ids are still what FAISS holds -- so this is only
        correct as the first step of a full index rebuild, which re-adds every
        vector under the id SQLite now records. Running it without that rebuild
        would leave the index pointing at ids no row claims.
        """
        stale = self.mispartitioned_chunks()
        if not stale:
            return {}

        private = [c for c, owner, _ in stale if owner is not None]
        public = [c for c, owner, _ in stale if owner is None]
        new_ids: dict[str, int] = {}
        new_ids.update(zip(private, self.allocate_faiss_ids(len(private), private=True)))
        new_ids.update(zip(public, self.allocate_faiss_ids(len(public))))

        with self._write() as conn:
            conn.executemany(
                "UPDATE chunks SET faiss_id = ? WHERE chunk_id = ?",
                [(faiss_id, chunk_id) for chunk_id, faiss_id in new_ids.items()],
            )
        logger.info("Repartitioned %d chunk(s) onto correct FAISS id ranges", len(new_ids))
        return new_ids

    def public_faiss_id_count(self) -> int:
        """How many chunks sit in the public partition. Diagnostics only."""
        return self.connection.execute(
            "SELECT COUNT(*) FROM chunks WHERE owner_id IS NULL"
        ).fetchone()[0]

    def faiss_ids_for(
        self,
        collection: str,
        *,
        corpus_id: str | None = None,
        clerk_uid: str | None = None,
        document_id: str | None = None,
        court: str | None = None,
    ) -> list[int]:
        """Ids matching a metadata filter -- the FAISS selector for a scoped search.

        FAISS has no metadata filtering of its own, so the filter is answered
        here (against indexed columns) and handed to FAISS as an id allow-list.
        """
        sql = [
            "SELECT c.faiss_id FROM chunks c JOIN documents d",
            "ON d.document_id = c.document_id WHERE c.collection = ?",
        ]
        params: list[Any] = [collection]
        if corpus_id is not None:
            sql.append("AND d.corpus_id = ?")
            params.append(corpus_id)
        if clerk_uid is not None:
            sql.append("AND d.clerk_uid = ?")
            params.append(clerk_uid)
        if document_id is not None:
            sql.append("AND c.document_id = ?")
            params.append(document_id)
        if court is not None:
            sql.append("AND d.court = ?")
            params.append(court)
        return [r["faiss_id"] for r in self.connection.execute(" ".join(sql), params)]

    # ─── Deletion ────────────────────────────────────────────────────────────

    def delete_documents(
        self,
        collection: str,
        *,
        corpus_id: str | None = None,
        clerk_uid: str | None = None,
        document_id: str | None = None,
    ) -> list[int]:
        """Delete matching documents and their chunks; return freed embedding ids.

        The caller removes those ids from FAISS. Requiring at least one filter is
        deliberate -- an unscoped delete here would silently empty a collection.
        """
        if corpus_id is None and clerk_uid is None and document_id is None:
            raise ValueError("delete_documents requires at least one filter")

        # Scoped to public rows so a corpus purge can never reach a user's
        # private documents, whatever collection name it is handed.
        conditions = ["collection = ?", "visibility = 'public'"]
        params: list[Any] = [collection]
        for column, value in (
            ("corpus_id", corpus_id),
            ("clerk_uid", clerk_uid),
            ("document_id", document_id),
        ):
            if value is not None:
                conditions.append(f"{column} = ?")
                params.append(value)
        where = " AND ".join(conditions)

        with self._write() as conn:
            freed = [
                r["faiss_id"]
                for r in conn.execute(
                    f"SELECT faiss_id FROM chunks WHERE document_id IN "
                    f"(SELECT document_id FROM documents WHERE {where})",
                    params,
                )
            ]
            conn.execute(f"DELETE FROM documents WHERE {where}", params)
        return freed

    # ─── Stats ───────────────────────────────────────────────────────────────

    def stats(self, collection: str | None = None) -> dict[str, int]:
        """Chunk and document counts.

        Two indexed COUNT(*)s, unlike the Chroma implementation this replaces,
        which paged the entire collection's metadata to count distinct documents
        and therefore needed a five-minute cache to survive being polled.
        """
        where, params = ("WHERE collection = ?", (collection,)) if collection else ("", ())
        chunk_count = self.connection.execute(
            f"SELECT COUNT(*) FROM chunks {where}", params
        ).fetchone()[0]
        document_count = self.connection.execute(
            f"SELECT COUNT(*) FROM documents {where}", params
        ).fetchone()[0]
        return {"chunk_count": chunk_count, "document_count": document_count}


def _batched(items: list[Any], size: int) -> Iterable[list[Any]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


def _fts_match_expression(query: str) -> str:
    """Turn free text into a safe FTS5 ``MATCH`` expression.

    Each whitespace-separated token is individually quoted (internal ``"``
    doubled, FTS5's own escape for a quote inside a string literal), which
    turns punctuation a legal citation is full of -- ``/``, ``:``, ``(``,
    ``)``, ``-`` -- into literal text instead of FTS5 query syntax (column
    filters, ``NOT``, prefix operators, unbalanced parens). Quoted terms are
    still tokenised by the same tokenizer as an unquoted term, so this does
    not change what an ordinary word query matches -- only what a citation
    string like ``"2019 SCC OnLine SC 1234"`` is parsed as. Adjacent quoted
    terms default to FTS5's implicit ``AND``, same as adjacent bare terms.
    """
    tokens = query.split()
    return " ".join('"' + token.replace('"', '""') + '"' for token in tokens)


def _scope_sql(scope: "SearchFilter") -> tuple[str, list[Any]]:
    """Render a :class:`SearchFilter` as a ``chunks.faiss_id`` predicate.

    Mirrors, id-range for id-range and allow-list for allow-list, exactly what
    :meth:`~rag.core.vector_index.VectorIndex._build_params` builds for FAISS
    -- the two must agree, or a tenant could see a different set of chunks
    through the lexical lane than through the dense one.
    """
    if scope.unrestricted:
        return "1=1", []

    parts: list[str] = []
    params: list[Any] = []
    if scope.include_public:
        parts.append(f"c.faiss_id BETWEEN {PUBLIC_ID_MIN} AND {PRIVATE_ID_MIN - 1}")
    if scope.allowed_ids:
        placeholders = ",".join("?" for _ in scope.allowed_ids)
        parts.append(f"c.faiss_id IN ({placeholders})")
        params.extend(scope.allowed_ids)

    if not parts:
        # scope.matches_nothing already short-circuits callers before this is
        # reached for the ordinary case (allowed_ids=[], include_public=False);
        # this is only a defensive fallback in case a future SearchFilter shape
        # doesn't set either field, so "no expressed scope" still means "see
        # nothing" rather than falling through to an unrestricted query.
        return "0=1", []
    return "(" + " OR ".join(parts) + ")", params
