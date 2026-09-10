"""LMDB content-hash index -- O(1) duplicate detection before any parsing.

Key:   SHA-256 of the PDF (hex).
Value: JSON ``{"document_id": ..., "file_path": ..., "court": ...}``.

This is the cheapest gate in the pipeline and it sits in front of the most
expensive stages: a hit means the document is already in the corpus, so Docling,
the embedding model and FAISS are never touched. Lookups are against an on-disk
B-tree, so memory stays flat regardless of corpus size -- nothing is loaded at
startup.

Values written before this module existed were bare ``document_id`` strings.
:meth:`HashIndex.get` still reads those, so the index does not need a rewrite to
be usable; ``rag/scripts/migrate_hash_values.py`` upgrades them in place.
"""

from __future__ import annotations

import json
import logging
import threading
from dataclasses import asdict, dataclass
from pathlib import Path

import lmdb

logger = logging.getLogger("ravenslaw.rag.hashindex")


@dataclass(frozen=True)
class HashEntry:
    """What is known about a document identified purely by its hash."""

    document_id: str
    file_path: str | None = None
    court: str | None = None

    def to_json(self) -> str:
        return json.dumps(asdict(self), separators=(",", ":"))

    @classmethod
    def parse(cls, raw: bytes) -> "HashEntry":
        text = raw.decode("utf-8", errors="replace")
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            # Legacy format: the whole value was the document id.
            return cls(document_id=text)
        if not isinstance(payload, dict):
            return cls(document_id=str(payload))
        return cls(
            document_id=str(payload.get("document_id", "")),
            file_path=payload.get("file_path"),
            court=payload.get("court"),
        )


class HashIndex:
    """LMDB environment wrapper.

    **One open instance per path per process.** LMDB refuses to open the same
    environment twice in one process, so a second :class:`RagServices` pointed at
    the same ``LMDB_PATH`` fails at :meth:`open` until the first is closed. That
    is the intended shape -- one container per process -- and the reason
    :func:`rag.core.services.shutdown` closes this explicitly rather than leaving
    it to the garbage collector.
    """

    def __init__(self, path: Path | str, map_size_mb: int = 4096) -> None:
        self._path = Path(path)
        self._map_size = map_size_mb * 1024 * 1024
        self._env: lmdb.Environment | None = None
        self._lock = threading.Lock()

    @property
    def path(self) -> Path:
        return self._path

    @property
    def env(self) -> lmdb.Environment:
        if self._env is None:
            raise RuntimeError("HashIndex is not open -- call open() during startup")
        return self._env

    def open(self) -> "HashIndex":
        """Open (creating if needed) the LMDB environment. Idempotent."""
        if self._env is not None:
            return self
        with self._lock:
            if self._env is None:
                self._path.mkdir(parents=True, exist_ok=True)
                self._env = lmdb.open(str(self._path), map_size=self._map_size, max_dbs=0)
                logger.info("LMDB hash index ready at %s (%d entries)", self._path, self.count())
        return self

    def close(self) -> None:
        with self._lock:
            if self._env is not None:
                self._env.close()
                self._env = None

    # ─── Reads ───────────────────────────────────────────────────────────────

    def exists(self, content_hash: str) -> bool:
        with self.env.begin() as txn:
            return txn.get(content_hash.encode()) is not None

    def get(self, content_hash: str) -> HashEntry | None:
        with self.env.begin() as txn:
            raw = txn.get(content_hash.encode())
        return HashEntry.parse(raw) if raw is not None else None

    def count(self) -> int:
        with self.env.begin() as txn:
            return txn.stat()["entries"]

    # ─── Writes ──────────────────────────────────────────────────────────────

    def put(
        self,
        content_hash: str,
        document_id: str,
        file_path: str | None = None,
        court: str | None = None,
    ) -> None:
        entry = HashEntry(document_id=document_id, file_path=file_path, court=court)
        with self.env.begin(write=True) as txn:
            txn.put(content_hash.encode(), entry.to_json().encode())

    def delete(self, content_hash: str) -> bool:
        with self.env.begin(write=True) as txn:
            return txn.delete(content_hash.encode())

    # ─── Maintenance ─────────────────────────────────────────────────────────

    def snapshot(self, destination: Path | str) -> Path:
        """Write a compacted copy of the environment into ``destination``.

        LMDB's own copy is a consistent read-transaction snapshot, so this is
        safe to run against a live index while ingestion continues -- which is
        what makes the nightly backup non-disruptive.
        """
        destination = Path(destination)
        destination.mkdir(parents=True, exist_ok=True)
        self.env.copy(str(destination), compact=True)
        return destination

    def verify(self) -> None:
        """Cheap readability check, run at startup alongside the other stores."""
        self.count()
