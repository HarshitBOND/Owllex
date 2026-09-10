"""
Tenant isolation tests for the shared FAISS index.

These are security tests, not feature tests. There is exactly one FAISS index
and every tenant's vectors sit in it side by side; the only thing standing
between one lawyer's privileged documents and another lawyer's search results is
the id allow-list built in SQLite and handed to FAISS. This file exists to make
a regression in that mechanism fail loudly.

The invariant under test, stated once:

    An empty allow-list returns ZERO results. It is never widened into a search
    of the whole index.

Offline: the deterministic test embedder stands in for Qwen3, so what is
exercised is the filtering, not the embedding.

Run:
    cd backend
    .venv/bin/python tests/test_tenant_isolation.py
"""

import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from rag.app.ingest.pipeline import IngestionPipeline
from rag.app.retrieval.retriever import Retriever
from rag.core import services as services_module
from rag.core.config import RagConfig, set_config
from rag.core.embeddings import DeterministicEmbedder
from rag.core.sqlite_store import SqliteStore
from rag.core.vector_index import (
    PRIVATE_ID_MIN,
    PUBLIC_COLLECTION,
    PUBLIC_ID_MIN,
    USER_COLLECTION,
    SearchFilter,
    is_public_id,
)

# Distinctive, non-overlapping vocabularies. With the deterministic embedder,
# similarity is token overlap, so a query built from one tenant's words scores
# high on that tenant's chunks and near zero on anyone else's -- which is what
# makes "did the filter work?" separable from "did ranking work?".
ALPHA_TEXT = "confidential merger agreement zephyr quartz indemnity clause alpha"
BRAVO_TEXT = "confidential lease deed marigold sapphire arbitration clause bravo"
PUBLIC_TEXT = """# Kumar v. State of Delhi

IN THE SUPREME COURT OF INDIA
Neutral Citation: 2026 INSC 793

The appellant challenged the rejection of anticipatory bail under Section 45.
"""


class IsolationTestCase(unittest.TestCase):
    """A real stack -- SQLite, LMDB, FAISS -- rooted in a temp directory."""

    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="owllex_isolation_"))
        self.config = self._config()
        set_config(self.config)
        self.services = services_module.build_services(
            self.config, embedder=DeterministicEmbedder(dimension=self.config.embed_dim)
        )
        services_module.startup(self.services)
        self.pipeline = IngestionPipeline(self.services)
        self.retriever = Retriever(self.services)

    def tearDown(self):
        services_module.shutdown(self.services)
        services_module.set_services(None)
        set_config(None)
        shutil.rmtree(self.root, ignore_errors=True)

    def _config(self) -> RagConfig:
        env = {
            "DATA_ROOT": str(self.root),
            "EMBED_MODEL": "deterministic-test",
            "EMBED_DIM": "64",
            "PARSER_BACKEND": "pypdfium",
        }
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

    # ─── Fixtures ────────────────────────────────────────────────────────────

    def _file(self, name: str, text: str) -> Path:
        path = self.root / "inbox" / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return path

    def ingest_private(self, document_id: str, owner_id: str, text: str) -> None:
        """Index a document owned by one tenant."""
        self.pipeline.ingest(
            self._file(f"{document_id}.txt", text),
            document_id=document_id,
            collection=USER_COLLECTION,
            extra_metadata={"owner_id": owner_id, "corpus_id": f"corpus_{owner_id}"},
            dedupe_scope=owner_id,
            persist_source=False,
        )

    def ingest_public(self, document_id: str, text: str = PUBLIC_TEXT) -> None:
        self.pipeline.ingest(
            self._file(f"{document_id}.txt", text),
            document_id=document_id,
            collection=PUBLIC_COLLECTION,
        )

    def documents_returned(self, hits) -> set[str]:
        return {hit.document_id for hit in hits}


# ─── The five required cases ─────────────────────────────────────────────────


class TestCrossTenantRetrieval(IsolationTestCase):
    def setUp(self):
        super().setUp()
        self.ingest_private("DOC_ALPHA", "user_alpha", ALPHA_TEXT)
        self.ingest_private("DOC_BRAVO", "user_bravo", BRAVO_TEXT)

    def test_user_a_cannot_retrieve_user_b_chunks(self):
        """Even querying B's exact words, A must see only A's documents."""
        hits = self.retriever.search_owned(BRAVO_TEXT, owner_id="user_alpha", top_k=10)
        self.assertNotIn("DOC_BRAVO", self.documents_returned(hits))
        self.assertTrue(set(self.documents_returned(hits)) <= {"DOC_ALPHA"})

    def test_user_b_cannot_retrieve_user_a_chunks(self):
        """The mirror case -- isolation must not depend on ingest order."""
        hits = self.retriever.search_owned(ALPHA_TEXT, owner_id="user_bravo", top_k=10)
        self.assertNotIn("DOC_ALPHA", self.documents_returned(hits))
        self.assertTrue(set(self.documents_returned(hits)) <= {"DOC_BRAVO"})

    def test_each_owner_still_retrieves_their_own(self):
        """Isolation that also blocks the owner would pass the tests above."""
        self.assertEqual(
            self.documents_returned(self.retriever.search_owned(ALPHA_TEXT, "user_alpha")),
            {"DOC_ALPHA"},
        )
        self.assertEqual(
            self.documents_returned(self.retriever.search_owned(BRAVO_TEXT, "user_bravo")),
            {"DOC_BRAVO"},
        )

    def test_empty_owner_returns_empty_list(self):
        """An owner with nothing indexed gets nothing -- never the whole index."""
        hits = self.retriever.search_owned(ALPHA_TEXT, owner_id="user_with_no_documents")
        self.assertEqual(hits, [])

    def test_unknown_owner_cannot_reach_the_public_corpus_either(self):
        """include_public=False means exactly that, even for an empty allow-list."""
        self.ingest_public("PUBLIC_1")
        self.assertEqual(
            self.retriever.search_owned(PUBLIC_TEXT, "ghost", include_public=False), []
        )


class TestRankingWithinTheAllowedSubset(IsolationTestCase):
    """Filtering must not break ordering: the best allowed chunk must come first."""

    def test_similarity_ranking_works_inside_the_allowed_subset(self):
        self.ingest_private("A_MERGER", "user_alpha", ALPHA_TEXT)
        self.ingest_private(
            "A_LEASE", "user_alpha", "unrelated tenancy schedule kilo lima mike november"
        )
        self.ingest_private("B_LEASE", "user_bravo", BRAVO_TEXT)

        hits = self.retriever.search_owned("zephyr quartz indemnity", "user_alpha", top_k=10)

        self.assertTrue(hits, "the owner's own matching document should be returned")
        self.assertEqual(hits[0].document_id, "A_MERGER", "best match must rank first")
        self.assertNotIn("B_LEASE", self.documents_returned(hits))
        # Scores must be ordered best-first; FAISS returns cosine similarity here,
        # so higher is closer.
        self.assertEqual([h.score for h in hits], sorted((h.score for h in hits), reverse=True))

    def test_top_k_is_respected_within_the_subset(self):
        for index in range(5):
            self.ingest_private(f"A_{index}", "user_alpha", f"{ALPHA_TEXT} document number {index}")
        self.assertLessEqual(len(self.retriever.search_owned(ALPHA_TEXT, "user_alpha", top_k=2)), 2)


class TestReingestReplacesVectors(IsolationTestCase):
    """A re-ingested document must replace its vectors, not accumulate them."""

    def test_delete_and_reingest_replaces_vectors_instead_of_duplicating(self):
        self.ingest_private("DOC_ALPHA", "user_alpha", ALPHA_TEXT)
        first_ids = self.services.metadata.faiss_ids_for_owner("user_alpha")
        first_total = self.services.indexes.global_index().ntotal
        content_hash = self.services.metadata.get_document("DOC_ALPHA").content_hash
        self.assertTrue(first_ids)

        # Delete the way the API does, then ingest the same document again.
        freed = self.services.metadata.delete_documents(
            USER_COLLECTION, document_id="DOC_ALPHA", clerk_uid="user_alpha"
        )
        self.services.indexes.global_index().remove(freed)
        self.services.hashes.delete(content_hash)
        self.ingest_private("DOC_ALPHA", "user_alpha", ALPHA_TEXT)

        second_ids = self.services.metadata.faiss_ids_for_owner("user_alpha")

        self.assertEqual(len(second_ids), len(first_ids), "chunk count must not grow")
        self.assertEqual(
            self.services.indexes.global_index().ntotal,
            first_total,
            "the index must not hold two copies of the same document",
        )
        # Ids are never reused, so the replacement set must be disjoint from the
        # freed one -- that is what stops a stale vector resolving to a new row.
        self.assertFalse(set(first_ids) & set(second_ids))
        self.assertEqual(len(self.retriever.search_owned(ALPHA_TEXT, "user_alpha", top_k=50)), 1)

    def test_retry_without_delete_also_replaces(self):
        """A resumed ingest is the same shape and must not duplicate either."""
        self.ingest_private("DOC_ALPHA", "user_alpha", ALPHA_TEXT)
        before = self.services.indexes.global_index().ntotal

        # Drop the commit marker, which is what a crash before the LMDB write
        # leaves behind, then re-run.
        record = self.services.metadata.get_document("DOC_ALPHA")
        self.services.hashes.delete(record.content_hash)
        self.ingest_private("DOC_ALPHA", "user_alpha", ALPHA_TEXT)

        self.assertEqual(self.services.indexes.global_index().ntotal, before)


# ─── The mechanism underneath ────────────────────────────────────────────────


class TestPublicPrivatePartition(IsolationTestCase):
    def test_private_search_never_returns_public_unless_asked(self):
        self.ingest_public("PUBLIC_1")
        self.ingest_private("DOC_ALPHA", "user_alpha", ALPHA_TEXT)

        owned_only = self.retriever.search_owned(PUBLIC_TEXT, "user_alpha", include_public=False)
        self.assertNotIn("PUBLIC_1", self.documents_returned(owned_only))

        with_public = self.retriever.search(PUBLIC_TEXT, owner_id="user_alpha", include_public=True)
        self.assertIn("PUBLIC_1", self.documents_returned(with_public))

    def test_public_search_never_returns_private_documents(self):
        """The case that matters most: an unauthenticated-shaped query."""
        self.ingest_public("PUBLIC_1")
        self.ingest_private("DOC_ALPHA", "user_alpha", ALPHA_TEXT)
        self.ingest_private("DOC_BRAVO", "user_bravo", BRAVO_TEXT)

        for query in (ALPHA_TEXT, BRAVO_TEXT, "confidential clause"):
            returned = self.documents_returned(self.retriever.search_public(query, top_k=50))
            self.assertNotIn("DOC_ALPHA", returned)
            self.assertNotIn("DOC_BRAVO", returned)

    def test_ids_land_in_the_partition_that_matches_their_owner(self):
        self.ingest_public("PUBLIC_1")
        self.ingest_private("DOC_ALPHA", "user_alpha", ALPHA_TEXT)

        rows = self.services.metadata.connection.execute(
            "SELECT owner_id, faiss_id FROM chunks"
        ).fetchall()
        self.assertTrue(rows)
        for row in rows:
            if row["owner_id"] is None:
                self.assertTrue(is_public_id(row["faiss_id"]), "public chunk outside public range")
            else:
                self.assertGreaterEqual(
                    row["faiss_id"], PRIVATE_ID_MIN, "private chunk inside the public range"
                )

    def test_one_physical_index_holds_every_tenant(self):
        """No per-user index, no duplicated vectors."""
        self.ingest_public("PUBLIC_1")
        self.ingest_private("DOC_ALPHA", "user_alpha", ALPHA_TEXT)
        self.ingest_private("DOC_BRAVO", "user_bravo", BRAVO_TEXT)

        index_files = list(self.config.faiss_root.glob("*.faiss"))
        self.assertEqual(len(index_files), 1, f"expected one index file, found {index_files}")
        self.assertEqual(
            self.services.indexes.global_index().ntotal,
            self.services.metadata.stats()["chunk_count"],
        )


class TestDatabaseEnforcesThePartition(unittest.TestCase):
    """The triggers, tested without the pipeline in the way."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = SqliteStore(Path(self.tmp.name) / "chunks.db")
        self.store.initialize()
        self.store.upsert_document(document_id="PUB", collection=PUBLIC_COLLECTION, title="J")
        self.store.upsert_document(
            document_id="OWNED", collection=USER_COLLECTION, clerk_uid="user_alpha"
        )

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def _insert(self, chunk_id, document_id, owner_id, faiss_id):
        with self.store.connection:
            self.store.connection.execute(
                "INSERT INTO chunks(chunk_id, document_id, collection, owner_id, chunk_index,"
                " chunk_text, faiss_id, created_at) VALUES (?,?,?,?,0,'t',?,'now')",
                (chunk_id, document_id, USER_COLLECTION, owner_id, faiss_id),
            )

    def test_private_chunk_cannot_take_a_public_id(self):
        """This is the leak the partition exists to prevent."""
        with self.assertRaises(Exception):
            self._insert("X", "OWNED", "user_alpha", PUBLIC_ID_MIN + 5)

    def test_public_chunk_cannot_take_a_private_id(self):
        with self.assertRaises(Exception):
            self._insert("X", "PUB", None, PRIVATE_ID_MIN + 5)

    def test_chunk_owner_must_match_its_document(self):
        with self.assertRaises(Exception):
            self._insert("X", "PUB", "user_alpha", PRIVATE_ID_MIN + 5)
        with self.assertRaises(Exception):
            self._insert("Y", "OWNED", "user_bravo", PRIVATE_ID_MIN + 6)

    def test_allocation_partitions_do_not_overlap(self):
        public = list(self.store.allocate_faiss_ids(1000))
        private = list(self.store.allocate_faiss_ids(1000, private=True))
        self.assertTrue(all(is_public_id(i) for i in public))
        self.assertTrue(all(i >= PRIVATE_ID_MIN for i in private))
        self.assertFalse(set(public) & set(private))

    def test_blank_owner_is_refused_rather_than_treated_as_a_wildcard(self):
        for blank in ("", "   "):
            with self.assertRaises(ValueError):
                self.store.faiss_ids_for_owner(blank)


class TestSearchFilterSemantics(unittest.TestCase):
    """The scope object itself. No index, no database -- just the decision."""

    def test_empty_allow_list_matches_nothing(self):
        self.assertTrue(SearchFilter.owned_by([]).matches_nothing)

    def test_none_allow_list_is_not_the_same_as_an_empty_one(self):
        """"Not scoped yet" and "scoped to nothing" must stay distinguishable."""
        self.assertFalse(SearchFilter(allowed_ids=None).matches_nothing)
        self.assertTrue(SearchFilter(allowed_ids=[]).matches_nothing)

    def test_empty_allow_list_plus_public_is_still_a_valid_public_search(self):
        self.assertFalse(SearchFilter.owned_by([], include_public=True).matches_nothing)

    def test_unrestricted_must_be_asked_for_explicitly(self):
        self.assertFalse(SearchFilter.public().unrestricted)
        self.assertFalse(SearchFilter.owned_by([1, 2]).unrestricted)
        self.assertTrue(SearchFilter.everything().unrestricted)


if __name__ == "__main__":
    unittest.main(verbosity=2)
