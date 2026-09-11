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
            # T8 raised the production default off 1; pin synchronous flushing
            # here since these tests ingest directly through the pipeline
            # (bypassing ingest_worker's explicit flush_all()) and then
            # inspect on-disk index files.
            "FAISS_FLUSH_EVERY": "1",
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


class TestLexicalRetrievalIsolation(IsolationTestCase):
    """The lexical (FTS5/BM25) lane added by T7 must hold the same boundary
    as the dense one -- both standalone (search_lexical) and once fused into
    the default search()."""

    def setUp(self):
        super().setUp()
        self.ingest_private("DOC_ALPHA", "user_alpha", ALPHA_TEXT)
        self.ingest_private("DOC_BRAVO", "user_bravo", BRAVO_TEXT)

    def test_owner_cannot_reach_another_owners_chunk_via_fts(self):
        hits = self.retriever.search_lexical(BRAVO_TEXT, owner_id="user_alpha", top_k=10)
        self.assertNotIn("DOC_BRAVO", self.documents_returned(hits))
        self.assertTrue(set(self.documents_returned(hits)) <= {"DOC_ALPHA"})

    def test_lexical_empty_owner_returns_empty_list(self):
        """An empty allow-list must never widen into an unfiltered FTS scan."""
        hits = self.retriever.search_lexical(ALPHA_TEXT, owner_id="user_with_no_documents")
        self.assertEqual(hits, [])

    def test_public_lexical_search_never_returns_private_documents(self):
        self.ingest_public("PUBLIC_1")
        for query in (ALPHA_TEXT, BRAVO_TEXT, "confidential clause"):
            returned = self.documents_returned(
                self.retriever.search_lexical(query, top_k=50)
            )
            self.assertNotIn("DOC_ALPHA", returned)
            self.assertNotIn("DOC_BRAVO", returned)

    def test_fused_default_search_holds_the_same_boundary(self):
        """search() calls search_lexical internally and fuses it in -- the
        fusion step itself must not be where isolation quietly breaks."""
        hits = self.retriever.search(BRAVO_TEXT, owner_id="user_alpha", top_k=10)
        self.assertNotIn("DOC_BRAVO", self.documents_returned(hits))


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


class TestTenantIsolationUnderAnIVFIndex(IsolationTestCase):
    """PRODUCTION_TODO.md T5: every test above runs against the default
    ``Flat`` factory, which never exercised ``_build_params``'s
    ``SearchParametersIVF``/``nprobe`` path at all -- ``faiss.SearchParameters()``
    (the base class) raises immediately against a real IVF index, so this is
    the class of bug Flat-only testing cannot catch. Re-runs the two sharpest
    cross-tenant cases from ``TestCrossTenantRetrieval``/``TestPublicPrivatePartition``
    under ``IVF16,PQ4np`` with a real, configured ``nprobe`` instead.

    Cannot reuse ``IsolationTestCase.setUp`` unmodified: an IVF index must be
    trained on at least ``nlist`` vectors before its first ``add()``, and these
    fixtures' documents are one or two chunks each -- nowhere near enough in a
    single ingest call. Bulk-training a corpus in general is T9's job, not
    this one's; this only needs the index in a *searchable* state, so it
    pre-trains directly with a synthetic batch, using ids far outside anything
    a real ingest below allocates.
    """

    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="owllex_isolation_ivf_"))
        env = {
            "DATA_ROOT": str(self.root),
            "EMBED_MODEL": "deterministic-test",
            "EMBED_DIM": "64",
            "PARSER_BACKEND": "pypdfium",
            "FAISS_INDEX_FACTORY": "IVF16,PQ4np",
            # Exhaustive over all 16 lists on purpose: this test is about
            # SearchParametersIVF/nprobe actually taking effect and isolation
            # holding under IVF, not about recall at a realistic nprobe --
            # FAISS's own nprobe default (1) would make a real hit's absence
            # from the results ambiguous between "filtered out" (what's under
            # test) and "the wrong list was probed" (a different question).
            "FAISS_NPROBE": "16",
        }
        self._previous_env = {k: os.environ.get(k) for k in env}
        os.environ.update(env)
        self.config = RagConfig.from_env()
        set_config(self.config)
        self.services = services_module.build_services(
            self.config, embedder=DeterministicEmbedder(dimension=self.config.embed_dim)
        )
        services_module.startup(self.services)
        self.pipeline = IngestionPipeline(self.services)
        self.retriever = Retriever(self.services)

        import numpy as np

        # 650, not 16: VectorIndex._train (PRODUCTION_TODO.md T9a) now refuses
        # to train on fewer than 39x nlist vectors -- FAISS's own recommended
        # minimum, below which it merely warns and produces a degenerate
        # quantizer instead of raising -- so IVF16 needs at least 624. PQ4 (4
        # sub-quantizers, default 8 bits each) separately trains its own
        # per-subquantizer clustering to 256 centroids independently of IVF's
        # nlist and FAISS hard-errors below that regardless of any guard; the
        # number this needs to clear is whichever of the two is larger, and
        # since T9a, that is the 624 figure, not PQ4's 256.
        rng = np.random.default_rng(0)
        synthetic = rng.normal(size=(650, self.config.embed_dim)).astype("float32")
        import faiss as _faiss

        _faiss.normalize_L2(synthetic)
        # Comfortably inside the public partition but far above anything this
        # test's own document ingests will allocate, so a synthetic vector
        # never collides with a real id and is silently dropped by
        # Retriever._hydrate (no matching chunk row) if it ever surfaces in a
        # result -- it is there purely to satisfy IVF/PQ's training minimums.
        synthetic_ids = np.arange(10_000_000, 10_000_650, dtype=np.int64)
        self.services.indexes.global_index().add(synthetic_ids, synthetic)

    def tearDown(self):
        services_module.shutdown(self.services)
        services_module.set_services(None)
        set_config(None)
        shutil.rmtree(self.root, ignore_errors=True)
        for key, value in self._previous_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def test_search_does_not_raise_on_a_real_ivf_index(self):
        """The literal bug: SearchParameters() rejected outright by IndexIVF."""
        self.ingest_public("PUBLIC_1")
        hits = self.retriever.search_public(PUBLIC_TEXT, top_k=5)
        self.assertTrue(hits)
        self.assertEqual(self.documents_returned(hits), {"PUBLIC_1"})

    def test_user_a_cannot_retrieve_user_b_chunks_under_ivf(self):
        self.ingest_private("DOC_ALPHA", "user_alpha", ALPHA_TEXT)
        self.ingest_private("DOC_BRAVO", "user_bravo", BRAVO_TEXT)

        hits = self.retriever.search_owned(BRAVO_TEXT, owner_id="user_alpha", top_k=10)
        self.assertNotIn("DOC_BRAVO", self.documents_returned(hits))
        self.assertTrue(set(self.documents_returned(hits)) <= {"DOC_ALPHA"})

    def test_public_search_never_returns_private_documents_under_ivf(self):
        self.ingest_public("PUBLIC_1")
        self.ingest_private("DOC_ALPHA", "user_alpha", ALPHA_TEXT)

        returned = self.documents_returned(self.retriever.search_public(ALPHA_TEXT, top_k=50))
        self.assertNotIn("DOC_ALPHA", returned)

    def test_configured_nprobe_actually_reaches_faiss(self):
        """Not just "doesn't crash" -- the configured value is what gets used."""
        from unittest.mock import patch

        self.ingest_public("PUBLIC_1")
        index = self.services.indexes.global_index()
        real_search = index.index.search
        seen_nprobe = []

        def spy(*args, **kwargs):
            params = kwargs.get("params")
            seen_nprobe.append(getattr(params, "nprobe", None))
            return real_search(*args, **kwargs)

        with patch.object(index.index, "search", side_effect=spy):
            self.retriever.search_public(PUBLIC_TEXT, top_k=5)

        self.assertEqual(seen_nprobe, [16])


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
