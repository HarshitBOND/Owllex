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
import sys
import tempfile
import time
import unittest
import uuid
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from rag.core import services as services_module
from rag.core.backup import prune_backups, run_backup
from rag.core.config import RagConfig, set_config
from rag.core.embeddings import DeterministicEmbedder
from rag.core.hash_index import HashEntry, HashIndex
from rag.core.paths import document_relative_path, resolve_court
from rag.core.sqlite_store import STATUS_COMPLETE, STATUS_FAILED, SqliteStore
from rag.core.vector_index import (
    GLOBAL_COLLECTION,
    LOGICAL_COLLECTIONS,
    PUBLIC_COLLECTION,
    USER_COLLECTION,
    VectorIndexRegistry,
)
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


# ─── Ingest job queue (rag/scripts/ingest_worker.py) ─────────────────────────


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


if __name__ == "__main__":
    unittest.main(verbosity=2)
