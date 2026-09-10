"""Court identity and on-disk document layout.

One place decides where a PDF lands under ``PDF_ROOT`` and what its ``court``
column says, so the archive stays navigable by hand:

    /data/documents/sci/2026/<sha256>.pdf
    /data/documents/hc/delhi/2026/<sha256>.pdf

Paths are content-addressed on the document's SHA-256 -- the same hash that is
the LMDB dedup key -- so re-ingesting a file can never write a second copy under
a different name, and a citation link stays valid for the life of the document.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import PurePosixPath

# Courts get an explicit storage segment rather than a slugified free-text name:
# "Delhi High Court", "DHC" and "hc-delhi" must all land in the same directory,
# and a typo must not silently create a new one.
_HIGH_COURT_BENCHES: dict[str, tuple[str, ...]] = {
    "allahabad": ("allahabad high court", "ahc"),
    "andhra": ("andhra pradesh high court", "ap high court"),
    "bombay": ("bombay high court", "bhc", "mumbai high court"),
    "calcutta": ("calcutta high court", "chc", "kolkata high court"),
    "chhattisgarh": ("chhattisgarh high court",),
    "delhi": ("delhi high court", "dhc", "high court of delhi"),
    "gauhati": ("gauhati high court", "guwahati high court"),
    "gujarat": ("gujarat high court",),
    "himachal": ("himachal pradesh high court", "hp high court"),
    "jammu": ("jammu and kashmir high court", "j&k high court", "jk high court"),
    "jharkhand": ("jharkhand high court",),
    "karnataka": ("karnataka high court",),
    "kerala": ("kerala high court",),
    "madhya": ("madhya pradesh high court", "mp high court"),
    "madras": ("madras high court", "chennai high court"),
    "manipur": ("manipur high court",),
    "meghalaya": ("meghalaya high court",),
    "orissa": ("orissa high court", "odisha high court"),
    "patna": ("patna high court",),
    "punjab": ("punjab and haryana high court", "p&h high court"),
    "rajasthan": ("rajasthan high court",),
    "sikkim": ("sikkim high court",),
    "telangana": ("telangana high court",),
    "tripura": ("tripura high court",),
    "uttarakhand": ("uttarakhand high court",),
}

# Non-high-court sources, each with its own top-level directory.
_TOP_LEVEL_COURTS: dict[str, tuple[str, ...]] = {
    "sci": ("supreme court", "supreme court of india", "sc", "scr"),
    "nclat": ("national company law appellate tribunal",),
    "nclt": ("national company law tribunal",),
    "itat": ("income tax appellate tribunal",),
    "cestat": ("customs excise and service tax appellate tribunal",),
    "ngt": ("national green tribunal",),
    "india_code": ("india code", "bare act", "statute"),
    # Anything a user uploads through the admin ingest UI, where no court is known.
    "upload": ("uploads", "manual"),
}

# Documents whose court could not be identified. Deliberately a real directory
# rather than a failure: losing the file is worse than filing it imprecisely.
UNKNOWN_COURT = "misc"

_SLUG_RE = re.compile(r"[^a-z0-9]+")
_HASH_RE = re.compile(r"^[0-9a-f]{64}$")


@dataclass(frozen=True)
class Court:
    """A resolved court: its canonical code and where its documents live."""

    code: str
    """Canonical identifier stored in the SQLite ``court`` column, e.g. ``sci``,
    ``hc/delhi``. Stable -- it is what queries filter on."""

    segment: PurePosixPath
    """Directory under ``PDF_ROOT`` holding this court's documents."""

    @property
    def is_high_court(self) -> bool:
        return self.code.startswith("hc/")


def _slug(raw: str) -> str:
    return _SLUG_RE.sub("-", raw.strip().lower()).strip("-")


def _build_alias_table() -> dict[str, str]:
    table: dict[str, str] = {}
    for bench, aliases in _HIGH_COURT_BENCHES.items():
        code = f"hc/{bench}"
        table[bench] = code
        table[f"hc-{bench}"] = code
        table[f"hc/{bench}"] = code
        for alias in aliases:
            table[_slug(alias)] = code
    for court, aliases in _TOP_LEVEL_COURTS.items():
        table[court] = court
        for alias in aliases:
            table[_slug(alias)] = court
    return table


_ALIASES = _build_alias_table()


def resolve_court(raw: str | None) -> Court:
    """Map any spelling of a court to its canonical code and directory.

    Unrecognised input is filed under ``misc`` rather than rejected -- an
    unfamiliar tribunal is a reason to review a document later, not a reason to
    drop it mid-ingest.
    """
    if not raw or not raw.strip():
        return Court(code=UNKNOWN_COURT, segment=PurePosixPath(UNKNOWN_COURT))

    key = _slug(raw)
    code = _ALIASES.get(key)

    if code is None and key.startswith("hc-"):
        # An unlisted bench spelled the canonical way still files under hc/.
        bench = key[3:]
        if bench:
            code = f"hc/{bench}"

    if code is None:
        return Court(code=UNKNOWN_COURT, segment=PurePosixPath(UNKNOWN_COURT))

    return Court(code=code, segment=PurePosixPath(*code.split("/")))


def _year_segment(year: int | str | None) -> str:
    """Documents are bucketed by year so no single directory holds a whole corpus."""
    if year is None or str(year).strip() == "":
        return str(datetime.now(timezone.utc).year)
    match = re.search(r"(1[6-9]\d{2}|2[01]\d{2})", str(year))
    return match.group(1) if match else str(datetime.now(timezone.utc).year)


def document_relative_path(
    court: str | None,
    content_hash: str,
    suffix: str,
    year: int | str | None = None,
) -> str:
    """Return the ``PDF_ROOT``-relative path a document is stored at.

    This is exactly what goes into SQLite's ``file_path`` column: relative, so
    the archive can be remounted anywhere without touching the database.
    """
    if not _HASH_RE.match(content_hash or ""):
        raise ValueError("content_hash must be a lowercase hex SHA-256 digest")

    resolved = resolve_court(court)
    ext = _safe_suffix(suffix)
    return str(resolved.segment / _year_segment(year) / f"{content_hash}{ext}")


def _safe_suffix(suffix: str) -> str:
    """Normalise a file extension, refusing anything that could escape the root."""
    if not suffix:
        return ""
    cleaned = suffix if suffix.startswith(".") else f".{suffix}"
    cleaned = cleaned.lower()
    if not re.fullmatch(r"\.[a-z0-9]{1,10}", cleaned):
        raise ValueError(f"Unsupported file extension: {suffix!r}")
    return cleaned


def is_within(root, candidate) -> bool:
    """True when ``candidate`` resolves inside ``root``.

    Guards every read of a database-supplied path: ``file_path`` is data, and a
    row written by a future importer must not be able to address /etc/shadow.
    """
    from pathlib import Path

    try:
        Path(candidate).resolve().relative_to(Path(root).resolve())
    except (ValueError, OSError):
        return False
    return True


def known_court_aliases() -> dict[str, str]:
    """Every recognised spelling mapped to its canonical court code.

    Exposed so the metadata extractor can detect a court from a document's front
    matter without duplicating the alias table.
    """
    aliases: dict[str, str] = {}
    for bench, names in _HIGH_COURT_BENCHES.items():
        for name in names:
            aliases[name] = f"hc/{bench}"
        aliases[f"{bench} high court"] = f"hc/{bench}"
    for court, names in _TOP_LEVEL_COURTS.items():
        for name in names:
            aliases[name] = court
    return aliases
