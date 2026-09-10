"""Persistent PDF storage on the mounted HDD. Replaces Cloudflare R2.

``PDF_ROOT`` (``/data/documents``) is assumed to be on the Hetzner volume, not
the VPS system disk. Documents are content-addressed and filed by court and
year, exactly as :mod:`rag.core.paths` lays out:

    /data/documents/sci/2026/<sha256>.pdf

SQLite stores the **relative** path (``sci/2026/<sha256>.pdf``) so the volume can
be remounted elsewhere without a database rewrite, and :func:`resolve` is the
only way back to an absolute path -- it refuses anything that escapes the root,
because ``file_path`` is data and a bad row must not be able to address
arbitrary files.

Writes are atomic (temp file + rename) and idempotent: a document whose hash is
already on disk is not rewritten, so a retried or resumed ingest cannot produce
a half-written PDF or a duplicate copy under a second name.
"""

from __future__ import annotations

import logging
import os
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path

from .config import RagConfig
from .paths import document_relative_path, is_within

logger = logging.getLogger("ravenslaw.rag.storage")


@dataclass(frozen=True)
class StoredDocument:
    """Where a document ended up, and what storing it cost."""

    relative_path: str
    absolute_path: Path
    stored_bytes: int
    original_bytes: int
    compressed: bool
    already_present: bool


class DocumentStore:
    """Filesystem-backed archive for corpus PDFs."""

    def __init__(self, config: RagConfig, compressor=None) -> None:
        self._config = config
        # Injected so the pipeline can be tested without Ghostscript on PATH,
        # and so a deployment can turn recompression off in one place.
        self._compressor = compressor

    @property
    def root(self) -> Path:
        return self._config.pdf_root

    # ─── Writes ──────────────────────────────────────────────────────────────

    def store(
        self,
        source: Path | str,
        content_hash: str,
        court: str | None,
        year: int | str | None = None,
        suffix: str | None = None,
    ) -> StoredDocument:
        """Archive a document and return its ``PDF_ROOT``-relative path."""
        source = Path(source)
        original_bytes = source.stat().st_size
        relative = document_relative_path(
            court=court,
            content_hash=content_hash,
            suffix=suffix if suffix is not None else source.suffix,
            year=year,
        )
        destination = self.root / relative

        if destination.exists():
            # Content-addressed: identical bytes, already archived.
            return StoredDocument(
                relative_path=relative,
                absolute_path=destination,
                stored_bytes=destination.stat().st_size,
                original_bytes=original_bytes,
                compressed=False,
                already_present=True,
            )

        payload, stats = self._compress(source)
        try:
            _atomic_copy(payload, destination)
        finally:
            if stats["compressed"] and Path(payload) != source:
                _unlink(payload)

        logger.info("Archived %s (%d bytes)", relative, destination.stat().st_size)
        return StoredDocument(
            relative_path=relative,
            absolute_path=destination,
            stored_bytes=destination.stat().st_size,
            original_bytes=original_bytes,
            compressed=stats["compressed"],
            already_present=False,
        )

    def store_at_key(self, source: Path | str, key: str) -> Path:
        """Write a file under ``PRIVATE_ROOT`` at a caller-supplied key.

        Backs ``/documents/compress``, where the Next app owns the key (it
        derives it from the authenticated Clerk uid), so access control stays
        where it already lives and this only performs the write.
        """
        source = Path(source)
        destination = self._private_path(key)
        _atomic_copy(source, destination)
        try:
            destination.chmod(0o600)
        except OSError:
            logger.warning("Could not tighten %s", destination)
        return destination

    def _private_path(self, key: str) -> Path:
        """Absolute path for a caller-supplied private key, or raise.

        The key comes from the Next app, which derives it from an authenticated
        Clerk uid -- but it still arrives over HTTP as a string, so containment
        is proved here rather than assumed. ``resolve`` on the parent as well as
        the file catches a key whose directory component escapes even when the
        final name looks innocent.
        """
        if not key or not key.strip():
            raise ValueError("A storage key is required")
        candidate = self._config.private_root / key.lstrip("/")
        if not is_within(self._config.private_root, candidate) or not is_within(
            self._config.private_root, candidate.parent
        ):
            raise ValueError(f"Refusing to address a path outside PRIVATE_ROOT: {key!r}")
        return candidate

    def resolve_key(self, key: str) -> Path:
        """Absolute path for an existing private object. Raises when absent."""
        candidate = self._private_path(key)
        if not candidate.is_file():
            raise FileNotFoundError(f"No stored object at {key}")
        return candidate

    def stat_key(self, key: str) -> dict[str, int | str] | None:
        """Size and mtime for a private object, or None when it is not there."""
        try:
            path = self.resolve_key(key)
        except FileNotFoundError:
            return None
        stat = path.stat()
        return {"size": stat.st_size, "modified_at": int(stat.st_mtime)}

    def delete_key(self, key: str) -> bool:
        """Remove a private object. False when it was already gone."""
        try:
            path = self.resolve_key(key)
        except FileNotFoundError:
            return False
        path.unlink()
        return True

    def _compress(self, source: Path) -> tuple[Path | str, dict]:
        stats = {
            "original_bytes": source.stat().st_size,
            "stored_bytes": source.stat().st_size,
            "compressed": False,
        }
        if self._compressor is None:
            return source, stats
        path, compression_stats = self._compressor(source)
        return Path(path), compression_stats

    # ─── Reads ───────────────────────────────────────────────────────────────

    def resolve(self, relative_path: str) -> Path:
        """Absolute path for a stored document. Raises on traversal or absence."""
        if not relative_path:
            raise FileNotFoundError("No file_path recorded for this document")
        candidate = self.root / relative_path
        if not is_within(self.root, candidate):
            raise ValueError(f"Refusing to read outside PDF_ROOT: {relative_path!r}")
        if not candidate.is_file():
            raise FileNotFoundError(f"Document missing from archive: {relative_path}")
        return candidate

    def exists(self, relative_path: str) -> bool:
        try:
            self.resolve(relative_path)
        except (FileNotFoundError, ValueError):
            return False
        return True

    def delete(self, relative_path: str) -> bool:
        """Remove an archived document. Used only by administrative cleanup."""
        try:
            path = self.resolve(relative_path)
        except (FileNotFoundError, ValueError):
            return False
        path.unlink()
        return True

    # ─── Diagnostics ─────────────────────────────────────────────────────────

    def usage(self) -> dict[str, int]:
        """Free/total bytes on the volume backing the archive.

        Reported by ``/rag/status`` because on a self-hosted box the disk
        filling up is the failure mode that takes ingestion down, and it is
        entirely invisible from the application's own metrics otherwise.
        """
        try:
            total, used, free = shutil.disk_usage(self.root)
        except OSError:
            return {}
        return {"disk_total_bytes": total, "disk_used_bytes": used, "disk_free_bytes": free}


def _atomic_copy(source: Path | str, destination: Path) -> None:
    """Copy into place via a temp file in the destination directory.

    The temp file is a sibling so the rename is same-filesystem and therefore
    atomic -- a crash leaves either the previous file or nothing, never a
    partially written PDF that would later fail to parse.
    """
    destination.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=destination.parent, suffix=".part")
    os.close(fd)
    try:
        shutil.copyfile(source, tmp_path)
        os.replace(tmp_path, destination)
    except BaseException:
        _unlink(tmp_path)
        raise


def _unlink(path: Path | str) -> None:
    try:
        os.remove(path)
    except OSError:
        pass
