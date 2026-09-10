"""Private per-user document storage on the mounted HDD.

Files land at ``USERS_ROOT/<owner segment>/<category>/<document id>.<ext>``, laid
out by :mod:`rag.core.user_paths`. This module owns the bytes: it validates what
is actually in the file, writes it atomically with restrictive permissions,
resolves a stored relative path back to an absolute one, and refuses -- loudly --
anything that would read or write outside the root.

What it deliberately does *not* do is decide who may see a document. Ownership
lives in SQLite and is enforced in the route, so there is exactly one place to
read to answer "who can fetch this", and this layer stays a dumb, well-behaved
filesystem.

Three properties are worth preserving if this file is changed:

* **Nothing here trusts a path from the database.** ``resolve`` re-derives the
  absolute path and checks containment every single time, because ``storage_path``
  is data, and a row written by a future importer must not be able to address
  ``/etc/shadow`` or another user's directory.
* **Writes are atomic and never clobber.** A document id is fresh per upload, so
  an existing destination means an id collision or a retry, not an overwrite --
  and silently replacing a file the user still has a row for would lose it.
* **Content is sniffed, not believed.** The stored extension follows the bytes.
  A ``.pdf`` holding a zip is rejected rather than archived under a name that
  makes every downstream consumer treat it as a PDF.
"""

from __future__ import annotations

import hashlib
import logging
import os
import shutil
import zipfile
from dataclasses import dataclass
from pathlib import Path

from .config import RagConfig
from .paths import is_within
from .user_paths import (
    ALLOWED_UPLOAD_TYPES,
    ARCHIVE_TYPES,
    UnsafePathError,
    is_document_id,
    normalise_category,
    owner_relative_dir,
    user_document_relative_path,
)

logger = logging.getLogger("ravenslaw.rag.user_documents")

# Directories are owner-only; files are owner-read/write. The service account is
# the only local user that has any business reading this tree, and a stray
# `chmod -R` or an nginx misconfiguration should still hit a wall here.
_DIR_MODE = 0o700
_FILE_MODE = 0o600

_PDF_MAGIC = b"%PDF-"
_ZIP_MAGIC = b"PK\x03\x04"
# An empty or single-entry zip is still a valid zip; a .docx has to actually
# contain a Word document part.
_DOCX_REQUIRED_ENTRY = "word/document.xml"


class QuotaExceeded(Exception):
    """The owner is at their document-count or byte ceiling."""


@dataclass(frozen=True)
class StoredUserDocument:
    """Where a private document ended up, and what it contains."""

    document_id: str
    owner_id: str
    category: str
    storage_path: str
    """USERS_ROOT-relative. This is what goes into SQLite, and it never leaves
    the backend -- the API returns ids, not paths."""
    absolute_path: Path
    file_size: int
    mime_type: str
    sha256: str


@dataclass(frozen=True)
class OwnerUsage:
    """One owner's footprint, for quota decisions and for the admin views."""

    document_count: int
    total_bytes: int


class UserDocumentStore:
    """Filesystem-backed archive for private user documents."""

    def __init__(self, config: RagConfig) -> None:
        self._config = config

    @property
    def root(self) -> Path:
        return self._config.users_root

    # ─── Validation ──────────────────────────────────────────────────────────

    def detect_content_type(
        self, path: Path | str, accepted: dict[str, str] | None = None
    ) -> str:
        """The document's real content type, from its bytes.

        ``accepted`` defaults to what a new upload may introduce (PDF and DOCX).
        The migration passes :data:`ARCHIVE_TYPES` instead, which also covers the
        images and plain text the R2 vault held.

        Raises :class:`UnsafePathError` for anything not in that table -- the
        same exception the path builders raise, so a route has one class to turn
        into a 400. A file we cannot identify is a file we will not store.
        """
        table = ALLOWED_UPLOAD_TYPES if accepted is None else accepted
        path = Path(path)
        with open(path, "rb") as handle:
            head = handle.read(16)

        detected = self._sniff(path, head)
        if detected is None or detected not in table:
            raise UnsafePathError(
                f"Unsupported file content{'' if detected is None else f' ({detected})'}. "
                f"Accepted: {', '.join(sorted(table))}"
            )
        return detected

    def _sniff(self, path: Path, head: bytes) -> str | None:
        """Identify a file from its leading bytes. None when unrecognised.

        Magic numbers only -- never the filename, and never the ``Content-Type``
        the client sent. Both are attacker-controlled, and the whole point of
        this function is deciding what the file will be *called* on disk and
        served as, which is exactly the decision an attacker would want to make.
        """
        if head.startswith(_PDF_MAGIC):
            return "application/pdf"
        if head.startswith(b"\xff\xd8\xff"):
            return "image/jpeg"
        if head.startswith(b"\x89PNG\r\n\x1a\n"):
            return "image/png"
        if head.startswith((b"GIF87a", b"GIF89a")):
            return "image/gif"
        if head.startswith(b"RIFF") and head[8:12] == b"WEBP":
            return "image/webp"

        if head.startswith(_ZIP_MAGIC):
            try:
                with zipfile.ZipFile(path) as archive:
                    names = set(archive.namelist())
            except (zipfile.BadZipFile, OSError) as exc:
                raise UnsafePathError(f"File is not a readable DOCX: {exc}") from exc
            if _DOCX_REQUIRED_ENTRY in names:
                return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            raise UnsafePathError(
                "Zip archive is not a DOCX (no word/document.xml)."
            )

        return self._sniff_text(path)

    def _sniff_text(self, path: Path) -> str | None:
        """``text/plain`` for a file that decodes as UTF-8 with no NUL bytes.

        Last resort, and deliberately conservative. Only the first 64 KB is read:
        that is enough to reject binary, and a whole-file decode would be an easy
        way to make a 50 MB upload cost 50 MB of RAM.
        """
        try:
            with open(path, "rb") as handle:
                sample = handle.read(64 * 1024)
        except OSError:
            return None
        if not sample or b"\x00" in sample:
            return None
        try:
            sample.decode("utf-8")
        except UnicodeDecodeError:
            # A truncated multi-byte character at the 64 KB boundary is not a
            # reason to call an otherwise-valid text file binary.
            try:
                sample[:-4].decode("utf-8")
            except UnicodeDecodeError:
                return None
        return "text/plain"

    # ─── Writes ──────────────────────────────────────────────────────────────

    def store(
        self,
        source: Path | str,
        *,
        document_id: str,
        owner_id: str,
        category: str | None,
        declared_content_type: str | None = None,
        accepted_types: dict[str, str] | None = None,
    ) -> StoredUserDocument:
        """Archive one private document and return its metadata.

        ``declared_content_type`` is only cross-checked, never trusted: if the
        client said PDF and the bytes are a DOCX, the bytes win and the mismatch
        is logged. Rejecting instead would break a browser that guessed wrong
        about a file the user picked correctly.
        """
        source = Path(source)
        if not is_document_id(document_id):
            raise UnsafePathError(f"Not a valid document id: {document_id!r}")

        table = ALLOWED_UPLOAD_TYPES if accepted_types is None else accepted_types
        resolved_type = self.detect_content_type(source, table)
        declared = (declared_content_type or "").split(";", 1)[0].strip().lower()
        if declared and declared in table and declared != resolved_type:
            logger.info(
                "Upload %s declared %s but is %s; storing as the latter",
                document_id, declared, resolved_type,
            )

        normalised_category = normalise_category(category)
        relative = user_document_relative_path(
            owner_id=owner_id,
            category=normalised_category,
            document_id=document_id,
            suffix=table[resolved_type],
        )
        destination = self.root / relative
        if not is_within(self.root, destination.parent):
            raise UnsafePathError(f"Refusing to write outside USERS_ROOT: {relative!r}")
        if destination.exists():
            # Fresh UUID per upload, so this is a collision or a duplicate call.
            # Either way the existing file belongs to a row somebody still has.
            raise FileExistsError(f"A document already exists at {relative}")

        digest = _atomic_copy(source, destination, self.root)
        size = destination.stat().st_size

        logger.info(
            "Stored private document %s for owner %s (%s, %d bytes)",
            document_id, owner_id, normalised_category, size,
        )
        return StoredUserDocument(
            document_id=document_id,
            owner_id=owner_id,
            category=normalised_category,
            storage_path=relative,
            absolute_path=destination,
            file_size=size,
            mime_type=resolved_type,
            sha256=digest,
        )

    # ─── Reads ───────────────────────────────────────────────────────────────

    def resolve(self, storage_path: str, *, owner_id: str | None = None) -> Path:
        """Absolute path for a stored private document.

        ``owner_id``, when given, is checked against the path's own owner
        segment. That is redundant with the ownership check the route already
        did against SQLite -- and it is kept precisely because it is redundant:
        it means a row whose ``owner_id`` and ``storage_path`` disagree (a bad
        migration, a hand-edited database) fails closed instead of serving one
        user's file to another.
        """
        if not storage_path:
            raise FileNotFoundError("No storage_path recorded for this document")

        candidate = self.root / storage_path
        if not is_within(self.root, candidate):
            raise UnsafePathError(f"Refusing to read outside USERS_ROOT: {storage_path!r}")

        if owner_id is not None:
            expected = owner_relative_dir(owner_id)
            if Path(storage_path).parts[:1] != (expected,):
                raise UnsafePathError(
                    f"storage_path {storage_path!r} does not belong to the claimed owner"
                )

        if not candidate.is_file():
            raise FileNotFoundError(f"Document missing from storage: {storage_path}")
        return candidate

    def exists(self, storage_path: str) -> bool:
        try:
            self.resolve(storage_path)
        except (FileNotFoundError, UnsafePathError):
            return False
        return True

    def sha256(self, storage_path: str) -> str:
        """Hash the stored bytes. Used by the integrity check and the migration."""
        path = self.resolve(storage_path)
        return _hash_file(path)

    # ─── Deletion ────────────────────────────────────────────────────────────

    def delete(self, storage_path: str, *, owner_id: str | None = None) -> bool:
        """Remove a stored document. Returns False when it was already gone."""
        try:
            path = self.resolve(storage_path, owner_id=owner_id)
        except FileNotFoundError:
            return False
        path.unlink()
        _prune_empty_dirs(path.parent, stop_at=self.root)
        return True

    # ─── Quotas and diagnostics ──────────────────────────────────────────────

    def owner_usage(self, owner_id: str) -> OwnerUsage:
        """Count and total size of one owner's files, straight off the disk.

        Read from the filesystem rather than summed from SQLite on purpose: the
        quota exists to protect the *volume*, and the number that matters is what
        is actually on it, including anything a half-failed upload left behind.
        """
        directory = self.root / owner_relative_dir(owner_id)
        if not directory.is_dir():
            return OwnerUsage(document_count=0, total_bytes=0)

        count = 0
        total = 0
        for entry in directory.rglob("*"):
            try:
                if entry.is_file() and not entry.name.endswith(".part"):
                    count += 1
                    total += entry.stat().st_size
            except OSError:
                continue
        return OwnerUsage(document_count=count, total_bytes=total)

    def enforce_quota(self, owner_id: str, incoming_bytes: int) -> None:
        """Raise :class:`QuotaExceeded` if this upload would put the owner over.

        Checked before the bytes are moved into place, so a rejected upload never
        occupies the volume even briefly.
        """
        config = self._config
        usage = self.owner_usage(owner_id)

        if usage.document_count >= config.max_user_documents_per_owner:
            raise QuotaExceeded(
                f"You can store at most {config.max_user_documents_per_owner} documents."
            )

        if config.user_quota_mb:
            ceiling = config.user_quota_mb * 1024 * 1024
            if usage.total_bytes + incoming_bytes > ceiling:
                raise QuotaExceeded(
                    f"This upload would exceed your {config.user_quota_mb} MB storage limit."
                )

    def usage(self) -> dict[str, int]:
        """Free/total bytes on the volume backing the private tree."""
        try:
            total, used, free = shutil.disk_usage(self.root)
        except OSError:
            return {}
        return {"disk_total_bytes": total, "disk_used_bytes": used, "disk_free_bytes": free}


# ─── Filesystem helpers ──────────────────────────────────────────────────────


def _atomic_copy(source: Path, destination: Path, root: Path) -> str:
    """Copy into place via a sibling temp file, returning the SHA-256 written.

    The temp file is created in the destination directory so the rename is
    same-filesystem and therefore atomic: a crash leaves either nothing or a
    complete file, never a truncated PDF that a later integrity check would
    report as corruption.

    Permissions are set on the temp file *before* the rename, so the document is
    never briefly readable by anyone else. ``os.link`` + unlink is not used --
    plain ``os.replace`` is atomic and does not fail across the copy.
    """
    _make_dirs(destination.parent, root)

    tmp_path = destination.with_name(f".{destination.name}.part")
    digest = hashlib.sha256()
    try:
        fd = os.open(tmp_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, _FILE_MODE)
        with open(fd, "wb", closefd=True) as out, open(source, "rb") as src:
            for block in iter(lambda: src.read(1024 * 1024), b""):
                digest.update(block)
                out.write(block)
            out.flush()
            os.fsync(out.fileno())
        os.chmod(tmp_path, _FILE_MODE)
        os.replace(tmp_path, destination)
    except BaseException:
        _unlink(tmp_path)
        raise

    # Durability of the rename itself, not of the bytes: without this a power cut
    # right after the upload can leave the SQLite row pointing at a name the
    # directory never learned about.
    _fsync_dir(destination.parent)
    return digest.hexdigest()


def _make_dirs(directory: Path, root: Path) -> None:
    """Create the owner/category directories 0700, one level at a time.

    ``mkdir(parents=True, mode=...)`` applies the mode only to the final
    component and leaves intermediates at the umask default, which is exactly the
    directory that must not be group-readable -- the per-owner one.
    """
    directory.mkdir(parents=True, exist_ok=True)

    # Walk back up to (but not including) the root, tightening each level we own.
    current = directory
    while current != root and is_within(root, current) and current.parent != current:
        try:
            current.chmod(_DIR_MODE)
        except OSError as exc:
            logger.warning("Could not enforce %o on %s: %s", _DIR_MODE, current, exc)
        current = current.parent


def _prune_empty_dirs(directory: Path, stop_at: Path) -> None:
    """Remove now-empty category/owner directories after a delete.

    Best-effort and never fatal: an empty directory costs an inode, while a
    failed delete because of one would cost the user their request.
    """
    current = directory
    while is_within(stop_at, current) and current != stop_at:
        try:
            current.rmdir()
        except OSError:
            return
        current = current.parent


def _hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _fsync_dir(directory: Path) -> None:
    try:
        fd = os.open(directory, os.O_RDONLY)
    except OSError:
        return
    try:
        os.fsync(fd)
    except OSError:
        pass
    finally:
        os.close(fd)


def _unlink(path: Path | str) -> None:
    try:
        os.remove(path)
    except OSError:
        pass
