"""Where a *private* user document lands on disk, and what it may be called.

Every value that reaches the filesystem for a per-user upload is built here, and
nothing in this module ever passes a caller-supplied string through to a path
segment unchanged without proving it is safe first. The layout is::

    /data/users/<owner segment>/<category>/<document id>.pdf

Three separate properties keep that path unforgeable:

* **The owner segment is derived, not sanitised.** Sanitising by replacing unsafe
  characters is not injective -- ``a/b`` and ``a_b`` would collapse into one
  directory and each user would be reading the other's files. An id that is
  already safe is used verbatim; anything else becomes ``h_<sha256 prefix>``,
  which is deterministic, collision-free in practice, and cannot contain a
  separator or a dot.
* **The document id is a UUID4 hex, validated on the way back in.** A stored
  filename is therefore always 32 hex characters plus a known extension, so
  ``..``, a null byte, a leading ``/`` or a Windows device name simply cannot
  round-trip through the database into a path.
* **The extension comes from the sniffed content type**, not from the name the
  browser sent. ``invoice.pdf`` holding a zip is stored -- and served -- as what
  it actually is, so nothing downstream can be tricked by the name.

The user's own filename is kept in SQLite (``original_filename``) purely for
display, and is sanitised separately for use in a ``Content-Disposition`` header.
It is never a path segment.
"""

from __future__ import annotations

import hashlib
import re
import unicodedata
import uuid
from pathlib import PurePosixPath

# The categories a user document may be filed under. A closed set on purpose:
# it is the only thing between the request body and a directory name, and an
# open one would make the category the traversal vector.
CATEGORIES: tuple[str, ...] = (
    "contracts",
    "affidavits",
    "evidence",
    "drafts",
    "miscellaneous",
)

DEFAULT_CATEGORY = "miscellaneous"

# Content types accepted for a private upload, and the extension each is stored
# under. The extension is chosen here rather than taken from the upload, so a
# document is always named after what its bytes actually are.
ALLOWED_UPLOAD_TYPES: dict[str, str] = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}

# What the *archive* is allowed to hold, as opposed to what a new upload may
# introduce. Wider on purpose: the R2 vault this replaces accepted images and
# plain text, and a migration that dropped every exhibit photograph because the
# current upload rules are narrower would be a data loss dressed up as a policy.
# New uploads still go through ALLOWED_UPLOAD_TYPES.
ARCHIVE_TYPES: dict[str, str] = {
    **ALLOWED_UPLOAD_TYPES,
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "text/plain": ".txt",
    "text/markdown": ".md",
}

_SAFE_OWNER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")
# Reserved shape for derived segments. A raw id of this form is never used
# verbatim, so an owner id cannot be chosen to collide with another owner's
# derived directory.
_DERIVED_OWNER_RE = re.compile(r"^h_[0-9a-f]{32}$")
# 32 hex is a minted UUID4; 24 hex is a Mongo ObjectId preserved verbatim by the
# R2 migration, so a document keeps the id the frontend already links to. Both
# lengths are enumerable in principle -- an ObjectId embeds a timestamp -- and
# that is acceptable here precisely because the id is not a capability: every
# route re-checks ownership against the authenticated caller, so guessing an id
# buys an attacker a 403. Nothing else may be accepted: these two shapes are what
# make a stored filename incapable of expressing a path.
_DOCUMENT_ID_RE = re.compile(r"^(?:[0-9a-f]{24}|[0-9a-f]{32})$")
_SUFFIX_RE = re.compile(r"^\.[a-z0-9]{1,10}$")

# Windows reserved device names. Irrelevant on the Linux host, but the archive is
# restored, rsynced and inspected on other machines, and a file called ``con.pdf``
# is a problem there.
_RESERVED_STEMS = {
    "con", "prn", "aux", "nul",
    *(f"com{i}" for i in range(1, 10)),
    *(f"lpt{i}" for i in range(1, 10)),
}


class UnsafePathError(ValueError):
    """A caller-supplied value could not be turned into a safe path segment."""


# ─── Owner ───────────────────────────────────────────────────────────────────


def owner_segment(owner_id: str) -> str:
    """Directory name for one owner, derived injectively from their id.

    Raises rather than guessing on an empty id: a private document with no owner
    has nowhere it could correctly go, and filing it under a placeholder would
    make it readable by whoever else landed there.
    """
    if not isinstance(owner_id, str) or not owner_id.strip():
        raise UnsafePathError("owner_id is required for a private document")

    candidate = owner_id.strip()
    if _SAFE_OWNER_RE.match(candidate) and not _DERIVED_OWNER_RE.match(candidate):
        return candidate

    digest = hashlib.sha256(candidate.encode("utf-8")).hexdigest()[:32]
    return f"h_{digest}"


# ─── Category ────────────────────────────────────────────────────────────────


def normalise_category(raw: str | None) -> str:
    """Map a request's category to one of :data:`CATEGORIES`.

    An unrecognised category is rejected rather than defaulted. Quietly filing a
    contract under ``miscellaneous`` because of a typo in the client is a bug the
    user only finds when they cannot locate the document; an empty category, on
    the other hand, is a caller that simply did not specify one.
    """
    if raw is None or not str(raw).strip():
        return DEFAULT_CATEGORY
    candidate = str(raw).strip().lower()
    if candidate not in CATEGORIES:
        raise UnsafePathError(
            f"Unknown category {raw!r}. Expected one of: {', '.join(CATEGORIES)}"
        )
    return candidate


# ─── Document id ─────────────────────────────────────────────────────────────


def new_document_id() -> str:
    """A fresh document id: UUID4 with the dashes stripped.

    Unguessable by design. The download route checks ownership before serving a
    byte, so the id is not a capability -- but an enumerable id would still leak
    how many documents exist and let a bug in any future route be swept across
    the whole corpus rather than aimed at one row.
    """
    return uuid.uuid4().hex


def is_document_id(value: str | None) -> bool:
    """True for a value shaped like :func:`new_document_id` output.

    Called on the way in from a URL and on the way out of SQLite. Both matter:
    the first stops a traversal attempt at the edge, the second means a row
    written by some future importer still cannot produce a path segment.
    """
    return bool(value) and bool(_DOCUMENT_ID_RE.match(value))


# ─── Extensions and filenames ────────────────────────────────────────────────


def suffix_for_content_type(
    content_type: str | None, accepted: dict[str, str] | None = None
) -> str:
    """Storage extension for an accepted content type."""
    table = ALLOWED_UPLOAD_TYPES if accepted is None else accepted
    key = (content_type or "").split(";", 1)[0].strip().lower()
    suffix = table.get(key)
    if suffix is None:
        raise UnsafePathError(
            f"Unsupported content type {content_type!r}. Accepted: {', '.join(sorted(table))}"
        )
    return suffix


def safe_suffix(suffix: str | None) -> str:
    """Normalise a stored extension, refusing anything that is not one."""
    if not suffix:
        return ""
    cleaned = (suffix if suffix.startswith(".") else f".{suffix}").lower()
    if not _SUFFIX_RE.match(cleaned):
        raise UnsafePathError(f"Unsupported file extension: {suffix!r}")
    return cleaned


def sanitize_filename(raw: str | None, fallback: str = "document") -> str:
    """A display filename safe to echo back and to put in a header.

    This never becomes a path segment -- the file on disk is named after the
    document id -- but it is stored, returned in JSON and sent in
    ``Content-Disposition``, so it still has to be free of separators, control
    characters and header-breaking bytes.
    """
    if not raw or not str(raw).strip():
        return fallback

    # NFKC first: a fullwidth solidus is not "/" until it is normalised, and the
    # filter below would otherwise pass it through into the header.
    text = unicodedata.normalize("NFKC", str(raw)).strip()
    # Take the basename under both separators -- the browser may send a Windows
    # path, and PurePosixPath would keep the backslashes.
    text = text.replace("\\", "/").rsplit("/", 1)[-1]
    text = "".join(ch for ch in text if ch.isprintable() and ch not in '"\r\n\t\x00')
    text = re.sub(r"[^A-Za-z0-9._ -]+", "_", text).strip(" .")
    text = re.sub(r"_{2,}", "_", text)

    if not text or set(text) <= {".", "_", "-", " "}:
        return fallback
    if PurePosixPath(text).stem.lower() in _RESERVED_STEMS:
        text = f"_{text}"
    # Long enough for any real filename, short enough that the header stays sane
    # and the value fits comfortably in the SQLite row.
    return text[:180]


# ─── The path itself ─────────────────────────────────────────────────────────


def user_document_relative_path(
    owner_id: str,
    category: str,
    document_id: str,
    suffix: str,
) -> str:
    """``USERS_ROOT``-relative path for one private document.

    Relative because that is what SQLite stores: the volume has to be
    remountable, and an absolute path in a database row is a path that outlives
    the mount point it was written for.
    """
    if not is_document_id(document_id):
        raise UnsafePathError(f"Not a valid document id: {document_id!r}")

    segment = owner_segment(owner_id)
    normalised = normalise_category(category)
    ext = safe_suffix(suffix)

    relative = PurePosixPath(segment) / normalised / f"{document_id}{ext}"
    # Belt and braces. Every component above is already constrained to a
    # character class that cannot express traversal, so this can only fire if one
    # of those rules is later loosened -- which is exactly when it is wanted.
    if ".." in relative.parts or relative.is_absolute():
        raise UnsafePathError(f"Refusing to build traversing path: {relative}")
    return str(relative)


def owner_relative_dir(owner_id: str, category: str | None = None) -> str:
    """``USERS_ROOT``-relative directory for one owner, optionally one category."""
    segment = owner_segment(owner_id)
    if category is None:
        return segment
    return str(PurePosixPath(segment) / normalise_category(category))
