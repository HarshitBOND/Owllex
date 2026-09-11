"""Central configuration for the self-hosted RAG stack.

Every persistent path and every tunable the ingest/retrieval stack reads comes
from here, resolved from the environment exactly once. Nothing below this module
is allowed to call ``os.getenv`` for a path or to join one against ``__file__``:
the code lives on the system disk and the data lives on the mounted HDD, and the
two must be able to move independently.

Storage is two-tier, because the access patterns are not alike. Set
``SSD_DATA_ROOT`` and ``HDD_DATA_ROOT`` and every path below derives from the
right one:

    $SSD_DATA_ROOT              small, fast, random-access, expensive per GB
        /sqlite/chunks.db       thousands of small random reads per query
        /lmdb/hashdb            a B-tree probe per ingested document
        /logs

    $HDD_DATA_ROOT              large, cheap, mostly sequential or write-once
        /legal_corpus/{sci,hc/<bench>,...}   public, owner_id IS NULL
        /users/<user_id>/{contracts,...}     private, owner-scoped
        /faiss                  read once at boot into RAM, rewritten in bulk
        /archive                immutable originals
        /backups
        /inbox

The split follows from what each store actually does. SQLite and LMDB serve the
latency-critical path -- a metadata lookup sits inside every search, and on
spinning disks a few thousand random 4K reads is tens of milliseconds of seek
time. The PDFs and the FAISS files are the opposite: enormous, immutable or
rewritten wholesale, and read sequentially. Paying SSD prices per GB for them is
the single largest avoidable cost in this system.

``DATA_ROOT`` remains supported and is the default for both tiers, so a
single-volume deployment keeps working unchanged with one variable set.

The two document trees are deliberately siblings on the same volume rather than
one tree with a visibility column deciding the subdirectory. They have different
access rules (one is served to any authenticated user, the other only to its
owner), different backup cadences, and different permissions -- ``users/`` is
0700 all the way down -- and keeping them apart means a bug in the corpus path
builder cannot address a user's file, and vice versa.

The two roots that are *not* under DATA_ROOT are deliberate: ``APP_ROOT`` is the
checkout on the system SSD and ``LOG_ROOT`` is ``/var/log/owllex``. Code and logs
belong to the machine; everything under DATA_ROOT belongs to the volume, and the
machine can be rebuilt from git while the volume cannot.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("ravenslaw.rag.config")

# Fallback DATA_ROOT for developer machines that have no mounted volume. A
# production host sets DATA_ROOT=/data; this default only keeps `pytest` and a
# laptop checkout working without one.
_DEFAULT_DATA_ROOT = "/data"

# The application checkout and the log directory live on the system disk, not on
# the data volume, so they get their own defaults rather than deriving from
# DATA_ROOT. Both match what deploy/deploy.sh creates.
_DEFAULT_APP_ROOT = "/opt/owllex"
_DEFAULT_LOG_ROOT = "/var/log/owllex"

_TRUE = {"1", "true", "yes", "on"}

# Ceiling on how many candidates a search over-fetches before hydration,
# regardless of RETRIEVAL_OVERFETCH * top_k. Matches the widest figure in
# FAISS_ARCHITECTURE.md's §5 tier table (tier 4: over-fetch 300) -- past that
# the extra SQLite hydration cost buys no measurable recall.
_RETRIEVAL_OVERFETCH_CEILING = 300


def _flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    return default if raw is None else raw.strip().lower() in _TRUE


def _int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer, got {raw!r}") from exc


def _path(name: str, default: Path) -> Path:
    raw = os.getenv(name, "").strip()
    return Path(raw).expanduser() if raw else default


@dataclass(frozen=True)
class RagConfig:
    """Resolved, absolute configuration. Build it with :meth:`from_env`."""

    # ─── Storage layout ──────────────────────────────────────────────────────
    data_root: Path
    ssd_data_root: Path
    hdd_data_root: Path
    legal_corpus_root: Path
    users_root: Path
    faiss_root: Path
    sqlite_path: Path
    lmdb_path: Path
    backup_root: Path
    private_root: Path
    inbox_root: Path
    archive_root: Path
    app_root: Path
    log_root: Path

    # ─── Embeddings ──────────────────────────────────────────────────────────
    embed_model: str
    embed_dim: int
    embed_batch_size: int
    embed_device: str
    embed_max_seq_length: int
    embed_normalize: bool
    embed_trust_remote_code: bool

    # ─── Vector index ────────────────────────────────────────────────────────
    faiss_index_factory: str
    faiss_train_threshold: int
    faiss_flush_every: int
    faiss_flush_max: int
    faiss_nprobe: int
    retrieval_overfetch: int

    # ─── Metadata store ──────────────────────────────────────────────────────
    sqlite_busy_timeout_ms: int
    lmdb_map_size_mb: int

    # ─── Ingestion ───────────────────────────────────────────────────────────
    parser_backend: str
    chunk_size: int
    chunk_overlap: int
    ocr_enabled: bool

    # ─── Backups ─────────────────────────────────────────────────────────────
    backup_retention_days: int
    backup_enabled: bool
    backup_hour: int
    backup_minute: int
    backup_documents: bool
    backup_documents_link_dest: bool
    backup_users: bool
    backup_weekly_weekday: int
    rsync_binary: str

    # ─── User documents ──────────────────────────────────────────────────────
    max_user_document_mb: int
    max_user_documents_per_owner: int
    user_quota_mb: int


    @classmethod
    def from_env(cls) -> "RagConfig":
        data_root = _path("DATA_ROOT", Path(_DEFAULT_DATA_ROOT)).resolve()
        # Both tiers fall back to DATA_ROOT, so an existing single-volume
        # deployment is bit-for-bit unchanged until it opts into the split.
        ssd_data_root = _path("SSD_DATA_ROOT", data_root).resolve()
        hdd_data_root = _path("HDD_DATA_ROOT", data_root).resolve()

        # ─── HDD: bulk, immutable, sequential ────────────────────────────────
        legal_corpus_root = _resolve_legal_corpus_root(hdd_data_root)
        # Private per-user documents. A sibling of the corpus, never inside it:
        # the corpus tree is served to any authenticated user, this one only ever
        # to the row's owner, and no path built for one can address the other.
        users_root = _path("USERS_ROOT", hdd_data_root / "users")
        # Read once at boot into RAM and rewritten in full on flush -- entirely
        # sequential, so the HDD costs nothing that matters here.
        faiss_root = _path("FAISS_ROOT", hdd_data_root / "faiss")
        backup_root = _path("BACKUP_ROOT", hdd_data_root / "backups")
        # Caller-keyed objects written by /documents/compress. Kept out of the
        # corpus tree because that one is laid out by court, and these are opaque
        # per-user keys owned by the Next app.
        private_root = _path("PRIVATE_ROOT", hdd_data_root / "private")
        # Drop directory drained by rag/scripts/ingest_worker.py. On the HDD
        # because the files in it are corpus PDFs waiting their turn, and staging
        # gigabytes on the SSD would defeat the point of the split.
        inbox_root = _path("INBOX_ROOT", hdd_data_root / "inbox")
        # Cold storage for immutable originals -- superseded corpus snapshots,
        # bulk import tarballs. Nothing reads it on the request path.
        archive_root = _path("ARCHIVE_ROOT", hdd_data_root / "archive")

        # ─── SSD: small, random-access, latency-critical ─────────────────────
        # A metadata lookup sits inside every single search; on a spinning disk
        # those random reads are what the query would spend most of its time on.
        sqlite_path = _path("SQLITE_PATH", ssd_data_root / "sqlite" / "chunks.db")
        lmdb_path = _path("LMDB_PATH", ssd_data_root / "lmdb" / "hashdb")

        app_root = _path("APP_ROOT", Path(_DEFAULT_APP_ROOT))
        # Logs follow the SSD when the tiers are split, and stay at the system
        # location when they are not, so a single-volume host is unchanged.
        default_log_root = (
            ssd_data_root / "logs" if ssd_data_root != data_root else Path(_DEFAULT_LOG_ROOT)
        )
        log_root = _path("LOG_ROOT", default_log_root)

        cfg = cls(
            data_root=data_root,
            ssd_data_root=ssd_data_root,
            hdd_data_root=hdd_data_root,
            legal_corpus_root=legal_corpus_root,
            users_root=users_root,
            faiss_root=faiss_root,
            sqlite_path=sqlite_path,
            lmdb_path=lmdb_path,
            backup_root=backup_root,
            private_root=private_root,
            inbox_root=inbox_root,
            archive_root=archive_root,
            app_root=app_root,
            log_root=log_root,
            embed_model=os.getenv("EMBED_MODEL", "qwen3-embedding-8b").strip(),
            # Qwen3-Embedding-8B emits 4096 dimensions natively but is trained
            # with Matryoshka representation learning, so a truncated prefix is
            # still a valid embedding. 1024 is the default because the index is
            # what sets the RAM ceiling: at 4096 dims a 4M-chunk corpus needs
            # ~64GB of float32 just for a flat index, which does not fit the
            # 32GB box. Raise it only alongside a compressed index factory.
            embed_dim=_int("EMBED_DIM", 1024),
            embed_batch_size=_int("EMBED_BATCH_SIZE", 8),
            embed_device=os.getenv("EMBED_DEVICE", "auto").strip(),
            embed_max_seq_length=_int("EMBED_MAX_SEQ_LENGTH", 1024),
            embed_normalize=_flag("EMBED_NORMALIZE", True),
            embed_trust_remote_code=_flag("EMBED_TRUST_REMOTE_CODE", True),
            faiss_index_factory=os.getenv("FAISS_INDEX_FACTORY", "Flat").strip(),
            faiss_train_threshold=_int("FAISS_TRAIN_THRESHOLD", 10_000),
            # flush() rewrites the whole file, so a fixed threshold is right at
            # tier 1 and catastrophic write amplification at tier 3 -- see
            # VectorIndex._effective_flush_threshold. 1000 is the floor;
            # FAISS_FLUSH_MAX below is the ceiling.
            faiss_flush_every=_int("FAISS_FLUSH_EVERY", 1_000),
            faiss_flush_max=_int("FAISS_FLUSH_MAX", 100_000),
            # How many inverted lists an IVF search probes. Irrelevant for
            # Flat/HNSW. FAISS defaults this to 1 -- at tier 3's 131,072 lists
            # that is roughly 3,400 of 450M vectors probed, i.e. low-single-
            # digit recall@10, silently. FAISS_ARCHITECTURE.md §5's tier table:
            # 16 / 32 / 64 / 96 for tiers 1-4.
            faiss_nprobe=_int("FAISS_NPROBE", 16),
            # PQ/IVF distances are approximate: the true top-k is reliably
            # *inside* the top `RETRIEVAL_OVERFETCH * k` candidates but not
            # reliably at the front of it. Irrelevant for Flat (exact
            # distances), harmless to leave on regardless.
            # FAISS_ARCHITECTURE.md §5.
            retrieval_overfetch=_int("RETRIEVAL_OVERFETCH", 10),
            sqlite_busy_timeout_ms=_int("SQLITE_BUSY_TIMEOUT_MS", 15_000),
            lmdb_map_size_mb=_int("LMDB_MAP_SIZE_MB", _int("HASH_DB_MAP_SIZE_MB", 4096)),
            parser_backend=os.getenv("PARSER_BACKEND", "docling").strip().lower(),
            chunk_size=_int("CHUNK_SIZE", 2000),
            chunk_overlap=_int("CHUNK_OVERLAP", 200),
            ocr_enabled=_flag("OCR_ENABLED", True),
            backup_retention_days=_int("BACKUP_RETENTION_DAYS", 14),
            backup_enabled=_flag("BACKUP_ENABLED", True),
            backup_hour=_int("BACKUP_HOUR", 3),
            backup_minute=_int("BACKUP_MINUTE", 30),
            # PDFs are mirrored incrementally (rsync, hard-linked against the
            # previous snapshot) rather than skipped. See rag/core/backup.py for
            # why that costs almost nothing per night.
            backup_documents=_flag("BACKUP_DOCUMENTS", True),
            backup_documents_link_dest=_flag("BACKUP_DOCUMENTS_LINK_DEST", True),
            # The private tree is backed up on the same incremental mechanism but
            # on the weekly cadence, because it is small, changes slowly, and a
            # nightly rsync of it would walk every user's directory for nothing.
            backup_users=_flag("BACKUP_USERS", True),
            # 0 = Monday, matching datetime.weekday(). The weekly document mirror
            # runs on whichever nightly job lands on this day.
            backup_weekly_weekday=_int("BACKUP_WEEKLY_WEEKDAY", 6),
            rsync_binary=os.getenv("RSYNC_BINARY", "rsync").strip() or "rsync",
            max_user_document_mb=_int("MAX_USER_DOCUMENT_MB", 50),
            max_user_documents_per_owner=_int("MAX_USER_DOCUMENTS_PER_OWNER", 2000),
            # Per-owner byte ceiling. 0 disables the check; anything else is
            # enforced on every upload, because on a single mounted volume one
            # user filling the disk takes ingestion and SQLite down with them.
            user_quota_mb=_int("USER_QUOTA_MB", 5120),
        )
        cfg.validate()
        return cfg

    # ─── Derived paths ───────────────────────────────────────────────────────

    @property
    def managed_dirs(self) -> tuple[Path, ...]:
        """Every directory :func:`ensure_directories` creates on startup."""
        # data_root is only created when it is actually a tier. Once
        # SSD_DATA_ROOT and HDD_DATA_ROOT are set it is a legacy fallback that
        # nothing reads, and creating it would fail on a host where the old
        # single-volume mount point no longer exists.
        dirs = [
            self.ssd_data_root,
            self.hdd_data_root,
            self.legal_corpus_root,
            self.users_root,
            self.faiss_root,
            self.sqlite_path.parent,
            self.lmdb_path,
            self.backup_root,
            self.private_root,
            self.inbox_root,
            self.archive_root,
        ]
        # Only created when it is ours to create. The default on a single-volume
        # host is /var/log/owllex, which belongs to the machine and is set up by
        # deploy/deploy.sh with the right owner -- creating it here as whoever
        # the service happens to run as would take that decision away.
        if _contains(self.ssd_data_root, self.log_root):
            dirs.append(self.log_root)
        return tuple(dirs)

    @property
    def storage_is_split(self) -> bool:
        """True when SSD and HDD tiers are on different volumes.

        Reported at startup so a host that was meant to be split but silently
        fell back to one volume is visible in the logs rather than only in the
        disk-usage graph three months later.
        """
        return self.ssd_data_root != self.hdd_data_root

    @property
    def restricted_dirs(self) -> tuple[Path, ...]:
        """Directories created 0700 rather than with the default umask.

        Everything holding a user's own files. The mode is re-applied on every
        boot rather than only at creation, so a directory loosened by hand (or by
        a restore that did not preserve permissions) is tightened again by the
        next restart instead of staying world-readable until someone notices.
        """
        return (self.users_root, self.private_root)

    @property
    def pdf_root(self) -> Path:
        """Legacy alias for :attr:`legal_corpus_root`.

        The corpus tree was ``$DATA_ROOT/documents`` and the config field was
        ``pdf_root``. Both names are still in the ingest pipeline and in the
        scripts, so the alias stays until those are renamed; there is exactly one
        directory behind it.
        """
        return self.legal_corpus_root

    def faiss_index_path(self, collection: str) -> Path:
        """On-disk location of one collection's FAISS index."""
        return self.faiss_root / f"{collection}.faiss"

    def overfetch_k(self, top_k: int) -> int:
        """How many candidates to pull from FAISS before hydration and re-sort.

        ``RETRIEVAL_OVERFETCH * top_k``, clamped to a ceiling so a large
        ``top_k`` cannot force an unbounded FAISS scan or SQLite hydration.
        Every retrieval path over-fetches through this one method rather than
        each computing its own multiple, so the clamp and the tuning knob stay
        in one place. See FAISS_ARCHITECTURE.md §5.
        """
        if top_k <= 0:
            return top_k
        # max(..., top_k): the ceiling bounds how much *extra* over-fetching
        # costs, it must never cut into the caller's own requested top_k.
        return min(top_k * self.retrieval_overfetch, max(_RETRIEVAL_OVERFETCH_CEILING, top_k))

    def absolute_document_path(self, relative_path: str) -> Path:
        """Resolve a SQLite-stored relative path against the document root.

        SQLite stores relative paths only, so the whole corpus can be remounted
        at a different point without rewriting the database.
        """
        return self.legal_corpus_root / relative_path

    def absolute_user_document_path(self, storage_path: str) -> Path:
        """Resolve a SQLite-stored private ``storage_path`` against USERS_ROOT.

        Unvalidated on purpose -- this only joins. Every caller goes through
        :class:`rag.core.user_document_store.UserDocumentStore`, which is what
        refuses a path that escapes the root. Nothing should call this directly.
        """
        return self.users_root / storage_path

    # ─── Validation ──────────────────────────────────────────────────────────

    def validate(self) -> None:
        if self.embed_dim <= 0:
            raise RuntimeError("EMBED_DIM must be > 0")
        if self.faiss_nprobe <= 0:
            raise RuntimeError("FAISS_NPROBE must be > 0")
        if self.faiss_flush_every <= 0:
            raise RuntimeError("FAISS_FLUSH_EVERY must be > 0")
        if self.faiss_flush_max < self.faiss_flush_every:
            raise RuntimeError("FAISS_FLUSH_MAX must be >= FAISS_FLUSH_EVERY")
        if self.retrieval_overfetch <= 0:
            raise RuntimeError("RETRIEVAL_OVERFETCH must be > 0")
        if self.embed_batch_size <= 0:
            raise RuntimeError("EMBED_BATCH_SIZE must be > 0")
        if self.chunk_size <= 0:
            raise RuntimeError("CHUNK_SIZE must be > 0")
        if not 0 <= self.chunk_overlap < self.chunk_size:
            raise RuntimeError("CHUNK_OVERLAP must be >= 0 and < CHUNK_SIZE")
        if self.lmdb_map_size_mb <= 0:
            raise RuntimeError("LMDB_MAP_SIZE_MB must be > 0")
        if self.backup_retention_days < 1:
            raise RuntimeError("BACKUP_RETENTION_DAYS must be >= 1")
        if not 0 <= self.backup_hour <= 23:
            raise RuntimeError("BACKUP_HOUR must be between 0 and 23")
        if not 0 <= self.backup_minute <= 59:
            raise RuntimeError("BACKUP_MINUTE must be between 0 and 59")
        if self.parser_backend not in ("docling", "pypdfium"):
            raise RuntimeError("PARSER_BACKEND must be 'docling' or 'pypdfium'")
        if not 0 <= self.backup_weekly_weekday <= 6:
            raise RuntimeError("BACKUP_WEEKLY_WEEKDAY must be between 0 (Mon) and 6 (Sun)")
        if self.max_user_document_mb <= 0:
            raise RuntimeError("MAX_USER_DOCUMENT_MB must be > 0")
        if self.max_user_documents_per_owner <= 0:
            raise RuntimeError("MAX_USER_DOCUMENTS_PER_OWNER must be > 0")
        if self.user_quota_mb < 0:
            raise RuntimeError("USER_QUOTA_MB must be >= 0 (0 disables the quota)")

        # The private tree must not be reachable through the public one. If it
        # were, a corpus path built from a court name could be steered into a
        # user's directory and served to every authenticated caller -- so this is
        # checked at boot rather than trusted to the path builders.
        for name, private in (("USERS_ROOT", self.users_root), ("PRIVATE_ROOT", self.private_root)):
            if _contains(self.legal_corpus_root, private) or _contains(private, self.legal_corpus_root):
                raise RuntimeError(
                    f"{name} ({private}) and the legal corpus ({self.legal_corpus_root}) must be "
                    f"separate trees -- neither may contain the other."
                )
        if _contains(self.users_root, self.private_root) or _contains(self.private_root, self.users_root):
            raise RuntimeError(
                f"USERS_ROOT ({self.users_root}) and PRIVATE_ROOT ({self.private_root}) must be "
                f"separate trees -- neither may contain the other."
            )

        # The point of the split is that bulk data is NOT on the expensive
        # volume. A FAISS index or a corpus tree that resolved onto the SSD would
        # fill it and take SQLite -- and therefore every search -- down with it,
        # so an explicit override that lands in the wrong tier is refused rather
        # than warned about.
        if self.storage_is_split:
            for name, path in (
                ("FAISS_ROOT", self.faiss_root),
                ("LEGAL_CORPUS_ROOT", self.legal_corpus_root),
                ("USERS_ROOT", self.users_root),
                ("ARCHIVE_ROOT", self.archive_root),
                ("BACKUP_ROOT", self.backup_root),
                ("INBOX_ROOT", self.inbox_root),
            ):
                if _contains(self.ssd_data_root, path):
                    raise RuntimeError(
                        f"{name} ({path}) resolves onto SSD_DATA_ROOT "
                        f"({self.ssd_data_root}). Bulk data belongs under "
                        f"HDD_DATA_ROOT ({self.hdd_data_root})."
                    )


def _contains(parent: Path, child: Path) -> bool:
    """True when ``child`` is ``parent`` or sits underneath it.

    Purely lexical on the resolved paths -- neither directory need exist yet, and
    this runs during config validation, before anything is created.
    """
    try:
        Path(child).resolve().relative_to(Path(parent).resolve())
    except (ValueError, OSError):
        return False
    return True


def _resolve_legal_corpus_root(data_root: Path) -> Path:
    """Where the public corpus lives, honouring the pre-rename layout.

    The tree used to be ``$DATA_ROOT/documents`` under ``PDF_ROOT``; it is
    ``$DATA_ROOT/legal_corpus`` now. An explicit ``LEGAL_CORPUS_ROOT`` (or the
    legacy ``PDF_ROOT``) always wins. Failing that, an existing ``documents/``
    directory with something in it is used as-is: silently switching a live
    deployment to an empty new directory would present the corpus as gone and
    let a re-ingest write a second copy of every PDF.
    """
    explicit = os.getenv("LEGAL_CORPUS_ROOT", "").strip() or os.getenv("PDF_ROOT", "").strip()
    if explicit:
        return Path(explicit).expanduser()

    renamed = data_root / "legal_corpus"
    legacy = data_root / "documents"
    if not renamed.exists() and legacy.is_dir() and any(legacy.iterdir()):
        logger.warning(
            "Using the pre-rename corpus directory %s. Rename it to %s (or set "
            "LEGAL_CORPUS_ROOT) to match the documented layout.",
            legacy, renamed,
        )
        return legacy
    return renamed


def ensure_directories(config: RagConfig) -> None:
    """Create the storage layout if it is missing. Idempotent.

    Directories holding user files are created *and re-tightened* to 0700 on
    every boot. Creating them 0700 once is not enough: a restore from a backup
    taken with a different umask, or an operator's ``mkdir -p``, leaves a
    world-readable directory that nothing would otherwise correct.
    """
    for directory in config.managed_dirs:
        directory.mkdir(parents=True, exist_ok=True)

    for directory in config.restricted_dirs:
        try:
            directory.chmod(0o700)
        except OSError as exc:
            # Not fatal: an NFS or CIFS mount may refuse chmod outright, and the
            # backend routes are the real access control either way. It must not
            # pass unremarked, though -- on a normal ext4 volume this failing
            # means the directory is owned by someone else.
            logger.warning("Could not enforce 0700 on %s: %s", directory, exc)


_config: RagConfig | None = None


def get_config() -> RagConfig:
    """Process-wide config singleton, built on first use."""
    global _config
    if _config is None:
        _config = RagConfig.from_env()
    return _config


def set_config(config: RagConfig | None) -> None:
    """Override the singleton. Tests use this to point at a temp DATA_ROOT."""
    global _config
    _config = config
