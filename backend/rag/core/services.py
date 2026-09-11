"""Composition root: builds the RAG stack and verifies it on startup.

Everything stateful -- SQLite, LMDB, the embedding model, the FAISS indexes, the
document archive -- is constructed here, once, and handed to the ingest and
retrieval services as constructor arguments. Nothing below this module reaches
for a global. That is what lets a test run the whole pipeline against a temp
``DATA_ROOT`` with a stub embedder, and what keeps the "which store am I talking
to" question answerable by reading one file.

The process-wide singleton exists only for the FastAPI layer, which has no other
way to reach the container from a route function.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass

from .config import RagConfig, ensure_directories, get_config
from .document_store import DocumentStore
from .embeddings import Embedder, build_embedder, embedding_signature
from .hash_index import HashIndex
from .sqlite_store import SqliteStore
from .user_document_store import UserDocumentStore
from .vector_index import COLLECTIONS, VectorIndexRegistry

logger = logging.getLogger("ravenslaw.rag.services")

# SQLite meta key recording which embedding model built the current vectors.
EMBEDDING_SIGNATURE_KEY = "embedding_signature"


@dataclass(frozen=True)
class RagServices:
    """Every dependency the RAG stack needs, resolved."""

    config: RagConfig
    metadata: SqliteStore
    hashes: HashIndex
    embedder: Embedder
    indexes: VectorIndexRegistry
    documents: DocumentStore
    user_documents: UserDocumentStore
    """Private per-user storage. Separate from ``documents`` so no code path can
    reach a user's file while holding the public corpus store."""

    @property
    def signature(self) -> str:
        return embedding_signature(self.embedder.model_name, self.embedder.dimension)


def build_services(config: RagConfig | None = None, embedder: Embedder | None = None) -> RagServices:
    """Construct the container. Pure wiring -- no I/O, no model loading.

    ``embedder`` is injectable so tests (and the rebuild script, which may want a
    different batch size) can supply their own without touching the environment.
    """
    config = config or get_config()
    embedder = embedder or build_embedder(config)

    return RagServices(
        config=config,
        metadata=SqliteStore(config.sqlite_path, busy_timeout_ms=config.sqlite_busy_timeout_ms),
        hashes=HashIndex(config.lmdb_path, map_size_mb=config.lmdb_map_size_mb),
        embedder=embedder,
        indexes=VectorIndexRegistry(
            root=config.faiss_root,
            dimension=embedder.dimension,
            signature=embedding_signature(embedder.model_name, embedder.dimension),
            index_factory=config.faiss_index_factory,
            flush_every=config.faiss_flush_every,
            flush_max=config.faiss_flush_max,
            nprobe=config.faiss_nprobe,
        ),
        documents=DocumentStore(config, compressor=_build_compressor()),
        user_documents=UserDocumentStore(config),
    )


def _build_compressor():
    """Ghostscript recompression, if this image has it. Optional by design."""
    try:
        from rag.app.ingest.compress import compress_pdf
    except ImportError:
        return None
    return compress_pdf


def startup(services: RagServices, *, read_only: bool = False) -> None:
    """Bring the stack up in dependency order, then verify it.

    Order matters: directories must exist before SQLite opens a file in one, and
    the embedding signature must be settled before any index is read, because
    that check is the only thing standing between a model change and a corpus
    that silently returns wrong neighbours.

    ``read_only`` skips ``services.indexes.load_all()`` -- for a caller like
    ``backup_now.py`` that only ever copies the FAISS files on disk and never
    needs them decoded into RAM. It is not only an optimisation: with nothing
    loaded, ``VectorIndexRegistry`` has no index to flush, so ``shutdown()``
    afterwards is a true no-op on FAISS with no separate flag needed there
    (see PRODUCTION_TODO.md T2a).
    """
    config = services.config
    logger.info("Starting RAG stack (DATA_ROOT=%s, read_only=%s)", config.data_root, read_only)

    ensure_directories(config)
    _check_storage_writable(config)

    services.metadata.initialize()
    services.metadata.verify_integrity()

    services.hashes.open()
    services.hashes.verify()

    _check_embedding_signature(services)

    if read_only:
        logger.info("RAG stack ready (read-only): %s", services.metadata.stats())
        return

    services.indexes.load_all()
    _report_index_drift(services)
    _report_partition_violations(services)

    logger.info(
        "RAG stack ready: %d hashes, %s, indexes=%s",
        services.hashes.count(),
        services.metadata.stats(),
        services.indexes.counts(),
    )


def _check_storage_writable(config: RagConfig) -> None:
    """Fail fast if a configured tier root cannot actually be written to.

    ``ensure_directories`` only calls ``mkdir(parents=True, exist_ok=True)``,
    which is a silent no-op on a directory that already exists -- the common
    case on a re-mounted volume, and exactly the case that would otherwise
    hide a read-only mount or a systemd ``ReadWritePaths=``/
    ``RequiresMountsFor=`` mismatch (PRODUCTION_TODO.md T4b) until the first
    real write, which on a query-serving process might not happen until an
    ingest or a FAISS flush minutes or hours into uptime. This performs the
    one syscall that actually exercises it: create a real file, then remove
    it, in each distinct configured root.
    """
    for root in {config.ssd_data_root, config.hdd_data_root}:
        probe = root / ".owllex_write_probe"
        try:
            probe.write_text("")
            probe.unlink()
        except OSError as exc:
            raise RuntimeError(
                f"{root} is not writable: {exc}. If this is running under systemd with "
                f"ProtectSystem=strict, check that ReadWritePaths= includes this exact path "
                f"(see backend/deploy/systemd/*.service and backend/deploy/README.md) and "
                f"that the underlying volume is actually mounted read-write."
            ) from exc


def _check_embedding_signature(services: RagServices) -> None:
    """Record, or enforce, which model produced the stored vectors."""
    stored = services.metadata.get_meta(EMBEDDING_SIGNATURE_KEY)
    current = services.signature

    if stored is None:
        services.metadata.set_meta(EMBEDDING_SIGNATURE_KEY, current)
        logger.info("Embedding signature recorded: %s", current)
        return

    if stored != current:
        has_vectors = services.metadata.stats()["chunk_count"] > 0
        message = (
            f"Configured embeddings '{current}' do not match the corpus, which was built "
            f"with '{stored}'. Re-embed with rag/scripts/rebuild_index.py, or restore the "
            f"matching configuration."
        )
        if has_vectors:
            raise RuntimeError(message)
        # An empty corpus can simply adopt the new model.
        logger.warning("%s Corpus is empty, adopting the new signature.", message)
        services.metadata.set_meta(EMBEDDING_SIGNATURE_KEY, current)


def _report_index_drift(services: RagServices) -> None:
    """Warn when FAISS and SQLite disagree about how much is indexed.

    They can legitimately diverge after an unclean shutdown with
    ``FAISS_FLUSH_EVERY > 1``: chunk rows are committed per document, the index
    is written every N. SQLite keeps the chunk text, so the fix is always a
    rebuild rather than a restore -- but it has to be noticed first.
    """
    for collection in COLLECTIONS:
        expected = services.metadata.stats(collection)["chunk_count"]
        actual = services.indexes.get(collection).ntotal
        if expected != actual:
            logger.warning(
                "Index drift in '%s': SQLite has %d chunks, FAISS has %d vectors. "
                "Run rag/scripts/rebuild_index.py --collection %s to reconcile.",
                collection, expected, actual, collection,
            )


def _report_partition_violations(services: RagServices) -> None:
    """Refuse to serve if any chunk sits in the wrong id partition.

    A private chunk holding a public-range id is returned by every public
    search -- a silent cross-tenant leak that no test on the request path would
    catch, because the request path is behaving correctly. It can only arise
    from a database migrated across the partition change, so it is checked once,
    at boot, and treated as fatal: coming up degraded here means serving other
    people's privileged documents until someone reads the logs.
    """
    violations = services.metadata.mispartitioned_chunks()
    if not violations:
        return

    private_in_public = sum(1 for _, owner, _ in violations if owner is not None)
    raise RuntimeError(
        f"{len(violations)} chunk(s) hold FAISS ids from the wrong partition "
        f"({private_in_public} private chunk(s) inside the public id range, which "
        f"public search would return). Run rag/scripts/rebuild_index.py --all to "
        f"reallocate and re-index them before starting."
    )


def shutdown(services: RagServices) -> None:
    """Flush and close everything. Safe to call on a partially started stack."""
    try:
        services.indexes.close()
    except Exception:
        logger.exception("Failed to flush FAISS indexes on shutdown")
    try:
        services.hashes.close()
    except Exception:
        logger.exception("Failed to close the LMDB hash index")
    try:
        services.metadata.close()
    except Exception:
        logger.exception("Failed to close SQLite")
    logger.info("RAG stack stopped")


# ─── Process-wide singleton (FastAPI only) ───────────────────────────────────

_services: RagServices | None = None
_services_lock = threading.Lock()


def get_services() -> RagServices:
    """The started container. Builds and starts one on first use.

    Routes call this; nothing else should. Application code takes its
    dependencies as arguments so it stays testable.
    """
    global _services
    if _services is not None:
        return _services
    with _services_lock:
        if _services is None:
            services = build_services()
            startup(services)
            _services = services
    return _services


def set_services(services: RagServices | None) -> None:
    """Install a container (or clear it). The seam tests inject through."""
    global _services
    with _services_lock:
        _services = services


def is_started() -> bool:
    return _services is not None
