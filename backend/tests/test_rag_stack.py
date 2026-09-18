"""
Tests for the self-hosted RAG stack (rag/core, rag/app/ingest, rag/app/retrieval).

Entirely offline: no network, no model download, no Docling. The embedding model
is swapped for the deterministic test embedder and documents are plain text, so
what is under test is the storage and bookkeeping -- ids, dedup, isolation,
resume, persistence and backups -- rather than anything about embedding quality.

Run:
    cd backend
    .venv/bin/python tests/test_rag_stack.py
"""

import json
import multiprocessing
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
import uuid
from pathlib import Path
from unittest import mock

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from rag.core import services as services_module
from rag.core.backup import prune_backups, run_backup
from rag.core.config import RagConfig, ensure_directories, set_config
from rag.core.embeddings import DeterministicEmbedder
from rag.core.hash_index import HashEntry, HashIndex
from rag.core.paths import document_relative_path, resolve_court
from rag.core.sqlite_store import STATUS_COMPLETE, STATUS_FAILED, SqliteStore
from rag.core.vector_index import (
    GLOBAL_COLLECTION,
    LOGICAL_COLLECTIONS,
    PUBLIC_COLLECTION,
    SearchFilter,
    USER_COLLECTION,
    VectorIndex,
    VectorIndexRegistry,
)
import rag.scripts.build_index as build_index_module
from rag.scripts.build_index import BuildRefused, build_collections as build_index_collections
from rag.scripts.rebuild_index import RebuildRefused, rebuild_collections


def _allocate_ids_in_subprocess(db_path: str, count: int, private: bool, result_queue) -> None:
    """Run in a real OS process: allocate ids and report the range back.

    Module-level, not a closure, so it is importable under any
    multiprocessing start method. See
    TestSqliteStore.test_allocate_faiss_ids_is_atomic_across_real_processes --
    this is only meaningful as an actual separate process, not a thread.
    """
    from rag.core.sqlite_store import SqliteStore

    store = SqliteStore(db_path)
    try:
        allocated = store.allocate_faiss_ids(count, private=private)
        result_queue.put(("ok", allocated.start, allocated.stop))
    except Exception as exc:  # noqa: BLE001 -- report it back, don't hang the parent
        result_queue.put(("error", str(exc), None))
    finally:
        store.close()


class RagStackTestCase(unittest.TestCase):
    """Base case: a real stack rooted in a temp DATA_ROOT, torn down after."""

    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="rag_test_"))
        self.config = self._config()
        set_config(self.config)
        self.services = services_module.build_services(
            self.config, embedder=DeterministicEmbedder(dimension=self.config.embed_dim)
        )
        services_module.startup(self.services)

    def tearDown(self):
        services_module.shutdown(self.services)
        services_module.set_services(None)
        set_config(None)
        shutil.rmtree(self.root, ignore_errors=True)

    def _config(self, **overrides) -> RagConfig:
        env = {
            "DATA_ROOT": str(self.root),
            "EMBED_MODEL": "deterministic-test",
            "EMBED_DIM": "64",
            "PARSER_BACKEND": "pypdfium",
            # T8 raised the production default off 1 so a bulk import doesn't
            # rewrite the whole file per document. Almost every test here
            # ingests through the pipeline directly (bypassing ingest_worker's
            # explicit flush_all()) and then inspects on-disk state, so pin
            # synchronous flushing here; TestFlushThreshold overrides this
            # per-test to exercise the adaptive behavior itself.
            "FAISS_FLUSH_EVERY": "1",
        }
        env.update({k: str(v) for k, v in overrides.items()})
        previous = {k: os.environ.get(k) for k in env}
        os.environ.update(env)
        try:
            return RagConfig.from_env()
        finally:
            for key, value in previous.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

    def _pipeline(self):
        from rag.app.ingest.pipeline import IngestionPipeline

        return IngestionPipeline(self.services)

    def _retriever(self):
        from rag.app.retrieval.retriever import Retriever

        return Retriever(self.services)

    def _document(self, name: str, text: str) -> Path:
        path = self.root / "inbox" / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return path


JUDGMENT = """# Kumar v. State of Delhi

IN THE SUPREME COURT OF INDIA
Criminal Appeal No. 9910 of 2026
Neutral Citation: 2026 INSC 793

Judgment delivered on 12th March, 2026.

The appellant challenged the rejection of anticipatory bail. The Court held that
the twin conditions under Section 45 do not apply where the accused cooperated
with the investigation. The verification phrase is zephyrquartzbail.
"""

# A second, distinct document. Used by the incremental-backup tests, which need
# one document that existed at the previous snapshot and one that did not.
SECOND_JUDGMENT = """# Rao v. Union of India

IN THE SUPREME COURT OF INDIA
Civil Appeal No. 4412 of 2026
Neutral Citation: 2026 INSC 801

Judgment delivered on 4th April, 2026.

The appellant challenged a land acquisition award. The Court held that a lapsed
notification cannot be revived by an administrative circular. The verification
phrase is amberlatticeacquire.
"""


# ─── Config defaults aligned with the architecture (PRODUCTION_TODO.md T19) ──


class TestConfigDefaults(unittest.TestCase):
    def test_embed_model_defaults_to_the_servable_model_not_the_gpu_one(self):
        """A host that boots without EMBED_MODEL set must get the ~80ms-per-
        query 0.6b model FAISS_ARCHITECTURE.md recommends for serving, not
        the ~2.5s-per-query 8b one -- and must match .env.example's own
        default, which was already correct before this fix."""
        tmp = tempfile.TemporaryDirectory()
        previous = {"DATA_ROOT": os.environ.get("DATA_ROOT"), "EMBED_MODEL": os.environ.get("EMBED_MODEL")}
        os.environ["DATA_ROOT"] = tmp.name
        os.environ.pop("EMBED_MODEL", None)
        try:
            self.assertEqual(RagConfig.from_env().embed_model, "qwen3-embedding-0.6b")
        finally:
            tmp.cleanup()
            for key, value in previous.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

    def test_upload_dir_derives_from_the_hdd_tier_on_a_split_host(self):
        """app/config.py used to read DATA_ROOT directly for UPLOAD_DIR while
        every other bulk path derives from rag/core/config.py's two-tier
        split, so on a split host upload staging silently landed on whatever
        DATA_ROOT pointed at instead of HDD_DATA_ROOT. Settings() is a frozen
        dataclass whose class-level field defaults are evaluated once, at
        `app.config`'s first import -- this needs a real subprocess (like
        `test_allocate_faiss_ids_is_atomic_across_real_processes` above) to
        exercise a fresh import against different env vars; patching
        os.environ in-process and constructing a second Settings() would not
        re-run the class-body expression that computed UPLOAD_DIR."""
        with tempfile.TemporaryDirectory() as tmp:
            hdd, ssd, legacy = Path(tmp) / "hdd", Path(tmp) / "ssd", Path(tmp) / "legacy"
            for d in (hdd, ssd, legacy):
                d.mkdir()
            env = dict(os.environ)
            env.update(
                {
                    "DATA_ROOT": str(legacy),
                    "HDD_DATA_ROOT": str(hdd),
                    "SSD_DATA_ROOT": str(ssd),
                    "RAVENSLAW_DEBUG": "false",
                    "RAVENSLAW_INTERNAL_TOKEN": "x",
                    "RAVENSLAW_CORS_ORIGINS": "https://example.com",
                    "RAVENSLAW_TRUSTED_HOSTS": "example.com",
                    "CLERK_JWT_ISSUER": "https://test.clerk.example.com",
                }
            )
            env.pop("RAVENSLAW_UPLOAD_DIR", None)
            backend_root = str(Path(__file__).resolve().parents[1])
            script = (
                f"import sys; sys.path.insert(0, {backend_root!r}); "
                "from app.config import settings; print(settings.UPLOAD_DIR)"
            )
            result = subprocess.run(
                [sys.executable, "-c", script], env=env, capture_output=True, text=True, timeout=30,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            upload_dir = result.stdout.strip()
            self.assertEqual(upload_dir, str(hdd / "tmp" / "uploads"))
            # The bug this regression test exists to catch: landing under the
            # legacy single-volume root instead of the HDD tier.
            self.assertNotIn(str(legacy), upload_dir)

    def test_startup_logs_the_resolved_faiss_and_storage_configuration(self):
        """An operator reading the boot log, not the source, must be able to
        tell which embedding model/index factory/nprobe/tier roots actually
        got resolved -- see this task's own Change item 4."""
        tmp = Path(tempfile.mkdtemp(prefix="rag_test_t19_"))
        env = {
            "DATA_ROOT": str(tmp),
            "EMBED_MODEL": "deterministic-test",
            "EMBED_DIM": "64",
            "PARSER_BACKEND": "pypdfium",
            "FAISS_FLUSH_EVERY": "1",
        }
        previous = {k: os.environ.get(k) for k in env}
        os.environ.update(env)
        try:
            config = RagConfig.from_env()
        finally:
            for key, value in previous.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

        set_config(config)
        services = services_module.build_services(config, embedder=DeterministicEmbedder(dimension=64))
        try:
            with self.assertLogs("ravenslaw.rag.services", level="INFO") as ctx:
                services_module.startup(services, read_only=True)
            combined = "\n".join(ctx.output)
            self.assertIn("embed_model=deterministic-test", combined)
            self.assertIn(f"faiss_index_factory={config.faiss_index_factory}", combined)
            self.assertIn(f"faiss_nprobe={config.faiss_nprobe}", combined)
            self.assertIn(f"ssd_data_root={config.ssd_data_root}", combined)
            self.assertIn(f"hdd_data_root={config.hdd_data_root}", combined)
            self.assertIn("storage_is_split=False", combined)
        finally:
            services_module.shutdown(services)
            set_config(None)
            shutil.rmtree(tmp, ignore_errors=True)


# ─── Court routing ───────────────────────────────────────────────────────────


class TestCourtPaths(unittest.TestCase):
    def test_aliases_collapse_to_one_court(self):
        for spelling in ("SCI", "Supreme Court of India", "supreme court", "sc"):
            self.assertEqual(resolve_court(spelling).code, "sci")

    def test_high_courts_are_nested_under_hc(self):
        self.assertEqual(resolve_court("Delhi High Court").code, "hc/delhi")
        self.assertEqual(resolve_court("hc-delhi").code, "hc/delhi")

    def test_unknown_court_is_filed_not_dropped(self):
        """Losing a document is worse than filing it imprecisely."""
        self.assertEqual(resolve_court("Some Unlisted Tribunal").code, "misc")
        self.assertEqual(resolve_court(None).code, "misc")

    def test_path_layout_matches_the_documented_archive(self):
        self.assertEqual(
            document_relative_path("SCI", "a" * 64, ".pdf", 2026),
            f"sci/2026/{'a' * 64}.pdf",
        )

    def test_path_rejects_traversal_and_bad_hashes(self):
        with self.assertRaises(ValueError):
            document_relative_path("SCI", "a" * 64, "../../etc/passwd")
        with self.assertRaises(ValueError):
            document_relative_path("SCI", "not-a-hash", ".pdf")


# ─── SQLite ──────────────────────────────────────────────────────────────────


class TestSqliteStore(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = SqliteStore(Path(self.tmp.name) / "chunks.db")
        self.store.initialize()

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def _document(self, document_id="D1", **kwargs):
        self.store.upsert_document(
            document_id=document_id,
            collection=kwargs.pop("collection", PUBLIC_COLLECTION),
            **kwargs,
        )

    def test_faiss_ids_are_never_reused(self):
        """A freed id must not come back: a stale vector would resolve to it."""
        self._document()
        first = list(self.store.allocate_faiss_ids(3))
        self.store.replace_chunks("D1", PUBLIC_COLLECTION, [("a", 1), ("b", 1), ("c", 2)], first)
        self.store.delete_documents(PUBLIC_COLLECTION, document_id="D1")

        self._document(document_id="D2")
        second = list(self.store.allocate_faiss_ids(2))
        self.assertFalse(set(first) & set(second))

    def test_allocate_faiss_ids_is_atomic_across_real_processes(self):
        """Two OS processes allocating from the same counter must never
        receive overlapping ranges -- see PRODUCTION_TODO.md T2b. Real
        `multiprocessing.Process`, not threads: the bug was specifically that
        a bare SELECT runs outside any transaction under SQLite's default
        deferred isolation, which two threads serialised by one process's
        `_write_lock` would never exercise -- only two independent
        connections from two independent processes reproduce what production
        actually does.
        """
        db_path = str(Path(self.tmp.name) / "chunks.db")
        count = 1000
        queue: multiprocessing.Queue = multiprocessing.Queue()

        procs = [
            multiprocessing.Process(
                target=_allocate_ids_in_subprocess, args=(db_path, count, False, queue)
            )
            for _ in range(2)
        ]
        for p in procs:
            p.start()
        for p in procs:
            p.join(timeout=30)
            self.assertEqual(p.exitcode, 0, "child process crashed")

        results = [queue.get(timeout=5) for _ in procs]
        for status, a, b in results:
            self.assertEqual(status, "ok", f"child reported an error: {a}")

        ranges = [range(a, b) for _, a, b in results]
        self.assertEqual(len(ranges[0]), count)
        self.assertEqual(len(ranges[1]), count)
        self.assertFalse(
            set(ranges[0]) & set(ranges[1]), f"overlapping ranges allocated: {ranges}"
        )

    def test_replace_chunks_returns_the_previous_attempt_ids(self):
        """This is what lets a resumed ingest drop its own half-written vectors."""
        self._document()
        first = list(self.store.allocate_faiss_ids(3))
        self.store.replace_chunks("D1", PUBLIC_COLLECTION, [("a", 1)] * 3, first)

        second = list(self.store.allocate_faiss_ids(2))
        stale = self.store.replace_chunks("D1", PUBLIC_COLLECTION, [("x", 1)] * 2, second)

        self.assertEqual(sorted(stale), sorted(first))
        self.assertEqual(self.store.stats()["chunk_count"], 2)

    def test_scoped_ids_never_cross_users(self):
        self._document("D1", collection=USER_COLLECTION, corpus_id="C1", clerk_uid="U1")
        self._document("D2", collection=USER_COLLECTION, corpus_id="C1", clerk_uid="U2")
        # Owned documents draw from the private partition. Allocating public
        # ids for them is refused by a trigger, which is the point.
        ids1 = list(self.store.allocate_faiss_ids(1, private=True))
        ids2 = list(self.store.allocate_faiss_ids(1, private=True))
        self.store.replace_chunks("D1", USER_COLLECTION, [("u1 text", None)], ids1)
        self.store.replace_chunks("D2", USER_COLLECTION, [("u2 text", None)], ids2)

        self.assertEqual(self.store.faiss_ids_for(USER_COLLECTION, corpus_id="C1", clerk_uid="U1"), ids1)
        self.assertEqual(self.store.faiss_ids_for(USER_COLLECTION, corpus_id="C1", clerk_uid="U2"), ids2)
        self.assertEqual(self.store.faiss_ids_for(USER_COLLECTION, corpus_id="C1", clerk_uid="U3"), [])

    def test_unscoped_delete_is_refused(self):
        """An unscoped delete here would silently empty a collection."""
        with self.assertRaises(ValueError):
            self.store.delete_documents(PUBLIC_COLLECTION)

    def test_upsert_preserves_fields_it_is_not_given(self):
        self._document(title="X v. Y", court="sci", citation="2026 INSC 793")
        self._document(status=STATUS_COMPLETE)
        record = self.store.get_document("D1")
        self.assertEqual(record.title, "X v. Y")
        self.assertEqual(record.citation, "2026 INSC 793")
        self.assertEqual(record.status, STATUS_COMPLETE)

    def test_incomplete_documents_are_the_resume_worklist(self):
        self._document("DONE", status=STATUS_COMPLETE)
        self._document("BROKEN", status=STATUS_FAILED)
        self.assertEqual([d.document_id for d in self.store.incomplete_documents()], ["BROKEN"])

    def test_hydration_joins_document_metadata(self):
        self._document(title="X v. Y", court="sci", citation="2026 INSC 793")
        ids = list(self.store.allocate_faiss_ids(1))
        self.store.replace_chunks("D1", PUBLIC_COLLECTION, [("chunk text", 7)], ids)

        record = self.store.chunks_by_faiss_ids(ids)[ids[0]]
        self.assertEqual(record.chunk_text, "chunk text")
        self.assertEqual(record.page_number, 7)
        self.assertEqual(record.court, "sci")
        self.assertEqual(record.citation, "2026 INSC 793")


# ─── SQLite pragma tuning (PRODUCTION_TODO.md T18) ───────────────────────────


class TestSqlitePragmaTuning(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp.name) / "chunks.db"

    def tearDown(self):
        self.tmp.cleanup()

    def test_a_fresh_database_reports_the_configured_pragmas(self):
        """T18's own Verify command, as a permanent regression: page_size
        must land on a brand-new database (its only real effect -- see
        SqliteStore._connect), and mmap_size/cache_size/journal_mode must be
        whatever was configured, on every connection."""
        store = SqliteStore(
            self.db_path, page_size=8192, mmap_size_mb=256, cache_size_mb=32,
        )
        store.initialize()
        try:
            conn = store.connection
            self.assertEqual(conn.execute("PRAGMA page_size").fetchone()[0], 8192)
            self.assertEqual(conn.execute("PRAGMA journal_mode").fetchone()[0], "wal")
            # mmap_size is rounded down to a page-size multiple by SQLite --
            # assert it lands within one page of the requested byte count
            # rather than requiring an exact match.
            mmap_size = conn.execute("PRAGMA mmap_size").fetchone()[0]
            requested = 256 * 1024 * 1024
            self.assertGreater(mmap_size, requested - 8192)
            self.assertLessEqual(mmap_size, requested)
            # cache_size is negative KB by convention (see SqliteStore._connect).
            self.assertEqual(conn.execute("PRAGMA cache_size").fetchone()[0], -32 * 1024)
        finally:
            store.close()

    def test_page_size_does_not_take_effect_on_an_existing_database(self):
        """The fact vacuum_page_size.py exists for: once a database has
        tables, PRAGMA page_size is a silent no-op, not an error -- this is
        what makes a full rebuild the only way to change it."""
        store = SqliteStore(self.db_path, page_size=4096)
        store.initialize()
        store.close()

        reopened = SqliteStore(self.db_path, page_size=8192)
        reopened.initialize()
        try:
            self.assertEqual(reopened.connection.execute("PRAGMA page_size").fetchone()[0], 4096)
        finally:
            reopened.close()


class TestVacuumPageSize(unittest.TestCase):
    """rag/scripts/vacuum_page_size.py -- the migration path for a database
    that already has data at the wrong page size."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp.name) / "chunks.db"

    def tearDown(self):
        self.tmp.cleanup()

    def _seed(self, page_size: int) -> None:
        store = SqliteStore(self.db_path, page_size=page_size)
        store.initialize()
        store.upsert_document(document_id="D1", collection=PUBLIC_COLLECTION, title="Seed v. Data")
        ids = list(store.allocate_faiss_ids(2))
        store.replace_chunks("D1", PUBLIC_COLLECTION, [("alpha", 1), ("bravo", 1)], ids)
        store.close()

    def test_rebuild_changes_the_page_size_and_preserves_every_row(self):
        from rag.scripts.vacuum_page_size import current_page_size, rebuild_at_page_size

        self._seed(page_size=4096)
        self.assertEqual(current_page_size(self.db_path), 4096)

        rebuild_at_page_size(self.db_path, 8192)

        self.assertEqual(current_page_size(self.db_path), 8192)
        verify = SqliteStore(self.db_path)
        try:
            self.assertEqual(verify.stats()["chunk_count"], 2)
            ids = verify.connection.execute("SELECT faiss_id FROM chunks ORDER BY faiss_id").fetchall()
            record = verify.chunks_by_faiss_ids([r["faiss_id"] for r in ids])
            self.assertEqual(sorted(r.chunk_text for r in record.values()), ["alpha", "bravo"])
        finally:
            verify.close()
        # No stale WAL/SHM sidecars left over from the file this replaced.
        self.assertFalse(Path(str(self.db_path) + "-wal").exists())
        self.assertFalse(Path(str(self.db_path) + "-shm").exists())

    def test_rebuild_is_idempotent_when_already_at_the_target(self):
        from rag.scripts.vacuum_page_size import current_page_size, rebuild_at_page_size

        self._seed(page_size=8192)
        rebuild_at_page_size(self.db_path, 8192)  # would be a bug to call this, but must not corrupt
        self.assertEqual(current_page_size(self.db_path), 8192)
        verify = SqliteStore(self.db_path)
        try:
            self.assertEqual(verify.stats()["chunk_count"], 2)
        finally:
            verify.close()


# ─── chunk_text compression (PRODUCTION_TODO.md T16, step 1) ────────────────


class TestChunkTextCompression(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = SqliteStore(Path(self.tmp.name) / "chunks.db")
        self.store.initialize()

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def _document(self, document_id="D1", **kwargs):
        self.store.upsert_document(
            document_id=document_id,
            collection=kwargs.pop("collection", PUBLIC_COLLECTION),
            **kwargs,
        )

    def _insert_legacy_plain_text_chunk(self, document_id, chunk_index, faiss_id, text):
        """Write a chunk row the way every row looked before T16 -- chunk_text
        as a plain TEXT value, bypassing SqliteStore.replace_chunks (which now
        always compresses). Simulates a database from before this feature
        existed, which the compression backfill must still be able to reach.
        """
        with self.store.connection:
            self.store.connection.execute(
                "INSERT INTO chunks(chunk_id, document_id, collection, owner_id, "
                "chunk_index, chunk_text, page_number, faiss_id, created_at) "
                "VALUES (?,?,?,NULL,?,?,NULL,?,'now')",
                (f"{document_id}_{chunk_index}", document_id, PUBLIC_COLLECTION, chunk_index, text, faiss_id),
            )

    def test_chunk_text_round_trips_exactly_including_overlap_duplication(self):
        """Byte-exact round trip, including the kind of text CHUNK_OVERLAP
        produces: two chunks sharing a repeated substring, and non-ASCII text
        (Devanagari appears throughout the real corpus)."""
        self._document()
        shared = "the appellant's counsel submitted that the impugned order "
        texts = [
            shared + "was passed without jurisdiction.",
            shared + "was passed without jurisdiction. Further, it relied upon " + "न्याय",
            "",
            "a" * 5000,
        ]
        ids = list(self.store.allocate_faiss_ids(len(texts)))
        self.store.replace_chunks("D1", PUBLIC_COLLECTION, [(t, None) for t in texts], ids)

        # Stored as compressed blobs, not plain text.
        rows = self.store.connection.execute(
            "SELECT faiss_id, typeof(chunk_text) AS t FROM chunks ORDER BY faiss_id"
        ).fetchall()
        self.assertTrue(all(r["t"] == "blob" for r in rows), rows)

        hydrated = self.store.chunks_by_faiss_ids(ids)
        for text, faiss_id in zip(texts, ids):
            self.assertEqual(hydrated[faiss_id].chunk_text, text)

        by_document = dict(self.store.chunks_for_document("D1"))
        for text, faiss_id in zip(texts, ids):
            self.assertEqual(by_document[faiss_id], text)

    def test_compressed_storage_is_materially_smaller(self):
        """T16's actual point: legal-English chunk text compresses well."""
        self._document()
        # A realistic-shaped, repetitive 2KB chunk -- the corpus's actual unit.
        text = ("This Court, in exercise of its jurisdiction, holds that the "
                "impugned order suffers from a patent illegality. ") * 20
        ids = list(self.store.allocate_faiss_ids(1))
        self.store.replace_chunks("D1", PUBLIC_COLLECTION, [(text, None)], ids)

        stored = self.store.connection.execute(
            "SELECT chunk_text FROM chunks WHERE faiss_id = ?", (ids[0],)
        ).fetchone()["chunk_text"]
        self.assertLess(len(stored), len(text.encode("utf-8")) // 2)

    def test_search_lexical_still_matches_compressed_chunks(self):
        """FTS5 indexes the decompressed text (via the sync triggers' zstd
        decompress call), not the compressed bytes sitting in chunk_text."""
        self._document()
        ids = list(self.store.allocate_faiss_ids(1))
        self.store.replace_chunks(
            "D1", PUBLIC_COLLECTION, [("jurisdiction under Article 226", None)], ids
        )
        hits = self.store.search_lexical("jurisdiction", SearchFilter.everything(), 5)
        self.assertEqual([f for f, _ in hits], ids)

    def test_backfill_compresses_legacy_plain_text_rows(self):
        """The migration half of T16: rows written before this feature must
        end up compressed too, without a re-ingest, and stay correct in both
        the dense-hydration and lexical-search paths."""
        self._document()
        ids = list(self.store.allocate_faiss_ids(2))
        self._insert_legacy_plain_text_chunk("D1", 0, ids[0], "alpha legacy chunk")
        self._insert_legacy_plain_text_chunk("D1", 1, ids[1], "bravo legacy chunk")

        before = self.store.connection.execute(
            "SELECT typeof(chunk_text) AS t FROM chunks ORDER BY faiss_id"
        ).fetchall()
        self.assertTrue(all(r["t"] == "text" for r in before))

        self.store._ensure_zstd_dictionary()
        self.store._backfill_chunk_compression(batch_size=1)  # force more than one batch

        after = self.store.connection.execute(
            "SELECT typeof(chunk_text) AS t FROM chunks ORDER BY faiss_id"
        ).fetchall()
        self.assertTrue(all(r["t"] == "blob" for r in after))

        hydrated = self.store.chunks_by_faiss_ids(ids)
        self.assertEqual(hydrated[ids[0]].chunk_text, "alpha legacy chunk")
        self.assertEqual(hydrated[ids[1]].chunk_text, "bravo legacy chunk")

        # The UPDATE that compressed each row went through chunks_fts_update,
        # which re-derives the FTS entry from the *decompressed* new value --
        # so lexical search must still find both, not just the ones written
        # after this feature landed.
        hits = self.store.search_lexical("legacy", SearchFilter.everything(), 5)
        self.assertEqual(sorted(f for f, _ in hits), sorted(ids))

        # Idempotent and terminates: a second pass has nothing left to do and
        # must not rescan (marked done -- see the method's own docstring for
        # why that matters at scale).
        self.assertIsNotNone(self.store.get_meta("chunk_text_compression_done"))
        self.store._backfill_chunk_compression()

    def test_zstd_dictionary_trains_when_enough_samples_exist(self):
        """Enough pre-existing plain-text rows -> a real dictionary is
        trained, persisted, and used for subsequent compression."""
        self._document()
        ids = list(self.store.allocate_faiss_ids(40))
        for i, faiss_id in enumerate(ids):
            self._insert_legacy_plain_text_chunk(
                "D1", i, faiss_id,
                f"Judgment paragraph {i}: the tribunal considered the evidence on record.",
            )

        self.store._ensure_zstd_dictionary()

        self.assertIsNotNone(self.store._zstd_dict)
        self.assertEqual(self.store.get_meta("chunk_text_zstd_dict_trained"), "1")
        self.assertTrue(self.store.get_meta("chunk_text_zstd_dict_b64"))

        # New writes compress under the trained dictionary and still round-trip.
        new_ids = list(self.store.allocate_faiss_ids(1, private=False))
        self.store.replace_chunks("D1", PUBLIC_COLLECTION, [("fresh chunk", None)], new_ids)
        self.assertEqual(
            self.store.chunks_by_faiss_ids(new_ids)[new_ids[0]].chunk_text, "fresh chunk"
        )

    def test_zstd_dictionary_training_is_skipped_gracefully_with_too_few_samples(self):
        """A fresh or tiny database has nothing worth training a dictionary
        on. Compression must still work, just without one -- see T16's
        Change section on this being a legitimate degraded mode."""
        self._document()
        ids = list(self.store.allocate_faiss_ids(1))
        self._insert_legacy_plain_text_chunk("D1", 0, ids[0], "only one legacy chunk")

        self.store._ensure_zstd_dictionary()

        self.assertIsNone(self.store._zstd_dict)
        self.assertEqual(self.store.get_meta("chunk_text_zstd_dict_trained"), "1")
        self.assertEqual(self.store.get_meta("chunk_text_zstd_dict_b64"), "")

        # Compression without a dictionary still round-trips correctly.
        new_ids = list(self.store.allocate_faiss_ids(1))
        self.store.replace_chunks("D1", PUBLIC_COLLECTION, [("no dict chunk", None)], new_ids)
        self.assertEqual(
            self.store.chunks_by_faiss_ids(new_ids)[new_ids[0]].chunk_text, "no dict chunk"
        )

    def test_decode_chunk_text_passes_plain_strings_through_unchanged(self):
        """Defends the dual-format read path directly: a value that is
        already plain text (a row the backfill has not reached yet, or one a
        test/incident inserted by hand) is returned as-is, not fed to zstd."""
        self.assertEqual(self.store.decode_chunk_text("already plain"), "already plain")


# ─── Lexical (BM25/FTS5) retrieval lane (PRODUCTION_TODO.md T7) ──────────────


class TestLexicalSearch(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = SqliteStore(Path(self.tmp.name) / "chunks.db")
        self.store.initialize()

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def _document(self, document_id="D1", **kwargs):
        self.store.upsert_document(
            document_id=document_id,
            collection=kwargs.pop("collection", PUBLIC_COLLECTION),
            **kwargs,
        )

    def test_search_lexical_finds_exact_citation_text(self):
        self._document("PUB1", title="X v. Y", court="sci")
        ids = list(self.store.allocate_faiss_ids(2))
        self.store.replace_chunks(
            "PUB1",
            PUBLIC_COLLECTION,
            [
                (
                    "The bench in 2019 SCC OnLine SC 1234 held that limitation "
                    "runs from the date of knowledge.",
                    None,
                ),
                ("This paragraph discusses unrelated procedural costs.", None),
            ],
            ids,
        )
        hits = self.store.search_lexical("2019 SCC OnLine SC 1234", SearchFilter.public(), 5)
        self.assertTrue(hits)
        self.assertEqual(hits[0][0], ids[0])

    def test_search_lexical_respects_owner_scoping(self):
        """The exact security property T7 names: an owner must never see
        another owner's chunk through FTS, even sharing every keyword."""
        self._document("A1", collection=USER_COLLECTION, corpus_id="C1", clerk_uid="U1")
        self._document("B1", collection=USER_COLLECTION, corpus_id="C2", clerk_uid="U2")
        ids_a = list(self.store.allocate_faiss_ids(1, private=True))
        ids_b = list(self.store.allocate_faiss_ids(1, private=True))
        self.store.replace_chunks("A1", USER_COLLECTION, [("shared secret keyword alpha", None)], ids_a)
        self.store.replace_chunks("B1", USER_COLLECTION, [("shared secret keyword bravo", None)], ids_b)

        scope = SearchFilter.owned_by(self.store.faiss_ids_for_owner("U1"))
        hits = self.store.search_lexical("shared secret keyword", scope, 10)
        self.assertEqual([faiss_id for faiss_id, _ in hits], list(ids_a))

    def test_search_lexical_empty_allow_list_returns_nothing(self):
        """An empty allow-list must never widen into an unfiltered FTS scan."""
        self._document("PUB1")
        ids = list(self.store.allocate_faiss_ids(1))
        self.store.replace_chunks("PUB1", PUBLIC_COLLECTION, [("anything at all", None)], ids)

        self.assertEqual(
            self.store.search_lexical("anything", SearchFilter.owned_by([]), 10), []
        )

    def test_search_lexical_tolerates_fts5_operator_characters_in_the_query(self):
        """A citation carries punctuation FTS5's own query syntax uses for
        something else (':' for a column filter, '(' unbalanced, '-' for
        NOT). The match expression must treat it as literal text, not raise."""
        self._document("PUB1")
        ids = list(self.store.allocate_faiss_ids(1))
        self.store.replace_chunks(
            "PUB1", PUBLIC_COLLECTION, [("Section 138(1)(a) Negotiable Instruments Act", None)], ids
        )
        hits = self.store.search_lexical(
            "Section 138(1)(a) Negotiable Instruments Act", SearchFilter.public(), 5
        )
        self.assertEqual([faiss_id for faiss_id, _ in hits], ids)

    def test_fts_backfill_indexes_rows_that_predate_the_table(self):
        """Simulates a database that had chunks before chunks_fts existed --
        the sync triggers already cover writes going forward, but rows
        written earlier only get indexed by the resumable backfill."""
        self._document("PUB1")
        ids = list(self.store.allocate_faiss_ids(3))
        self.store.replace_chunks(
            "PUB1",
            PUBLIC_COLLECTION,
            [("alpha one", None), ("bravo two", None), ("charlie three", None)],
            ids,
        )
        rows = self.store.connection.execute(
            "SELECT rowid, chunk_text FROM chunks ORDER BY rowid"
        ).fetchall()
        self.assertEqual(len(rows), 3)

        # The insert trigger already synced these; wipe the FTS side to
        # reproduce "written before chunks_fts existed". Uses FTS5's
        # 'delete-all' special command rather than a bare DELETE: since T16,
        # chunks.chunk_text holds compressed bytes, and a bare DELETE FROM an
        # external-content fts5 table re-tokenizes the *current* content-table
        # value to find what to remove -- which is exactly the compressed
        # bytes, not the plain text that was actually indexed. 'delete-all'
        # resets the shadow index directly and never reads the content table.
        self.store.connection.execute("INSERT INTO chunks_fts(chunks_fts) VALUES ('delete-all')")
        self.store.connection.commit()
        self.store.set_meta("fts_backfill_rowid", "0")

        self.store._backfill_fts(batch_size=1)  # force more than one batch

        for text, faiss_id in (("alpha", ids[0]), ("bravo", ids[1]), ("charlie", ids[2])):
            hits = self.store.search_lexical(text, SearchFilter.everything(), 5)
            self.assertEqual([f for f, _ in hits], [faiss_id])

    def test_fts_backfill_resumes_from_its_watermark_without_duplicating(self):
        """A watermark already past the first row must skip it, not re-index
        or duplicate it -- the resumability the backfill exists for."""
        self._document("PUB1")
        ids = list(self.store.allocate_faiss_ids(2))
        self.store.replace_chunks(
            "PUB1", PUBLIC_COLLECTION, [("alpha one", None), ("bravo two", None)], ids
        )
        rows = self.store.connection.execute(
            "SELECT rowid FROM chunks ORDER BY rowid"
        ).fetchall()

        # See the sibling test above for why 'delete-all' and not a bare DELETE.
        self.store.connection.execute("INSERT INTO chunks_fts(chunks_fts) VALUES ('delete-all')")
        self.store.connection.commit()
        self.store.set_meta("fts_backfill_rowid", str(rows[0]["rowid"]))

        self.store._backfill_fts()

        self.assertEqual(self.store.search_lexical("alpha", SearchFilter.everything(), 5), [])
        hits = self.store.search_lexical("bravo", SearchFilter.everything(), 5)
        self.assertEqual([f for f, _ in hits], [ids[1]])

        # Idempotent: running it again with nothing left to do must not raise.
        self.store._backfill_fts()

    def test_chunk_deletion_removes_it_from_the_lexical_index(self):
        self._document("PUB1")
        ids = list(self.store.allocate_faiss_ids(1))
        self.store.replace_chunks("PUB1", PUBLIC_COLLECTION, [("findable phrase", None)], ids)
        self.assertTrue(self.store.search_lexical("findable", SearchFilter.everything(), 5))

        self.store.delete_documents(PUBLIC_COLLECTION, document_id="PUB1")
        self.assertEqual(self.store.search_lexical("findable", SearchFilter.everything(), 5), [])


# ─── LMDB ────────────────────────────────────────────────────────────────────


class TestHashIndex(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.index = HashIndex(Path(self.tmp.name) / "hashdb").open()

    def tearDown(self):
        self.index.close()
        self.tmp.cleanup()

    def test_roundtrip(self):
        self.index.put("a" * 64, "DOC1", file_path="sci/2026/x.pdf", court="sci")
        entry = self.index.get("a" * 64)
        self.assertEqual(entry.document_id, "DOC1")
        self.assertEqual(entry.file_path, "sci/2026/x.pdf")
        self.assertEqual(entry.court, "sci")

    def test_legacy_bare_document_id_values_still_read(self):
        """Values written before the JSON format must not need a migration."""
        self.assertEqual(HashEntry.parse(b"LEGACYDOCID").document_id, "LEGACYDOCID")

    def test_missing_hash_reads_as_absent(self):
        self.assertFalse(self.index.exists("b" * 64))
        self.assertIsNone(self.index.get("b" * 64))


# ─── FAISS ───────────────────────────────────────────────────────────────────


class TestVectorIndex(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.embedder = DeterministicEmbedder(dimension=32)
        self.registry = VectorIndexRegistry(self.root, dimension=32, signature="test@32")
        self.registry.load_all()

    def tearDown(self):
        self.registry.close()
        self.tmp.cleanup()

    def _seed(self):
        index = self.registry.get(PUBLIC_COLLECTION)
        texts = ["alpha bravo", "charlie delta", "echo foxtrot"]
        index.add([101, 102, 103], self.embedder.embed_documents(texts))
        return index

    def test_empty_allowlist_returns_nothing_rather_than_everything(self):
        """The isolation guarantee: a filter matching nothing must not widen."""
        index = self._seed()
        self.assertEqual(index.search(self.embedder.embed_query("alpha"), 3, allowed_ids=[]), [])

    def test_allowlist_restricts_results(self):
        index = self._seed()
        hits = index.search(self.embedder.embed_query("alpha bravo"), 3, allowed_ids=[102, 103])
        self.assertTrue(hits)
        self.assertTrue(all(hit.faiss_id in (102, 103) for hit in hits))

    def test_survives_reload(self):
        self._seed().flush()
        reopened = VectorIndexRegistry(self.root, dimension=32, signature="test@32")
        reopened.load_all()
        self.assertEqual(reopened.get(PUBLIC_COLLECTION).ntotal, 3)
        reopened.close()

    def test_refuses_an_index_built_by_a_different_model(self):
        """Mixing vector spaces does not error at query time -- it returns nonsense."""
        self._seed().flush()
        other = VectorIndexRegistry(self.root, dimension=32, signature="other-model@32")
        with self.assertRaises(RuntimeError):
            other.get(PUBLIC_COLLECTION)

    def test_refuses_an_index_built_by_a_different_factory(self):
        """PRODUCTION_TODO.md T5a: changing FAISS_INDEX_FACTORY without a
        rebuild used to be a silent no-op -- load() never looked at it."""
        self._seed().flush()
        other = VectorIndexRegistry(
            self.root, dimension=32, signature="test@32", index_factory="OPQ4_32,IVF16,PQ4np"
        )
        with self.assertRaises(RuntimeError):
            other.get(PUBLIC_COLLECTION)

    def test_an_index_predating_the_recorded_factory_warns_but_still_loads(self):
        """An older index has no index_factory in its sidecar at all -- that
        must not become a refused start; there is nothing to compare against."""
        index = self._seed()
        index.flush()
        meta = json.loads(index.meta_path.read_text())
        del meta["index_factory"]
        index.meta_path.write_text(json.dumps(meta))
        index.close()

        reopened = VectorIndexRegistry(self.root, dimension=32, signature="test@32")
        # Must not raise -- the whole point of the "predates the field" case.
        self.assertEqual(reopened.get(PUBLIC_COLLECTION).ntotal, 3)
        reopened.close()

    def test_removal_is_by_id(self):
        index = self._seed()
        self.assertEqual(index.remove([102]), 1)
        self.assertEqual(index.ntotal, 2)
        hits = index.search(self.embedder.embed_query("charlie delta"), 3)
        self.assertNotIn(102, [hit.faiss_id for hit in hits])

    def test_a_second_writer_is_refused_not_silently_clobbered(self):
        """Two VectorIndex handles on the same path, as two processes would
        have -- the second writer must raise on its first write, not corrupt
        the index. See PRODUCTION_TODO.md T2."""
        self._seed().flush()

        second = VectorIndexRegistry(self.root, dimension=32, signature="test@32")
        second_index = second.get(PUBLIC_COLLECTION)
        with self.assertRaises(RuntimeError):
            second_index.add([104], self.embedder.embed_documents(["golf hotel"]))
        second.close()  # must not itself raise trying to flush a failed write

        # The lock's holder is unaffected and the refused writer left no trace.
        self.assertEqual(self.registry.get(PUBLIC_COLLECTION).ntotal, 3)
        self.registry.get(PUBLIC_COLLECTION).add([104], self.embedder.embed_documents(["golf hotel"]))
        self.assertEqual(self.registry.get(PUBLIC_COLLECTION).ntotal, 4)

    def test_a_read_only_process_never_contends_for_the_write_lock(self):
        """A process that only ever loads and searches an existing index must
        not need the write lock its shutdown-time flush would otherwise try
        to acquire -- that would make search fail whenever the real writer
        (the ingest worker) is active. See PRODUCTION_TODO.md T2."""
        self._seed().flush()

        reader = VectorIndexRegistry(self.root, dimension=32, signature="test@32")
        reader.load_all()
        reader.close()  # must not raise, even though `self.registry` holds the lock

        self.assertEqual(self.registry.get(PUBLIC_COLLECTION).ntotal, 3)

    def test_bulk_ingest_writes_the_index_file_far_fewer_times_than_it_adds(self):
        """PRODUCTION_TODO.md T8: flush_every=1 makes every add() rewrite the
        whole file -- O(n) bytes written per vector, O(n^2) for the run. The
        adaptive threshold (floor at flush_every, ~1% of ntotal above that)
        must write far fewer times than there are adds."""
        registry = VectorIndexRegistry(
            self.root, dimension=32, signature="bulk@32", flush_every=50, flush_max=1000
        )
        index = registry.get(PUBLIC_COLLECTION)
        write_count = 0
        import faiss as faiss_module

        real_write_index = faiss_module.write_index

        def counting_write_index(idx, path):
            nonlocal write_count
            write_count += 1
            return real_write_index(idx, path)

        with mock.patch("faiss.write_index", side_effect=counting_write_index):
            for i in range(300):
                index.add([200 + i], self.embedder.embed_documents([f"bulk doc {i}"]))
        registry.close()

        self.assertLess(write_count, 30, f"expected far fewer than 300 writes, got {write_count}")
        reopened = VectorIndexRegistry(self.root, dimension=32, signature="bulk@32")
        reopened.load_all()
        self.assertEqual(reopened.get(PUBLIC_COLLECTION).ntotal, 300)
        reopened.close()

    def test_effective_flush_threshold_rises_with_ntotal_but_caps_at_flush_max(self):
        """PRODUCTION_TODO.md T8: floor at flush_every, ~1% of ntotal above
        that, capped at flush_max regardless of how large the index gets. A
        caller-supplied flush_every above flush_max -- rebuild_index.py's
        staging index passes 10**9 to defer every flush to one explicit call
        at the end -- must never be lowered by the cap."""

        class _FakeIndex:
            def __init__(self, ntotal):
                self.ntotal = ntotal

        index = VectorIndex(
            collection=PUBLIC_COLLECTION,
            path=self.root / "threshold_test.faiss",
            dimension=32,
            signature="threshold@32",
            flush_every=1000,
            flush_max=100_000,
        )

        # Small corpus: 1% (500) is under the floor, so the floor wins.
        index._index = _FakeIndex(50_000)
        self.assertEqual(index._effective_flush_threshold(), 1000)

        # Large enough that 1% (50,000) exceeds the floor but stays under the
        # ceiling.
        index._index = _FakeIndex(5_000_000)
        self.assertEqual(index._effective_flush_threshold(), 50_000)

        # Past the point where 1% would exceed flush_max (500,000) -- capped,
        # not unbounded.
        index._index = _FakeIndex(50_000_000)
        self.assertEqual(index._effective_flush_threshold(), 100_000)

        sentinel = VectorIndex(
            collection=PUBLIC_COLLECTION,
            path=self.root / "sentinel_test.faiss",
            dimension=32,
            signature="threshold@32",
            flush_every=10**9,
        )
        sentinel._index = _FakeIndex(50_000_000)
        self.assertEqual(sentinel._effective_flush_threshold(), 10**9)

    def test_too_small_a_batch_to_train_is_refused_with_the_rebuild_hint(self):
        """PRODUCTION_TODO.md T9a: the old guard read `nlist` off the SWIG
        base `faiss::Index` pointer via `self.index.index`, which never has
        the attribute regardless of the real factory, so `needed` was always
        1 and the check never fired. The first add() on an untrained IVF
        index hit a raw FAISS Clustering.cpp assertion instead of this
        message."""
        registry = VectorIndexRegistry(
            self.root, dimension=32, signature="ivf@32", index_factory="IVF16,Flat"
        )
        index = registry.get(PUBLIC_COLLECTION)
        small_batch = np.random.default_rng(0).random((5, 32)).astype("float32")

        with self.assertRaises(RuntimeError) as ctx:
            index.add([1, 2, 3, 4, 5], small_batch)

        self.assertIn("rebuild_index.py", str(ctx.exception))
        self.assertNotIn("Clustering.cpp", str(ctx.exception))
        registry.close()

    def test_the_guard_requires_faiss_recommended_minimum_not_just_nlist(self):
        """A batch that clears nlist (16) but not 39x nlist (624) must still
        be refused -- below that FAISS only warns and trains a degenerate
        quantizer instead of raising, so letting this batch through would
        train silently rather than loudly."""
        registry = VectorIndexRegistry(
            self.root, dimension=32, signature="ivf@32", index_factory="IVF16,Flat"
        )
        index = registry.get(PUBLIC_COLLECTION)
        batch = np.random.default_rng(0).random((20, 32)).astype("float32")

        with self.assertRaises(RuntimeError):
            index.add(list(range(1, 21)), batch)

        registry.close()

    def test_a_batch_clearing_the_recommended_minimum_trains_successfully(self):
        """The positive case: once a guard exists it must not also refuse a
        batch that is actually large enough."""
        registry = VectorIndexRegistry(
            self.root, dimension=32, signature="ivf@32", index_factory="IVF16,Flat"
        )
        index = registry.get(PUBLIC_COLLECTION)
        batch = np.random.default_rng(0).random((700, 32)).astype("float32")

        index.add(list(range(1, 701)), batch)

        self.assertEqual(index.ntotal, 700)
        self.assertTrue(index.index.is_trained)
        registry.close()

    def test_ivf_list_stats_is_none_for_a_flat_factory(self):
        """Flat has no inverted lists to imbalance -- there is nothing to
        report, not a zeroed-out stats dict."""
        index = self._seed()
        self.assertIsNone(index.ivf_list_stats())
        self.assertIsNone(index.drift_stats())

    def test_quantizer_drift_appears_after_adding_a_shifted_distribution(self):
        """PRODUCTION_TODO.md T9b: train an IVF index on one distribution,
        add a second, unrelated one, and the list-imbalance and
        growth-since-training drift signals must both show it."""
        registry = VectorIndexRegistry(
            self.root, dimension=32, signature="drift@32", index_factory="IVF16,Flat"
        )
        index = registry.get(PUBLIC_COLLECTION)

        # Uniform in [0, 1)^32 -- k-means over 16 centroids on this spreads
        # roughly evenly, so list sizes start out close to balanced.
        rng = np.random.default_rng(0)
        initial = rng.random((700, 32)).astype("float32")
        index.add(list(range(1, 701)), initial)

        before = index.drift_stats()
        self.assertIsNotNone(before)
        self.assertEqual(before["trained_at_ntotal"], 700)
        self.assertEqual(before["added_since_training"], 0)
        self.assertEqual(before["added_since_training_pct"], 0.0)
        # Not asserting "ok" outright -- k-means on a small random sample can
        # be somewhat uneven -- only that it starts well under the threshold
        # the shifted batch below is designed to blow past.
        self.assertLess(before["max_mean_ratio"], 5)

        # Tightly clustered, and far outside the training distribution's
        # range -- nearest to only one or two of the trained centroids, so
        # (almost) all of it lands in a small number of lists.
        shift_rng = np.random.default_rng(1)
        shifted = (10.0 + shift_rng.random((2000, 32)) * 0.01).astype("float32")
        index.add(list(range(701, 2701)), shifted)

        after = index.drift_stats()
        self.assertEqual(after["trained_at_ntotal"], 700)
        self.assertEqual(after["added_since_training"], 2000)
        self.assertAlmostEqual(after["added_since_training_pct"], 2000 / 700 * 100, places=1)
        self.assertGreater(after["max_mean_ratio"], before["max_mean_ratio"])
        self.assertGreater(after["max_mean_ratio"], 10)

        from app.health_routes import _quantizer_drift_severity

        self.assertEqual(_quantizer_drift_severity(after), "degraded")
        registry.close()

    def test_drift_survives_reload_from_the_sidecar(self):
        """`trained_at_ntotal`/`training_date_range` are written to the meta
        sidecar and must be readable back after a restart -- a process that
        only ever loads an already-trained index still needs them to report
        drift."""
        registry = VectorIndexRegistry(
            self.root, dimension=32, signature="drift-reload@32", index_factory="IVF16,Flat"
        )
        index = registry.get(PUBLIC_COLLECTION)
        batch = np.random.default_rng(0).random((700, 32)).astype("float32")
        index.train(batch, trained_at_ntotal=700, training_date_range=("1998", "2024"))
        index.add(list(range(1, 701)), batch)
        index.flush()
        registry.close()

        reopened = VectorIndexRegistry(
            self.root, dimension=32, signature="drift-reload@32", index_factory="IVF16,Flat"
        )
        reloaded = reopened.get(PUBLIC_COLLECTION)
        self.assertEqual(reloaded.trained_at_ntotal, 700)
        self.assertEqual(reloaded.training_date_range, ("1998", "2024"))
        drift = reloaded.drift_stats()
        self.assertEqual(drift["trained_at_ntotal"], 700)
        self.assertEqual(drift["training_date_range"], ["1998", "2024"])
        reopened.close()

    def test_mmap_and_non_mmap_readers_return_identical_results(self):
        """PRODUCTION_TODO.md T17: IO_FLAG_MMAP changes how the index's bytes
        get into memory, not what a query returns."""
        self._seed().flush()
        query = self.embedder.embed_query("alpha bravo")

        mmap_registry = VectorIndexRegistry(self.root, dimension=32, signature="test@32", mmap=True)
        plain_registry = VectorIndexRegistry(self.root, dimension=32, signature="test@32", mmap=False)
        try:
            mmap_hits = mmap_registry.get(PUBLIC_COLLECTION).search(query, 3)
            plain_hits = plain_registry.get(PUBLIC_COLLECTION).search(query, 3)
            self.assertTrue(mmap_hits)
            self.assertEqual(
                [(hit.faiss_id, round(hit.score, 6)) for hit in mmap_hits],
                [(hit.faiss_id, round(hit.score, 6)) for hit in plain_hits],
            )
        finally:
            mmap_registry.close()
            plain_registry.close()

    def test_mmap_reader_reloads_a_writers_flush_without_restarting(self):
        """The hazard T17 introduces if left unfixed: `flush()`'s `os.replace`
        swaps a directory entry, not a mapping this process already opened.
        Reproduced on faiss 1.15.0 before VectorIndex._maybe_reload existed:
        a reader opened at ntotal 2000 kept reporting 2000, and could not see
        an id the writer added past that point -- silently and permanently,
        until the reader process restarted. A search must pick up a new
        generation instead."""
        writer = self._seed()
        writer.flush()

        reader_registry = VectorIndexRegistry(self.root, dimension=32, signature="test@32", mmap=True)
        reader_registry.load_all()
        reader = reader_registry.get(PUBLIC_COLLECTION)
        try:
            self.assertEqual(reader.ntotal, 3)

            # A second process's write, from the reader's point of view.
            writer.add([104], self.embedder.embed_documents(["golf hotel"]))
            writer.flush()

            # Stale until something checks -- ntotal alone never triggers a
            # reload, only search() does.
            self.assertEqual(reader.ntotal, 3)

            # Force the throttle interval to 0 so the very next search checks
            # immediately, rather than a real test sleeping past
            # _RELOAD_CHECK_INTERVAL_SECONDS.
            with mock.patch("rag.core.vector_index._RELOAD_CHECK_INTERVAL_SECONDS", 0):
                hits = reader.search(self.embedder.embed_query("golf hotel"), 4)

            self.assertEqual(reader.ntotal, 4)
            self.assertIn(104, [hit.faiss_id for hit in hits])
        finally:
            reader_registry.close()

    def test_reload_check_is_throttled_between_searches(self):
        """A `stat()`-and-maybe-reload on every single query would cost a
        syscall per request for no benefit between flushes -- the check must
        be throttled, not run unconditionally."""
        self._seed().flush()
        reader_registry = VectorIndexRegistry(self.root, dimension=32, signature="test@32", mmap=True)
        reader_registry.load_all()
        reader = reader_registry.get(PUBLIC_COLLECTION)
        try:
            query = self.embedder.embed_query("alpha")
            reader.search(query, 3)  # first search always checks -- see _last_reload_check's 0.0 default
            first_check = reader._last_reload_check
            self.assertGreater(first_check, 0.0)

            reader.search(query, 3)  # microseconds later, well inside the throttle window
            self.assertEqual(
                reader._last_reload_check, first_check,
                "a second search inside the throttle window re-checked the sidecar",
            )
        finally:
            reader_registry.close()




class TestIngestJobQueue(RagStackTestCase):
    """The API-enqueue / worker-processes contract from PRODUCTION_TODO.md T2.

    Drives the real worker functions directly against a manifest written the
    same way ``app.rag_routes._enqueue_ingest`` writes one, rather than going
    through FastAPI -- the API layer's only job is spooling the file and
    creating the job row, and that's cheap to reproduce here without a test
    client.
    """

    def _enqueue(self, text: str, *, filename: str = "doc.txt", **manifest_overrides) -> tuple[str, str]:
        import uuid as uuid_module

        from rag.scripts.ingest_worker import MANIFEST_FILENAME

        job_id = uuid_module.uuid4().hex
        document_id = manifest_overrides.pop("document_id", uuid_module.uuid4().hex)
        job_dir = self.config.inbox_root / "api" / job_id
        job_dir.mkdir(parents=True, exist_ok=True)

        dest = job_dir / f"000_{filename}"
        dest.write_text(text, encoding="utf-8")
        # Past the worker's 5s "still being written" settle window, which a
        # file written moments ago in a fast test would otherwise sit inside.
        stale = time.time() - 10
        os.utime(dest, (stale, stale))

        manifest = {
            "job_id": job_id,
            "document_id": document_id,
            "paths": [dest.name],
            "collection": None,
            "extra_metadata": {},
            "dedupe_scope": "",
            "persist_source": True,
            "court_hint": None,
        }
        manifest.update(manifest_overrides)
        (job_dir / MANIFEST_FILENAME).write_text(json.dumps(manifest), encoding="utf-8")
        self.services.metadata.create_ingest_job(job_id, filename=filename)
        return job_id, document_id

    def _drain(self):
        from rag.scripts import ingest_worker

        return ingest_worker._drain(self.services, self.config.inbox_root, PUBLIC_COLLECTION, 0)

    def test_a_manifest_job_is_processed_and_the_job_row_completes(self):
        job_id, document_id = self._enqueue(JUDGMENT, filename="judgment.txt")

        self.assertEqual(self._drain(), 1)

        job = self.services.metadata.get_ingest_job(job_id)
        self.assertEqual(job["status"], "complete")
        self.assertEqual(job["document_id"], document_id)
        self.assertGreater(job["result"]["chunk_count"], 0)
        self.assertIsNotNone(self.services.metadata.get_document(document_id))
        # Consumed: the job directory (file and manifest both) is gone.
        self.assertFalse((self.config.inbox_root / "api").exists())

    def test_a_duplicate_manifest_job_is_reported_not_left_queued(self):
        _, first_document_id = self._enqueue(JUDGMENT, filename="a.txt")
        self._drain()

        second_job_id, _ = self._enqueue(JUDGMENT, filename="b.txt")
        self._drain()

        job = self.services.metadata.get_ingest_job(second_job_id)
        self.assertEqual(job["status"], "duplicate")
        self.assertEqual(job["document_id"], first_document_id)

    def test_a_failed_job_is_reported_not_left_queued(self):
        # No extractable text -- the pipeline raises ValueError before it ever
        # reaches a document row.
        job_id, _ = self._enqueue("   \n  \n", filename="blank.txt")

        self._drain()

        job = self.services.metadata.get_ingest_job(job_id)
        self.assertEqual(job["status"], "failed")
        self.assertTrue(job["error"])
        # Quarantined, not left in the inbox to be retried forever on a loop.
        self.assertTrue(
            list((self.config.inbox_root / ".failed").rglob("*_blank.txt"))
        )

    def test_an_organic_inbox_drop_is_unaffected_by_manifest_handling(self):
        """A file with no manifest -- a human dropping a court folder into the
        inbox -- must still be identified and filed exactly as before."""
        organic = self.config.inbox_root / "sci" / "judgment.txt"
        organic.parent.mkdir(parents=True, exist_ok=True)
        organic.write_text(JUDGMENT, encoding="utf-8")
        stale = time.time() - 10
        os.utime(organic, (stale, stale))

        self.assertEqual(self._drain(), 1)

        record = self.services.metadata.get_document("inbox:sci/judgment.txt")
        self.assertIsNotNone(record)
        self.assertEqual(record.court, "sci")
        self.assertFalse(organic.exists())


class TestIngestWorkerScan(RagStackTestCase):
    """PRODUCTION_TODO.md T11a: the inbox scan must be bounded, and an
    operator-notes directory must never be read as a corpus drop."""

    def _drop(self, relative: str, text: str = "note") -> Path:
        path = self.config.inbox_root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        # Past the worker's 5s "still being written" settle window.
        stale = time.time() - 10
        os.utime(path, (stale, stale))
        return path

    def test_pending_files_stops_scanning_once_the_limit_is_reached(self):
        """A directory that sorts after enough files already satisfy `limit`
        must never be entered at all -- the scan cost must not depend on how
        much is sitting further down the tree."""
        from rag.scripts import ingest_worker

        for i in range(3):
            self._drop(f"doc{i}.txt", f"document {i}")
        # Sorts after "doc0".."doc2" by name, so a depth-first, name-ordered
        # walk would only reach it after the limit is already satisfied by
        # the three files above.
        self._drop("zzz_heavy/should_not_be_scanned.txt", "should never be read")

        scanned_dirs = []
        real_scandir = os.scandir

        def spy_scandir(path):
            scanned_dirs.append(str(path))
            return real_scandir(path)

        with mock.patch("rag.scripts.ingest_worker.os.scandir", side_effect=spy_scandir):
            result = ingest_worker._pending_files(self.config.inbox_root, limit=3)

        self.assertEqual(len(result), 3)
        self.assertFalse(any("zzz_heavy" in d for d in scanned_dirs))

    def test_pending_files_limit_zero_is_unbounded(self):
        from rag.scripts import ingest_worker

        for i in range(5):
            self._drop(f"doc{i}.txt", f"document {i}")

        result = ingest_worker._pending_files(self.config.inbox_root, limit=0)
        self.assertEqual(len(result), 5)

    def test_notes_directory_is_never_ingested(self):
        from rag.scripts import ingest_worker

        self._drop("notes/README.md", "operator scratch notes, not a judgment")

        self.assertEqual(ingest_worker._pending_files(self.config.inbox_root), [])

    def test_ingestignore_adds_more_skipped_directories(self):
        from rag.scripts import ingest_worker

        self._drop("scratch/draft.txt", "work in progress")
        self._drop("sci/judgment.txt", JUDGMENT)
        (self.config.inbox_root / ingest_worker.INGESTIGNORE_FILENAME).write_text(
            "# operator scratch area, not a corpus drop\nscratch\n", encoding="utf-8"
        )

        result = ingest_worker._pending_files(self.config.inbox_root)

        self.assertEqual([p.name for p in result], ["judgment.txt"])

    def test_drain_flushes_every_faiss_flush_every_documents_not_only_at_pass_end(self):
        """A worker killed mid-pass must lose at most FAISS_FLUSH_EVERY
        documents' vectors, not everything back to the previous pass."""
        from rag.scripts import ingest_worker

        # RagStackTestCase (and its self.services, still open) pins
        # FAISS_FLUSH_EVERY=1 so every other test's on-disk assertions see
        # synchronous writes; this test is specifically about the >1 cadence,
        # so it needs its own config *and* its own DATA_ROOT -- LMDB refuses
        # to open the same environment path twice in one process (see
        # TestBackups's Result for T2a, same constraint).
        second_root = Path(tempfile.mkdtemp(prefix="rag_test_flush_"))
        env = {
            "DATA_ROOT": str(second_root),
            "EMBED_MODEL": "deterministic-test",
            "EMBED_DIM": "64",
            "PARSER_BACKEND": "pypdfium",
            "FAISS_FLUSH_EVERY": "2",
        }
        previous = {k: os.environ.get(k) for k in env}
        os.environ.update(env)
        try:
            config = RagConfig.from_env()
        finally:
            for key, value in previous.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

        set_config(config)
        services = services_module.build_services(
            config, embedder=DeterministicEmbedder(dimension=config.embed_dim)
        )
        services_module.startup(services)
        try:
            for i in range(5):
                path = config.inbox_root / f"doc{i}.txt"
                path.write_text(f"{JUDGMENT}\nunique marker {i}", encoding="utf-8")
                stale = time.time() - 10
                os.utime(path, (stale, stale))

            flush_ntotals = []
            real_flush_all = services.indexes.flush_all

            def spy_flush_all():
                real_flush_all()
                flush_ntotals.append(services.indexes.get(PUBLIC_COLLECTION).ntotal)

            with mock.patch.object(services.indexes, "flush_all", side_effect=spy_flush_all):
                processed = ingest_worker._drain(services, config.inbox_root, PUBLIC_COLLECTION, 0)

            self.assertEqual(processed, 5)
            # Mid-pass flushes after documents 2 and 4, plus the existing
            # end-of-pass flush: 3 calls, not 1.
            self.assertEqual(len(flush_ntotals), 3)
            self.assertTrue(flush_ntotals[0] > 0)
        finally:
            services_module.shutdown(services)
            set_config(self.config)
            shutil.rmtree(second_root, ignore_errors=True)


# ─── Pipeline ────────────────────────────────────────────────────────────────


class TestIngestionPipeline(RagStackTestCase):
    def test_ingest_populates_all_three_stores(self):
        path = self._document("judgment.txt", JUDGMENT)
        result = self._pipeline().ingest(path, document_id="DOC1").to_dict()

        self.assertFalse(result["skipped"])
        self.assertEqual(result["court"], "sci")
        self.assertEqual(result["citation"], "2026 INSC 793")
        self.assertEqual(result["date"], "2026-03-12")

        self.assertEqual(self.services.metadata.stats()["document_count"], 1)
        self.assertEqual(self.services.indexes.get(PUBLIC_COLLECTION).ntotal, result["chunk_count"])
        self.assertEqual(self.services.hashes.count(), 1)

        record = self.services.metadata.get_document("DOC1")
        self.assertEqual(record.status, STATUS_COMPLETE)
        self.assertTrue(record.file_path.startswith("sci/2026/"))

    def test_source_is_archived_under_the_court_layout(self):
        path = self._document("judgment.txt", JUDGMENT)
        result = self._pipeline().ingest(path, document_id="DOC1").to_dict()
        archived = self.config.pdf_root / result["storage_ref"]
        self.assertTrue(archived.is_file())
        self.assertEqual(archived.read_text(), JUDGMENT)

    def test_file_path_is_relative_so_the_volume_can_move(self):
        path = self._document("judgment.txt", JUDGMENT)
        self._pipeline().ingest(path, document_id="DOC1")
        record = self.services.metadata.get_document("DOC1")
        self.assertFalse(Path(record.file_path).is_absolute())
        self.assertNotIn(str(self.root), record.file_path)

    def test_identical_bytes_are_skipped_before_any_parsing(self):
        path = self._document("judgment.txt", JUDGMENT)
        pipeline = self._pipeline()
        pipeline.ingest(path, document_id="DOC1")

        result = pipeline.ingest(path, document_id="DOC2").to_dict()
        self.assertTrue(result["skipped"])
        self.assertEqual(result["existing_document_id"], "DOC1")
        self.assertEqual(self.services.metadata.stats()["document_count"], 1)

    def test_dedupe_scope_lets_two_advocates_index_the_same_file(self):
        path = self._document("lease.txt", "Confidential lease for Connaught Place. secretalpha")
        pipeline = self._pipeline()
        first = pipeline.ingest(
            path, document_id="A1", collection=USER_COLLECTION,
            extra_metadata={"corpus_id": "C1", "clerk_uid": "U1"},
            dedupe_scope="C1", persist_source=False,
        )
        second = pipeline.ingest(
            path, document_id="B1", collection=USER_COLLECTION,
            extra_metadata={"corpus_id": "C2", "clerk_uid": "U2"},
            dedupe_scope="C2", persist_source=False,
        )
        self.assertFalse(first.skipped)
        self.assertFalse(second.skipped)

    def test_private_documents_are_not_written_to_the_public_archive(self):
        path = self._document("lease.txt", "Confidential lease. secretalpha")
        self._pipeline().ingest(
            path, document_id="A1", collection=USER_COLLECTION,
            extra_metadata={"corpus_id": "C1", "clerk_uid": "U1"},
            dedupe_scope="C1", persist_source=False,
        )
        self.assertEqual(list(self.config.pdf_root.rglob("*.txt")), [])

    def test_a_failed_ingest_records_why_and_does_not_commit(self):
        path = self._document("blank.txt", "   \n  \n")
        with self.assertRaises(ValueError):
            self._pipeline().ingest(path, document_id="DOC1")

        record = self.services.metadata.get_document("DOC1")
        self.assertEqual(record.status, STATUS_FAILED)
        self.assertTrue(record.error)
        # Not committed to LMDB, so a retry is allowed rather than deduped away.
        self.assertEqual(self.services.hashes.count(), 0)

    def test_a_retry_replaces_the_previous_attempt_instead_of_duplicating_it(self):
        """The resume guarantee: re-running a half-finished document is safe."""
        path = self._document("judgment.txt", JUDGMENT)
        pipeline = self._pipeline()
        pipeline.ingest(path, document_id="DOC1")
        chunks_after_first = self.services.metadata.stats()["chunk_count"]

        # Simulate a crash after the chunks landed but before the LMDB commit.
        self.services.hashes.delete(self.services.metadata.get_document("DOC1").content_hash)
        pipeline.ingest(path, document_id="DOC1")

        self.assertEqual(self.services.metadata.stats()["chunk_count"], chunks_after_first)
        self.assertEqual(
            self.services.indexes.get(PUBLIC_COLLECTION).ntotal, chunks_after_first
        )

    def test_pages_are_carried_through_to_chunks(self):
        from rag.app.ingest.pipeline import IngestionPipeline

        pages = ["Page one text about bail. " * 40, "Page two text about tax. " * 40]
        path = self._document("multi.txt", "\n\n".join(pages))
        IngestionPipeline(self.services).ingest(path, document_id="DOC1")

        rows = self.services.metadata.connection.execute(
            "SELECT DISTINCT page_number FROM chunks WHERE document_id = 'DOC1'"
        ).fetchall()
        self.assertTrue(all(row["page_number"] is not None for row in rows))


# ─── Lane routing (PRODUCTION_TODO.md T14) ───────────────────────────────────

# No recognisable court, no marker phrase, well under DENSE_LANE_MIN_CHARS (the
# "900-char procedural order" the task itself calls out as the case a
# length-only rule would still have to get right by falling through to it).
SHORT_PROCEDURAL_ORDER = """IN THE COURT OF THE DISTRICT JUDGE, SAKET
Case No. 1234/2026

List the matter on 12.03.2026 for further hearing. The counsel for the
respondent is directed to file a reply within two weeks. Registry to issue
notice. Matter adjourned to the next date. The verification phrase is
crimsonwillowadjourn.
"""

# No recognisable court and short, but carries one of the marker phrases.
SHORT_ORDER_WITH_CORAM = (
    "Coram: Two hon'ble members heard the parties briefly today. The matter "
    "stands over for compliance. The verification phrase is duskembercoram."
)

# High Court in the front matter -- must be dense whatever its length.
SHORT_HC_JUDGMENT = """IN THE HIGH COURT OF DELHI AT NEW DELHI
CM(M) 221/2026

The petition challenges an interim order. The verification phrase is
tealcopperhighcourt.
"""

# No court, no phrase, one page -- but at or above DENSE_LANE_MIN_CHARS.
LONG_ORDER_NO_MARKERS = (
    "The registry has set a compliance date for further hearing in this file. "
    * 60
)


class TestLaneRouting(RagStackTestCase):
    def test_supreme_court_document_is_dense_regardless_of_length(self):
        path = self._document("sc.txt", JUDGMENT)
        self._pipeline().ingest(path, document_id="SC1")
        record = self.services.metadata.get_document("SC1")
        self.assertEqual(record.lane, "dense")
        self.assertEqual(record.lane_reason, "court:sci")

    def test_high_court_document_is_dense_regardless_of_length(self):
        path = self._document("hc.txt", SHORT_HC_JUDGMENT)
        self._pipeline().ingest(path, document_id="HC1")
        record = self.services.metadata.get_document("HC1")
        self.assertEqual(record.lane, "dense")
        self.assertEqual(record.lane_reason, "court:hc/delhi")

    def test_short_procedural_order_with_no_court_is_lexical(self):
        path = self._document("procedural.txt", SHORT_PROCEDURAL_ORDER)
        self._pipeline().ingest(path, document_id="LEX1")
        record = self.services.metadata.get_document("LEX1")
        self.assertEqual(record.lane, "lexical")
        self.assertEqual(record.lane_reason, "default")

    def test_more_pages_than_the_threshold_is_dense_even_without_a_court(self):
        pages = [self._document(f"page{i}.txt", f"Page {i}: nothing decisive occurs here.")
                 for i in range(4)]
        self._pipeline().ingest(pages, document_id="PAGES1")
        record = self.services.metadata.get_document("PAGES1")
        self.assertEqual(record.lane, "dense")
        self.assertEqual(record.lane_reason, "pages")

    def test_a_marker_phrase_is_dense_even_when_short_and_courtless(self):
        path = self._document("coram.txt", SHORT_ORDER_WITH_CORAM)
        self._pipeline().ingest(path, document_id="PHRASE1")
        record = self.services.metadata.get_document("PHRASE1")
        self.assertEqual(record.lane, "dense")
        self.assertEqual(record.lane_reason, "phrase:coram")

    def test_length_alone_routes_dense_when_nothing_else_fires(self):
        path = self._document("long.txt", LONG_ORDER_NO_MARKERS)
        self._pipeline().ingest(path, document_id="LONG1")
        record = self.services.metadata.get_document("LONG1")
        self.assertEqual(record.lane, "dense")
        self.assertEqual(record.lane_reason, "length")

    def test_lexical_lane_document_gets_no_vectors(self):
        index = self.services.indexes.get(PUBLIC_COLLECTION)
        before = index.ntotal
        path = self._document("procedural.txt", SHORT_PROCEDURAL_ORDER)
        result = self._pipeline().ingest(path, document_id="LEX1").to_dict()
        self.assertEqual(index.ntotal, before)
        self.assertGreater(result["chunk_count"], 0)

    def test_lexical_lane_document_still_has_a_faiss_id_and_is_in_fts(self):
        """The schema requires one (NOT NULL UNIQUE); it is simply never
        added to the FAISS index -- see chunks_partition_insert."""
        path = self._document("procedural.txt", SHORT_PROCEDURAL_ORDER)
        self._pipeline().ingest(path, document_id="LEX1")
        row = self.services.metadata.connection.execute(
            "SELECT faiss_id FROM chunks WHERE document_id = 'LEX1'"
        ).fetchone()
        self.assertIsNotNone(row["faiss_id"])

        fts_row = self.services.metadata.connection.execute(
            "SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH 'crimsonwillowadjourn'"
        ).fetchone()
        self.assertIsNotNone(fts_row)

    def test_lexical_lane_document_is_still_returned_by_search(self):
        path = self._document("procedural.txt", SHORT_PROCEDURAL_ORDER)
        self._pipeline().ingest(path, document_id="LEX1")

        lexical_hits = self._retriever().search_lexical("crimsonwillowadjourn", top_k=3)
        self.assertEqual([h.document_id for h in lexical_hits], ["LEX1"])

        # The fused path (dense + lexical) must surface it too: a lexical-lane
        # document has no vector to match, but its BM25 hit still gets fused in.
        fused_hits = self._retriever().search("crimsonwillowadjourn", k=3)
        self.assertEqual([h.document_id for h in fused_hits], ["LEX1"])

    def test_promotion_embeds_and_flips_a_lexical_document_to_dense(self):
        from rag.scripts.promote_lane import promote_document

        path = self._document("procedural.txt", SHORT_PROCEDURAL_ORDER)
        self._pipeline().ingest(path, document_id="LEX1")

        index = self.services.indexes.get(PUBLIC_COLLECTION)
        before_record = self.services.metadata.get_document("LEX1")
        self.assertEqual(before_record.lane, "lexical")
        before_ntotal = index.ntotal

        promoted = promote_document(self.services, "LEX1")

        self.assertEqual(promoted, before_record.chunk_count)
        self.assertEqual(index.ntotal, before_ntotal + promoted)

        after_record = self.services.metadata.get_document("LEX1")
        self.assertEqual(after_record.lane, "dense")
        self.assertEqual(after_record.lane_reason, "promoted:default")

        # Now reachable by dense search too, not only BM25.
        hits = self._retriever().search("crimsonwillowadjourn", k=3)
        self.assertEqual([h.document_id for h in hits], ["LEX1"])

    def test_promotion_of_an_already_dense_document_is_a_no_op(self):
        from rag.scripts.promote_lane import promote_document

        path = self._document("sc.txt", JUDGMENT)
        self._pipeline().ingest(path, document_id="SC1")
        self.assertEqual(promote_document(self.services, "SC1"), 0)
        self.assertEqual(self.services.metadata.get_document("SC1").lane, "dense")

    def test_promotion_of_an_unknown_document_is_a_no_op(self):
        from rag.scripts.promote_lane import promote_document

        self.assertEqual(promote_document(self.services, "NOPE"), 0)

    def test_lane_histogram_counts_by_lane_and_reason(self):
        self._pipeline().ingest(self._document("sc.txt", JUDGMENT), document_id="SC1")
        self._pipeline().ingest(
            self._document("procedural.txt", SHORT_PROCEDURAL_ORDER), document_id="LEX1"
        )
        histogram = self.services.metadata.lane_histogram()
        self.assertEqual(histogram.get("dense:court:sci"), 1)
        self.assertEqual(histogram.get("lexical:default"), 1)


# ─── Retrieval ───────────────────────────────────────────────────────────────


class TestRetrieval(RagStackTestCase):
    def setUp(self):
        super().setUp()
        pipeline = self._pipeline()
        pipeline.ingest(self._document("public.txt", JUDGMENT), document_id="PUB1")
        for corpus, user, doc_id in (("C1", "U1", "A1"), ("C2", "U2", "B1")):
            pipeline.ingest(
                self._document(f"{doc_id}.txt", f"Private lease for {user}. secretalpha clause"),
                document_id=doc_id,
                collection=USER_COLLECTION,
                extra_metadata={"corpus_id": corpus, "clerk_uid": user},
                dedupe_scope=corpus,
                persist_source=False,
            )

    def test_public_search_returns_document_metadata(self):
        hits = self._retriever().search("anticipatory bail zephyrquartzbail", k=3)
        self.assertTrue(hits)
        self.assertEqual(hits[0].document_id, "PUB1")
        self.assertEqual(hits[0].court, "sci")
        self.assertTrue(hits[0].storage_ref)

    def test_corpus_search_is_isolated_per_user(self):
        retriever = self._retriever()
        self.assertEqual(
            [h.document_id for h in retriever.search_corpus("secretalpha clause", "C1", "U1")],
            ["A1"],
        )
        self.assertEqual(
            [h.document_id for h in retriever.search_corpus("secretalpha clause", "C2", "U2")],
            ["B1"],
        )

    def test_mismatched_corpus_and_user_returns_nothing(self):
        """Both keys must match -- this is the leak the id allow-list prevents."""
        self.assertEqual(self._retriever().search_corpus("secretalpha clause", "C1", "U2"), [])

    def test_public_search_never_reaches_private_collections(self):
        hits = self._retriever().search("secretalpha clause", k=10)
        self.assertNotIn("A1", [hit.document_id for hit in hits])
        self.assertNotIn("B1", [hit.document_id for hit in hits])

    def test_delete_removes_one_corpus_and_leaves_the_other(self):
        from rag.app.retrieval.retriever import delete_corpus_documents

        removed = delete_corpus_documents(self.services, "C1", "U1")
        self.assertEqual(removed, 1)
        retriever = self._retriever()
        self.assertEqual(retriever.search_corpus("secretalpha clause", "C1", "U1"), [])
        self.assertEqual(
            [h.document_id for h in retriever.search_corpus("secretalpha clause", "C2", "U2")],
            ["B1"],
        )


# ─── Lexical retrieval / fusion (PRODUCTION_TODO.md T7) ──────────────────────


class TestLexicalFusion(RagStackTestCase):
    """Retriever.search() fuses the dense and lexical lanes by default."""

    def setUp(self):
        super().setUp()
        pipeline = self._pipeline()
        pipeline.ingest(
            self._document("cite.txt", "The tribunal held that 2019 SCC OnLine SC 1234 governs limitation."),
            document_id="CITE",
        )
        pipeline.ingest(
            self._document("other.txt", "This unrelated judgment discusses land acquisition procedure."),
            document_id="OTHER",
        )

    def test_exact_citation_query_is_returned_rank_one_by_fused_search(self):
        hits = self._retriever().search("2019 SCC OnLine SC 1234", k=5)
        self.assertTrue(hits)
        self.assertEqual(hits[0].document_id, "CITE")

    def test_search_lexical_alone_also_ranks_the_citation_first(self):
        hits = self._retriever().search_lexical("2019 SCC OnLine SC 1234", top_k=5)
        self.assertTrue(hits)
        self.assertEqual(hits[0].document_id, "CITE")

    def test_fused_search_still_enforces_tenant_scoping(self):
        pipeline = self._pipeline()
        pipeline.ingest(
            self._document("priv.txt", "2019 SCC OnLine SC 1234 also appears in this private note."),
            document_id="PRIV",
            collection=USER_COLLECTION,
            extra_metadata={"corpus_id": "C9", "clerk_uid": "U9"},
            dedupe_scope="C9",
            persist_source=False,
        )
        hits = self._retriever().search("2019 SCC OnLine SC 1234", owner_id="someone_else", k=5)
        self.assertNotIn("PRIV", [h.document_id for h in hits])


# ─── Retrieval over-fetch (PRODUCTION_TODO.md T6) ────────────────────────────


class TestRetrievalOverfetch(RagStackTestCase):
    """A single dense FAISS call, over-fetched then truncated to the same
    ``top_k`` by the same score FAISS already sorted by, returns exactly the
    same ids as asking for ``top_k`` directly -- verified empirically before
    writing this test, and it is a mathematical property of how
    IndexIVFPQ.search selects its top-k, not a quirk of this corpus. So a
    recall test built on ranking quality alone, with nothing else in the
    pipeline to re-rank against, would show no difference and would not be
    testing what T6 actually changed.

    What over-fetch *does* buy, in this codebase specifically, is slack for
    ``Retriever._hydrate`` to drop candidates whose chunk row is missing --
    the index running ahead of SQLite (T2a's backup race, T2b's allocator
    race before its fix, or simply a document deleted after it was indexed)
    -- and still return a full ``top_k``. Fetching exactly ``top_k`` from
    FAISS leaves no room to make up for a drop; over-fetching does. That is
    the property this test exercises: a PQ-compressed index with ~50% of its
    vectors missing their chunk row, recall@10 measured against the exact
    ranking over only the vectors that *do* still have one (the best any
    correct implementation could return), with a fetch capped at exactly
    ``top_k`` against ``services.config.overfetch_k(top_k)``.
    """

    def _config(self, **overrides):
        overrides.setdefault("EMBED_DIM", "32")
        # A real compressed factory, not Flat, per the task -- fast to train
        # (fast-scan PQ) so this stays a unit test rather than a benchmark.
        overrides.setdefault("FAISS_INDEX_FACTORY", "IVF16,PQ16x4fs")
        overrides.setdefault("FAISS_NPROBE", "16")
        return super()._config(**overrides)

    def _seed_corpus(self, n: int, dim: int, seed: int):
        rng = np.random.default_rng(seed)
        vectors = rng.standard_normal((n, dim)).astype("float32")
        vectors /= np.linalg.norm(vectors, axis=1, keepdims=True)

        ids = list(self.services.metadata.allocate_faiss_ids(n))
        self.services.metadata.upsert_document(
            document_id="BULK", collection=PUBLIC_COLLECTION, status=STATUS_COMPLETE
        )
        self.services.metadata.replace_chunks(
            "BULK",
            PUBLIC_COLLECTION,
            [(f"chunk {i}", None) for i in range(n)],
            ids,
            owner_id=None,
        )
        # One add() call, deliberately: the factory needs >= 39x nlist vectors
        # in its first batch to train at all (VectorIndex._train, PRODUCTION_
        # TODO.md T9a), and this mirrors how rebuild_index.py trains in bulk
        # rather than trickling vectors in one at a time.
        self.services.indexes.global_index().add(ids, vectors)
        return np.array(ids), vectors

    def test_overfetch_recovers_recall_lost_to_missing_chunk_rows(self):
        n, dim, top_k = 650, 32, 10  # n >= 39 * nlist(16) = 624, or _train refuses
        ids, vectors = self._seed_corpus(n=n, dim=dim, seed=0)
        # RetrievedChunk (what _hydrate returns) carries no faiss_id -- it's
        # the HTTP-facing shape -- so recover it from the chunk text this
        # test itself wrote, rather than reaching into chunk_id's internal
        # "{document_id}_{index}" format.
        faiss_id_of_text = {f"chunk {i}": int(ids[i]) for i in range(n)}

        # Index-ahead-of-database drift: half the vectors have no chunk row,
        # though FAISS still returns them like any other candidate. A fixed
        # set, not query-dependent, matching real drift (it doesn't move
        # around per query).
        missing = set(
            np.random.default_rng(1).choice(ids, size=n // 2, replace=False).tolist()
        )
        placeholders = ",".join("?" for _ in missing)
        self.services.metadata.connection.execute(
            f"DELETE FROM chunks WHERE faiss_id IN ({placeholders})", list(missing)
        )
        self.services.metadata.connection.commit()

        surviving = np.array([i not in missing for i in ids])
        surviving_ids, surviving_vectors = ids[surviving], vectors[surviving]

        fetch_k = self.services.config.overfetch_k(top_k)
        self.assertGreater(fetch_k, top_k, "the config knob this test exercises must raise k")

        retriever = self._retriever()
        scope = SearchFilter.public()
        index = self.services.indexes.global_index()
        queries = np.random.default_rng(2).standard_normal((40, dim)).astype("float32")
        queries /= np.linalg.norm(queries, axis=1, keepdims=True)

        recall_capped, recall_overfetched = [], []
        for query in queries:
            # Ground truth: exact inner product, restricted to vectors that
            # still have a row -- a deleted row has nothing to hydrate, so no
            # implementation, over-fetching or not, could ever return it.
            true_top_k = set(
                surviving_ids[np.argsort(-(surviving_vectors @ query))[:top_k]].tolist()
            )

            capped = {
                faiss_id_of_text[r.text]
                for r in retriever._hydrate(index.search(query, top_k, scope=scope))
            }
            overfetched = {
                faiss_id_of_text[r.text]
                for r in retriever._hydrate(index.search(query, fetch_k, scope=scope))[:top_k]
            }

            recall_capped.append(len(capped & true_top_k) / top_k)
            recall_overfetched.append(len(overfetched & true_top_k) / top_k)

        avg_capped = sum(recall_capped) / len(recall_capped)
        avg_overfetched = sum(recall_overfetched) / len(recall_overfetched)
        self.assertGreater(
            avg_overfetched,
            avg_capped + 0.2,
            f"over-fetch should materially beat a fetch capped at top_k: "
            f"overfetched={avg_overfetched:.2f} capped={avg_capped:.2f}",
        )


# ─── Startup ─────────────────────────────────────────────────────────────────


class TestStartup(RagStackTestCase):
    def test_directories_are_created(self):
        for directory in self.config.managed_dirs:
            self.assertTrue(directory.is_dir(), directory)

    def test_state_survives_a_restart(self):
        self._pipeline().ingest(self._document("judgment.txt", JUDGMENT), document_id="DOC1")
        expected = self.services.metadata.stats()
        services_module.shutdown(self.services)

        self.services = services_module.build_services(
            self.config, embedder=DeterministicEmbedder(dimension=self.config.embed_dim)
        )
        services_module.startup(self.services)

        self.assertEqual(self.services.metadata.stats(), expected)
        self.assertEqual(
            self.services.indexes.get(PUBLIC_COLLECTION).ntotal, expected["chunk_count"]
        )
        self.assertTrue(self._retriever().search("zephyrquartzbail", k=1))

    def test_changing_the_embedding_model_on_a_populated_corpus_is_refused(self):
        """Silently mixing vector spaces returns confidently wrong neighbours."""
        self._pipeline().ingest(self._document("judgment.txt", JUDGMENT), document_id="DOC1")
        services_module.shutdown(self.services)

        # Stand in for "someone changed EMBED_MODEL and restarted".
        self.services.metadata.set_meta("embedding_signature", "some-other-model@1024")
        mismatched = services_module.build_services(
            self.config, embedder=DeterministicEmbedder(dimension=self.config.embed_dim)
        )
        try:
            with self.assertRaises(RuntimeError):
                services_module.startup(mismatched)
        finally:
            services_module.shutdown(mismatched)

        # Put the signature back so tearDown closes a consistent stack.
        self.services.metadata.set_meta("embedding_signature", self.services.signature)
        services_module.startup(self.services)

    def test_an_unwritable_root_refuses_to_start(self):
        """PRODUCTION_TODO.md T4b: ``ensure_directories``'s ``mkdir(exist_ok=True)``
        is a silent no-op on a directory that already exists -- exactly the
        case on a re-mounted volume, and exactly the case that would otherwise
        hide a read-only mount or a ReadWritePaths=/RequiresMountsFor=
        mismatch until the first real write. Reproduced here without systemd:
        create the layout normally (writable), then take write access away
        from one tier root and start a *second* stack pointed at it -- the
        directories all already exist, so only an actual write probe notices.
        """
        unwritable_root = self.root / "unwritable_hdd"
        config = self._config(
            HDD_DATA_ROOT=str(unwritable_root), SSD_DATA_ROOT=str(self.root / "ssd_for_probe_test")
        )
        ensure_directories(config)  # created while still writable

        unwritable_root.chmod(0o500)
        try:
            services = services_module.build_services(
                config, embedder=DeterministicEmbedder(dimension=config.embed_dim)
            )
            with self.assertRaises(RuntimeError) as ctx:
                services_module.startup(services)
            self.assertIn(str(unwritable_root), str(ctx.exception))
        finally:
            # So tearDown's rmtree of self.root (an ancestor) can still recurse in.
            unwritable_root.chmod(0o700)


# ─── Backups ─────────────────────────────────────────────────────────────────


class TestBackups(RagStackTestCase):
    """The nightly stores, and the weekly document mirror.

    Most of these force the mirror with ``include_documents=True`` because it is
    otherwise weekly: what they are about is *how* the mirror behaves, not when
    it runs, and the cadence has its own tests at the end of the class.
    """

    @staticmethod
    def _read_ntotal(path) -> int:
        import faiss

        return int(faiss.read_index(str(path)).ntotal)

    def _second_process(self, *, read_only: bool):
        """A RagServices standing in for a second process against the same
        DATA_ROOT -- what backup_now.py is -- with its own independent
        VectorIndexRegistry (a fresh, unshared in-memory FAISS state, the part
        an actual second process would have) but sharing everything else with
        self.services. LMDB genuinely refuses to open the same environment
        path twice within one OS process, so a real second `build_services()`
        + `startup()` here would fail on that, not on anything FAISS-related;
        this isolates the test to the store T2a is actually about.
        """
        from rag.core.services import RagServices
        from rag.core.vector_index import VectorIndexRegistry

        indexes = VectorIndexRegistry(
            root=self.config.faiss_root,
            dimension=self.config.embed_dim,
            signature=self.services.signature,
            index_factory=self.config.faiss_index_factory,
            flush_every=self.config.faiss_flush_every,
        )
        if not read_only:
            indexes.load_all()
        return RagServices(
            config=self.services.config,
            metadata=self.services.metadata,
            hashes=self.services.hashes,
            embedder=self.services.embedder,
            indexes=indexes,
            documents=self.services.documents,
            user_documents=self.services.user_documents,
        )

    def test_a_backup_does_not_rewind_vectors_added_while_it_runs(self):
        """The exact PRODUCTION_TODO.md T2a bug: a second process's in-memory
        snapshot, flushed during a backup, silently rewound the live index to
        whatever it was when that process opened it. `backup_now.py`'s
        read-only startup plus `run_backup`'s `flush_faiss=False` default are
        what prevent it now."""
        self._pipeline().ingest(self._document("judgment.txt", JUDGMENT), document_id="DOC1")
        before = self.services.indexes.get(PUBLIC_COLLECTION).ntotal
        self.assertGreater(before, 0)

        backup_services = self._second_process(read_only=True)

        # The real writer adds more *while* the backup process is open --
        # the actual race the bug was on a timer for, not a coincidence.
        self._pipeline().ingest(self._document("second.txt", SECOND_JUDGMENT), document_id="DOC2")
        after = self.services.indexes.get(PUBLIC_COLLECTION).ntotal
        self.assertGreater(after, before)

        run_backup(backup_services, stamp="2026-09-09")
        # Only the independent part (the fresh registry) is this "process"'s
        # own to close -- metadata/hashes are shared with self.services and
        # must survive for tearDown.
        backup_services.indexes.close()

        on_disk = self._read_ntotal(self.config.faiss_index_path(GLOBAL_COLLECTION))
        self.assertEqual(on_disk, after)

    def test_a_stale_snapshot_is_not_written_even_if_told_to_flush(self):
        """Defense-in-depth, not just one guard: even a second process that
        *did* load the full index, and is explicitly told to flush
        (`flush_faiss=True` -- what a caller should never pass here, but this
        is what stops it from mattering if one does), writes nothing, because
        `VectorIndex._dirty` (T2) is only true for a process's *own* pending
        adds/removes. A snapshot nobody modified has nothing to contribute,
        so flushing it is a no-op regardless of what a concurrent writer did
        to the file in the meantime."""
        self._pipeline().ingest(self._document("judgment.txt", JUDGMENT), document_id="DOC1")

        stale = self._second_process(read_only=False)  # loads the index into RAM now

        self._pipeline().ingest(self._document("second.txt", SECOND_JUDGMENT), document_id="DOC2")
        after = self.services.indexes.get(PUBLIC_COLLECTION).ntotal

        run_backup(stale, stamp="2026-09-10", flush_faiss=True)
        stale.indexes.close()

        on_disk = self._read_ntotal(self.config.faiss_index_path(GLOBAL_COLLECTION))
        self.assertEqual(on_disk, after)

    def test_backup_captures_all_three_stores(self):
        self._pipeline().ingest(self._document("judgment.txt", JUDGMENT), document_id="DOC1")
        result = run_backup(self.services, include_documents=True, stamp="2026-09-09")

        self.assertTrue((result.directory / "sqlite" / "chunks.db").is_file())
        self.assertTrue((result.directory / "lmdb" / "data.mdb").is_file())
        self.assertTrue(list((result.directory / "faiss").glob("*.faiss")))

    def test_backup_mirrors_the_document_archive(self):
        """Documents are captured, so a snapshot can restore a lost corpus."""
        self._pipeline().ingest(self._document("judgment.txt", JUDGMENT), document_id="DOC1")
        result = run_backup(self.services, include_documents=True, stamp="2026-09-09")

        archived = list((result.directory / "legal_corpus").rglob("*.txt"))
        self.assertEqual(len(archived), 1, "the ingested document should be in the snapshot")
        # Laid out exactly as the live archive is, so a restore is a plain copy
        # back rather than a path rewrite.
        stored = next(self.config.pdf_root.rglob("*.txt"))
        self.assertEqual(
            archived[0].relative_to(result.directory / "legal_corpus"),
            stored.relative_to(self.config.pdf_root),
        )
        self.assertEqual(archived[0].read_bytes(), stored.read_bytes())

    def test_unchanged_documents_are_hard_linked_not_duplicated(self):
        """The whole point of --link-dest: a second night costs no extra blocks.

        Copying the archive nightly would fill the volume within a week, so an
        unchanged PDF must share its inode with the previous snapshot rather than
        becoming a second copy on disk.
        """
        self._pipeline().ingest(self._document("judgment.txt", JUDGMENT), document_id="DOC1")

        first = run_backup(self.services, include_documents=True, stamp="2026-09-08")
        second = run_backup(self.services, include_documents=True, stamp="2026-09-09")

        first_doc = next((first.directory / "legal_corpus").rglob("*.txt"))
        second_doc = next((second.directory / "legal_corpus").rglob("*.txt"))

        self.assertEqual(
            first_doc.stat().st_ino,
            second_doc.stat().st_ino,
            "an unchanged document must be hard-linked into the newer snapshot",
        )
        self.assertEqual(second.documents_copied, 0)
        self.assertGreaterEqual(second.documents_linked, 1)

    def test_new_documents_are_copied_into_the_next_snapshot(self):
        """Incremental must still be complete: yesterday's link, today's copy."""
        self._pipeline().ingest(self._document("judgment.txt", JUDGMENT), document_id="DOC1")
        run_backup(self.services, include_documents=True, stamp="2026-09-08")

        self._pipeline().ingest(self._document("second.txt", SECOND_JUDGMENT), document_id="DOC2")
        second = run_backup(self.services, include_documents=True, stamp="2026-09-09")

        # Every document, regardless of which night it arrived, is present --
        # each snapshot is a complete tree, not a delta needing replay.
        self.assertEqual(len(list((second.directory / "legal_corpus").rglob("*.txt"))), 2)
        self.assertEqual(second.documents_copied, 1)

    def test_the_private_tree_is_mirrored_alongside_the_corpus(self):
        """User documents are backed up too, and stay owner-only in the snapshot."""
        document = self.config.users_root / "user_alice" / "contracts" / ("a" * 32 + ".pdf")
        document.parent.mkdir(parents=True, exist_ok=True)
        document.write_bytes(b"%PDF-1.7 private")
        document.chmod(0o600)

        result = run_backup(self.services, include_documents=True, stamp="2026-09-09")

        mirrored = result.directory / "users" / "user_alice" / "contracts" / ("a" * 32 + ".pdf")
        self.assertTrue(mirrored.is_file())
        self.assertEqual(mirrored.read_bytes(), b"%PDF-1.7 private")
        # A backup that widened permissions would be a quiet way to expose every
        # document it was taken to protect.
        self.assertEqual(mirrored.stat().st_mode & 0o077, 0)
        self.assertEqual((result.directory / "users").stat().st_mode & 0o077, 0)
        self.assertIn("users", result.trees)

    def test_manifest_marks_a_snapshot_complete(self):
        """restore.sh refuses a snapshot without one, so it must be written."""
        self._pipeline().ingest(self._document("judgment.txt", JUDGMENT), document_id="DOC1")
        result = run_backup(self.services, include_documents=True, stamp="2026-09-09")

        manifest = json.loads((result.directory / "MANIFEST.json").read_text())
        self.assertEqual(manifest["stamp"], "2026-09-09")
        # The embedding signature is what lets a restore warn before a mismatched
        # corpus is put back into service.
        self.assertEqual(manifest["embedding_signature"], self.services.signature)
        self.assertIn("documents", manifest["components"])

    def test_an_interrupted_snapshot_is_not_used_as_a_link_source(self):
        """A partial tree must not propagate its gaps into every later snapshot."""
        from rag.core.backup import _previous_snapshot

        self._pipeline().ingest(self._document("judgment.txt", JUDGMENT), document_id="DOC1")
        run_backup(self.services, include_documents=True, stamp="2026-09-07")

        # Simulate a run killed before it wrote its manifest.
        partial = self.config.backup_root / "2026-09-08"
        (partial / "legal_corpus").mkdir(parents=True, exist_ok=True)

        self.assertEqual(
            _previous_snapshot(self.config.backup_root, "2026-09-09").name,
            "2026-09-07",
            "the newest COMPLETE snapshot should be chosen, skipping the partial one",
        )

    def test_mirror_falls_back_to_python_without_rsync(self):
        """A box with no rsync still gets a usable, hard-linked snapshot.

        The fallback is the path least likely to be exercised in practice and the
        most likely to rot, so it is tested explicitly rather than assumed.
        """
        from dataclasses import replace

        self._pipeline().ingest(self._document("judgment.txt", JUDGMENT), document_id="DOC1")

        # Point at a binary that cannot exist, forcing shutil.which to miss.
        no_rsync = replace(self.config, rsync_binary="rsync-does-not-exist-owllex")
        services = replace(self.services, config=no_rsync)

        first = run_backup(services, include_documents=True, stamp="2026-09-08")
        self.assertEqual(len(list((first.directory / "legal_corpus").rglob("*.txt"))), 1)
        self.assertEqual(first.documents_copied, 1)

        second = run_backup(services, include_documents=True, stamp="2026-09-09")
        self.assertEqual(
            next((first.directory / "legal_corpus").rglob("*.txt")).stat().st_ino,
            next((second.directory / "legal_corpus").rglob("*.txt")).stat().st_ino,
            "the fallback must hard-link too, or retention costs a full copy a night",
        )
        self.assertEqual(second.documents_copied, 0)
        self.assertEqual(second.documents_linked, 1)

    def test_a_resumed_run_reuses_the_same_snapshot(self):
        """An interrupted nightly job picks up rather than re-walking the archive."""
        self._pipeline().ingest(self._document("judgment.txt", JUDGMENT), document_id="DOC1")
        run_backup(self.services, include_documents=True, stamp="2026-09-09")

        # Second run of the same stamp: still exactly one snapshot, still complete.
        result = run_backup(self.services, include_documents=True, stamp="2026-09-09")
        self.assertTrue((result.directory / "MANIFEST.json").is_file())
        self.assertEqual(len(list((result.directory / "legal_corpus").rglob("*.txt"))), 1)
        self.assertTrue((result.directory / "sqlite" / "chunks.db").is_file())
        self.assertTrue((result.directory / "lmdb" / "data.mdb").is_file())

    def test_sqlite_snapshot_is_a_readable_database(self):
        self._pipeline().ingest(self._document("judgment.txt", JUDGMENT), document_id="DOC1")
        result = run_backup(self.services, stamp="2026-09-09")

        connection = sqlite3.connect(result.directory / "sqlite" / "chunks.db")
        try:
            count = connection.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
        finally:
            connection.close()
        self.assertEqual(count, self.services.metadata.stats()["chunk_count"])

    def test_documents_are_skipped_off_the_weekly_day(self):
        """A nightly run snapshots the stores only -- the trees are immutable."""
        self._pipeline().ingest(self._document("judgment.txt", JUDGMENT), document_id="DOC1")
        run_backup(self.services, include_documents=True, stamp="2026-09-06")  # Sunday

        monday = run_backup(self.services, stamp="2026-09-07")

        self.assertTrue((monday.directory / "sqlite" / "chunks.db").is_file())
        self.assertFalse((monday.directory / "legal_corpus").exists())
        self.assertIn("not the weekly", monday.components["legal_corpus"])

    def test_the_first_run_mirrors_whatever_day_it_is(self):
        """A fresh backup root must not be a week away from holding documents."""
        self._pipeline().ingest(self._document("judgment.txt", JUDGMENT), document_id="DOC1")

        monday = run_backup(self.services, stamp="2026-09-07")

        self.assertEqual(len(list((monday.directory / "legal_corpus").rglob("*.txt"))), 1)

    def test_retention_keeps_the_newest_document_mirror(self):
        """Pruning must not leave a database describing files it no longer has."""
        self._pipeline().ingest(self._document("judgment.txt", JUDGMENT), document_id="DOC1")
        run_backup(self.services, include_documents=True, stamp="2026-09-06")
        for stamp in ("2026-09-07", "2026-09-08", "2026-09-09"):
            run_backup(self.services, include_documents=False, stamp=stamp)

        prune_backups(self.config.backup_root, retention_days=2)

        kept = sorted(p.name for p in self.config.backup_root.iterdir())
        self.assertIn("2026-09-06", kept)
        self.assertTrue((self.config.backup_root / "2026-09-06" / "legal_corpus").is_dir())

    def test_retention_keeps_the_newest_snapshots(self):
        for stamp in ("2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"):
            (self.config.backup_root / stamp).mkdir(parents=True, exist_ok=True)
        prune_backups(self.config.backup_root, retention_days=2)
        self.assertEqual(
            sorted(p.name for p in self.config.backup_root.iterdir()),
            ["2026-09-03", "2026-09-04"],
        )

    def test_retention_ignores_unrelated_directories(self):
        (self.config.backup_root / "manual-before-migration").mkdir(parents=True, exist_ok=True)
        prune_backups(self.config.backup_root, retention_days=1)
        self.assertTrue((self.config.backup_root / "manual-before-migration").is_dir())


# ─── rebuild_index.py ────────────────────────────────────────────────────────


class TestRebuildIndex(RagStackTestCase):
    def test_a_rebuild_over_a_populated_corpus_reindexes_everything(self):
        result = self._pipeline().ingest(
            self._document("judgment.txt", JUDGMENT), document_id="DOC1"
        ).to_dict()
        self.services.indexes.close()

        written = rebuild_collections(self.services, list(LOGICAL_COLLECTIONS), batch_size=8)

        self.assertEqual(written, result["chunk_count"])
        self.assertEqual(
            self.services.indexes.get(PUBLIC_COLLECTION).ntotal, result["chunk_count"]
        )

    def test_zero_chunks_resolved_does_not_touch_a_nonempty_index(self):
        """A rebuild that resolves zero rows must not swap an empty index over
        a non-empty one -- see PRODUCTION_TODO.md T1. Simulates the bug's
        symptom directly: the chunks table disagrees with what's on disk."""
        self._pipeline().ingest(self._document("judgment.txt", JUDGMENT), document_id="DOC1")
        self.services.indexes.close()
        target_path = self.config.faiss_index_path(GLOBAL_COLLECTION)
        ntotal_before = self._read_ntotal(target_path)
        self.assertGreater(ntotal_before, 0)

        # Simulate the query resolving nothing against a target that already
        # holds vectors -- e.g. a bug in the WHERE clause, not an empty corpus.
        self.services.metadata.connection.execute("DELETE FROM chunks")
        self.services.metadata.connection.commit()

        with self.assertRaises(RebuildRefused):
            rebuild_collections(self.services, list(LOGICAL_COLLECTIONS), batch_size=8)

        self.assertEqual(self._read_ntotal(target_path), ntotal_before)

    def test_force_overrides_the_zero_chunks_guard(self):
        self._pipeline().ingest(self._document("judgment.txt", JUDGMENT), document_id="DOC1")
        self.services.indexes.close()
        self.services.metadata.connection.execute("DELETE FROM chunks")
        self.services.metadata.connection.commit()

        written = rebuild_collections(
            self.services, list(LOGICAL_COLLECTIONS), batch_size=8, force=True
        )

        self.assertEqual(written, 0)
        self.assertEqual(self.services.indexes.get(PUBLIC_COLLECTION).ntotal, 0)

    def test_omitting_a_populated_logical_collection_is_refused(self):
        """Both logical collections share one physical index. Rebuilding with
        only one of them would silently drop the other's vectors from it."""
        self._pipeline().ingest(self._document("judgment.txt", JUDGMENT), document_id="DOC1")
        self.services.indexes.close()

        with self.assertRaises(RebuildRefused):
            rebuild_collections(self.services, [USER_COLLECTION], batch_size=8)

        self.assertEqual(
            self._read_ntotal(self.config.faiss_index_path(GLOBAL_COLLECTION)),
            self.services.metadata.stats()["chunk_count"],
        )

    @staticmethod
    def _read_ntotal(path) -> int:
        import faiss

        return int(faiss.read_index(str(path)).ntotal)


# ─── Bulk train-and-add path for compressed indexes (PRODUCTION_TODO.md T9) ──


class TestBuildIndex(RagStackTestCase):
    """`rag/scripts/build_index.py`: the offline embed -> train -> add -> flush
    path for building a *compressed* factory from scratch, which
    `rebuild_index.py` cannot do -- its per-batch `add()` calls are far too
    small to train an IVF/PQ index (see PRODUCTION_TODO.md T9's bug report).
    """

    def _config(self, **overrides):
        overrides.setdefault("EMBED_DIM", "32")
        # nlist=16: small enough to train fast in a unit test, real enough
        # that a too-small training batch would still fail loudly (the bug
        # this task exists to fix). FAISS_TRAIN_THRESHOLD default (10_000)
        # only needs lowering because there aren't 39*16=624+ chunks in every
        # test here -- tests that seed fewer set it themselves.
        overrides.setdefault("FAISS_INDEX_FACTORY", "IVF16,PQ16x4fs")
        return super()._config(**overrides)

    def _seed_chunks(
        self, n: int, *, collection=PUBLIC_COLLECTION, document_id="BULK", doc_date=None
    ) -> list[int]:
        ids = list(self.services.metadata.allocate_faiss_ids(n))
        self.services.metadata.upsert_document(
            document_id=document_id, collection=collection, status=STATUS_COMPLETE, doc_date=doc_date
        )
        self.services.metadata.replace_chunks(
            document_id, collection, [(f"chunk {document_id} {i} legal text", None) for i in range(n)],
            ids, owner_id=None,
        )
        return ids

    def test_a_compressed_factory_trains_in_bulk_and_indexes_everything(self):
        """The bug this task fixes: rebuild_index.py's default batch of 8
        can't train nlist=16 at all. build_index.py must train on a proper
        bulk sample and add every chunk."""
        n = 700  # >= 39*16, so training also clears FAISS's own minimum
        self._seed_chunks(n)
        self.services.indexes.close()

        written = build_index_collections(self.services, list(LOGICAL_COLLECTIONS))

        self.assertEqual(written, n)
        index = self.services.indexes.get(PUBLIC_COLLECTION)
        self.assertEqual(index.ntotal, n)
        self.assertTrue(index.index.is_trained)

    def test_a_killed_run_resumes_embedding_without_re_embedding_finished_rows(self):
        """Done when: a killed run resumes from the mmap without re-embedding."""
        n = 700
        self._seed_chunks(n)
        self.services.indexes.close()
        build_index_module.FETCH_SIZE = 50
        self.addCleanup(setattr, build_index_module, "FETCH_SIZE", 512)

        real_embed = self.services.embedder.embed_documents
        calls = {"n": 0}

        def flaky(texts):
            calls["n"] += 1
            if calls["n"] == 3:
                raise KeyboardInterrupt("simulated kill")
            return real_embed(texts)

        self.services.embedder.embed_documents = flaky
        with self.assertRaises(KeyboardInterrupt):
            build_index_collections(self.services, list(LOGICAL_COLLECTIONS))

        checkpoint_dir = (
            self.config.faiss_root
            / f"{self.config.faiss_index_path(GLOBAL_COLLECTION).stem}.build_checkpoint"
        )
        progress = json.loads((checkpoint_dir / "progress.json").read_text())
        self.assertGreater(progress["done"], 0)
        self.assertLess(progress["done"], n)
        rows_before_kill = progress["done"]

        resumed_calls = {"n": 0}

        def counting(texts):
            resumed_calls["n"] += 1
            return real_embed(texts)

        self.services.embedder.embed_documents = counting
        written = build_index_collections(self.services, list(LOGICAL_COLLECTIONS))

        self.assertEqual(written, n)
        # Resumed from the checkpoint rather than re-embedding: the number of
        # further embed_documents() calls only covers what was left, not the
        # whole corpus again.
        expected_further_batches = -(-(n - rows_before_kill) // build_index_module.FETCH_SIZE)
        self.assertEqual(resumed_calls["n"], expected_further_batches)
        index = self.services.indexes.get(PUBLIC_COLLECTION)
        self.assertEqual(index.ntotal, n)
        self.assertTrue(index.index.is_trained)

    def test_flat_factory_needs_no_training(self):
        n = 20

        # A Flat factory is already "trained" on construction -- build_index.py
        # must not require a training sample from it. Rebuild the stack (set
        # up by RagStackTestCase's setUp with the IVF/PQ factory) against a
        # Flat one instead, rooted at a fresh directory so it isn't looking at
        # the IVF/PQ index this test case's setUp already created on disk.
        services_module.shutdown(self.services)
        flat_root = Path(tempfile.mkdtemp(prefix="rag_test_flat_"))
        self.addCleanup(shutil.rmtree, flat_root, ignore_errors=True)
        flat_config = self._config(DATA_ROOT=str(flat_root), FAISS_INDEX_FACTORY="Flat")
        set_config(flat_config)
        self.services = services_module.build_services(
            flat_config, embedder=DeterministicEmbedder(dimension=flat_config.embed_dim)
        )
        services_module.startup(self.services)
        self.config = flat_config

        self._seed_chunks(n)
        self.services.indexes.close()

        written = build_index_collections(self.services, list(LOGICAL_COLLECTIONS))

        self.assertEqual(written, n)
        index = self.services.indexes.get(PUBLIC_COLLECTION)
        self.assertEqual(index.ntotal, n)
        self.assertTrue(index.index.is_trained)

    def test_zero_chunks_builds_an_empty_index(self):
        written = build_index_collections(self.services, list(LOGICAL_COLLECTIONS))
        self.assertEqual(written, 0)
        self.assertEqual(self.services.indexes.get(PUBLIC_COLLECTION).ntotal, 0)

    def test_zero_chunks_resolved_does_not_touch_a_nonempty_index(self):
        self._seed_chunks(700)
        self.services.indexes.close()
        build_index_collections(self.services, list(LOGICAL_COLLECTIONS))
        target_path = self.config.faiss_index_path(GLOBAL_COLLECTION)
        ntotal_before = self._read_ntotal(target_path)
        self.assertGreater(ntotal_before, 0)

        self.services.metadata.connection.execute("DELETE FROM chunks")
        self.services.metadata.connection.commit()

        with self.assertRaises(BuildRefused):
            build_index_collections(self.services, list(LOGICAL_COLLECTIONS))

        self.assertEqual(self._read_ntotal(target_path), ntotal_before)

    def test_omitting_a_populated_logical_collection_is_refused(self):
        self._seed_chunks(20, collection=PUBLIC_COLLECTION)
        self.services.indexes.close()

        with self.assertRaises(BuildRefused):
            build_index_collections(self.services, [USER_COLLECTION])

    def test_too_few_chunks_to_train_the_configured_nlist_is_refused_not_a_raw_faiss_assertion(self):
        # nlist=16 needs at least 16 training vectors; 5 chunks can never
        # clear that, compressed-factory-first-build or not.
        self._seed_chunks(5)
        self.services.indexes.close()

        with self.assertRaises(BuildRefused) as ctx:
            build_index_collections(self.services, list(LOGICAL_COLLECTIONS))
        self.assertIn("training vectors", str(ctx.exception))

    def test_training_sample_size_is_governed_by_faiss_train_threshold(self):
        """PRODUCTION_TODO.md T9's bug report: FAISS_TRAIN_THRESHOLD 'exists in
        RagConfig and is read by nothing'. build_index.py must be the reader."""
        n = 700
        self._seed_chunks(n)
        self.services.indexes.close()

        sampled = {}
        real_train = VectorIndex.train

        def spying_train(self, vectors, **kwargs):
            sampled["size"] = vectors.shape[0]
            return real_train(self, vectors, **kwargs)

        with mock.patch.object(VectorIndex, "train", spying_train):
            build_index_collections(self.services, list(LOGICAL_COLLECTIONS))

        # FAISS_TRAIN_THRESHOLD isn't overridden here, so the default (10_000)
        # governs, capped at what's actually available (700).
        self.assertEqual(sampled["size"], min(n, self.config.faiss_train_threshold))

    def test_a_build_records_trained_at_ntotal_and_the_training_date_range(self):
        """PRODUCTION_TODO.md T9b Change 1: the sidecar must record what the
        corpus looked like at training time, not just its current state, so
        later drift can be measured against it."""
        n = 700
        # Bulk of the corpus undated, plus two documents at either end of a
        # wide range -- the recorded range must be the min and max actually
        # present, not e.g. always "this year".
        self._seed_chunks(n - 2, document_id="BULK")
        self._seed_chunks(1, document_id="OLDEST", doc_date="1998-03-15")
        self._seed_chunks(1, document_id="NEWEST", doc_date="2024-11-02")
        self.services.indexes.close()

        build_index_collections(self.services, list(LOGICAL_COLLECTIONS))

        index = self.services.indexes.get(PUBLIC_COLLECTION)
        self.assertEqual(index.trained_at_ntotal, n)
        # Best-effort and sample-based (see build_index.py's
        # TRAINING_DATE_RANGE_SAMPLE_CAP) -- with every chunk looked up here
        # (n well under the cap), the two dated documents must both surface.
        self.assertIsNotNone(index.training_date_range)
        self.assertEqual(index.training_date_range, ("1998", "2024"))

        meta = json.loads(index.meta_path.read_text())
        self.assertEqual(meta["trained_at_ntotal"], n)
        self.assertEqual(meta["training_date_range"], ["1998", "2024"])

    def test_health_check_reports_quantizer_drift_after_build_index(self):
        """End-to-end version of the VectorIndex-level drift test: after a
        real build_index.py run, growing the corpus with an unrelated
        distribution must show up in /health/vector's response, not just in
        the VectorIndex object directly."""
        from app.health_routes import STATUS_DEGRADED, _check_vector

        n = 700
        self._seed_chunks(n)
        self.services.indexes.close()
        build_index_collections(self.services, list(LOGICAL_COLLECTIONS))

        services_module.set_services(self.services)
        self.addCleanup(services_module.set_services, None)

        payload = _check_vector()
        entry = payload["collections"][GLOBAL_COLLECTION]
        self.assertIn("quantizer_drift", entry)
        # Not asserting "ok" here -- the deterministic test embedder is a
        # bag-of-words hash over shared filler text ("chunk BULK <i> legal
        # text"), so its actual list balance at build time isn't something
        # this test should depend on. What must hold regardless of that is
        # the growth-since-training fraction, which is pure arithmetic.
        self.assertEqual(entry["quantizer_drift"]["added_since_training_pct"], 0.0)

        # Add a large batch on top -- unrelated to whatever the corpus's own
        # embeddings look like, this alone must push growth-since-training
        # past the degraded threshold (+200%) and be visible in the response.
        index = self.services.indexes.get(PUBLIC_COLLECTION)
        shift_rng = np.random.default_rng(1)
        shifted = (10.0 + shift_rng.random((2000, 32)) * 0.01).astype("float32")
        new_ids = list(self.services.metadata.allocate_faiss_ids(2000))
        index.add(new_ids, shifted)

        payload = _check_vector()
        entry = payload["collections"][GLOBAL_COLLECTION]
        drift = entry["quantizer_drift"]
        self.assertEqual(drift["added_since_training"], 2000)
        self.assertGreater(drift["added_since_training_pct"], 200)
        self.assertEqual(drift["severity"], "degraded")
        self.assertEqual(entry["status"], STATUS_DEGRADED)
        self.assertEqual(payload["status"], STATUS_DEGRADED)

    @staticmethod
    def _read_ntotal(path) -> int:
        import faiss

        return int(faiss.read_index(str(path)).ntotal)


class TestBuildIndexRunsWithoutTheFastAPIApp(unittest.TestCase):
    """PRODUCTION_TODO.md T10: build_index.py must be runnable on a rented GPU
    box that has only rag/ and a copy of chunks.db -- no Next.js frontend, no
    Clerk, no FastAPI app in the picture at all.

    Before this task, `rag.core.services.build_services()` -> `DocumentStore`'s
    compressor imported `app.config.settings` for three PDF-compression
    numbers, which since T4a raises `RuntimeError` unless CLERK_JWT_ISSUER and
    RAVENSLAW_CORS_ORIGINS are configured -- settings that have nothing to do
    with embedding and that a GPU box has no reason to carry. That made the
    whole offline build path unusable exactly where T10 says to use it.

    Run as a real subprocess, not in-process: this test session has already
    imported app.config elsewhere (other test files boot the FastAPI app), so
    an in-process check of "was app.config ever imported" would be
    meaningless regardless of whether this bug is fixed -- see
    TestConfigRequiresAnIssuerInProduction in test_security.py for the same
    reasoning applied to app.config's own frozen dataclass defaults.
    """

    BACKEND_ROOT = Path(__file__).resolve().parents[1]

    SCRIPT = """
import sys
sys.path.insert(0, ".")
from rag.core import services as services_module
from rag.core.embeddings import DeterministicEmbedder
from rag.core.sqlite_store import STATUS_COMPLETE
from rag.core.vector_index import PUBLIC_COLLECTION, LOGICAL_COLLECTIONS
import rag.scripts.build_index as build_index_module

config = services_module.get_config()
services = services_module.build_services(config, embedder=DeterministicEmbedder(dimension=config.embed_dim))
services_module.startup(services)

n = 50
ids = list(services.metadata.allocate_faiss_ids(n))
services.metadata.upsert_document(document_id="BULK", collection=PUBLIC_COLLECTION, status=STATUS_COMPLETE)
services.metadata.replace_chunks(
    "BULK", PUBLIC_COLLECTION, [(f"chunk {i} legal text", None) for i in range(n)], ids, owner_id=None,
)
services.indexes.close()

written = build_index_module.build_collections(services, list(LOGICAL_COLLECTIONS))
assert written == n, f"expected {n} vectors, built {written}"

# The actual regression: this must never have needed the FastAPI app's own
# settings module, which requires production auth config this box has none of.
assert "app.config" not in sys.modules, "build_services() pulled in app.config"
print("BUILD_OK", written)
"""

    def test_build_index_boots_and_builds_with_no_app_config_env_at_all(self):
        with tempfile.TemporaryDirectory(prefix="owllex_t10_gpu_box_") as data_root:
            result = subprocess.run(
                [sys.executable, "-c", self.SCRIPT],
                cwd=self.BACKEND_ROOT,
                env={
                    "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
                    "DATA_ROOT": data_root,
                    "EMBED_MODEL": "deterministic-test",
                    "EMBED_DIM": "32",
                    "PARSER_BACKEND": "pypdfium",
                    # Deliberately absent: RAVENSLAW_DEBUG, RAVENSLAW_CORS_ORIGINS,
                    # RAVENSLAW_TRUSTED_HOSTS, CLERK_JWT_ISSUER,
                    # RAVENSLAW_INTERNAL_TOKEN -- none of app.config's required
                    # production settings. A rag-only box has no .env for them.
                },
                capture_output=True,
                text=True,
                timeout=60,
            )
        self.assertEqual(result.returncode, 0, f"stdout={result.stdout!r} stderr={result.stderr!r}")
        self.assertIn("BUILD_OK 50", result.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
