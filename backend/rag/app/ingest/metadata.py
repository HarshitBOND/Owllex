"""Document metadata extraction -- deterministic first, model only if asked.

The pipeline needs five fields per document: ``title``, ``document_type``,
``date``, ``court`` and ``citation``. On Indian legal documents almost all of
them are printed in the front matter under stable forms, so they are parsed
rather than guessed. That is not just a cost argument: a model asked to produce
a citation will produce one whether or not the document has it, and a wrong
citation poisons the very lookups the citation column exists to serve.

An LLM pass remains available behind ``METADATA_LLM_ENABLED=true`` for prose
documents where the heuristics come back empty. It is **off by default** -- this
deployment is self-hosted and makes no outbound API calls unless configured to.
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import asdict, dataclass
from pathlib import Path

from rag.core.paths import known_court_aliases, resolve_court

logger = logging.getLogger("ravenslaw.rag.metadata")

# How much of the document the extractor reads. Front matter carries the
# identity fields; the body does not, and scanning it only adds false positives.
FRONT_MATTER_CHARS = 4000


@dataclass(frozen=True)
class DocumentMetadata:
    """Fields the retrieval API returns for a chunk, plus the two new columns."""

    title: str
    document_type: str
    date: str
    court: str
    citation: str

    def model_dump(self) -> dict[str, str]:
        """Kept so callers written against the old pydantic model still work."""
        return asdict(self)


# ─── Citations ───────────────────────────────────────────────────────────────

# Ordered by how strongly each identifies a document. Neutral citations are
# assigned by the court itself and are unique, so they win when several forms
# appear on the same page.
_CITATION_PATTERNS: tuple[re.Pattern[str], ...] = (
    # Neutral: 2026 INSC 793 / 2024 DHC 1122
    re.compile(r"\b(20\d{2}\s+(?:INSC|DHC|BHC|KHC|MHC|CHC|PHHC|GUJHC|RJHC)\s+\d+)\b", re.I),
    # Reporter with bracketed year: [2026] 8 S.C.R. 284
    re.compile(r"\[(?:1|2)\d{3}\]\s*\d+\s*S\.?\s*C\.?\s*R\.?\s*\d+", re.I),
    # Reporter with parenthesised year: (2019) 12 SCC 210
    re.compile(r"\((?:1|2)\d{3}\)\s*\d+\s*(?:SCC|AIR|SCR|BomCR|DLT|MLJ)\s*\d+", re.I),
    # AIR 1973 SC 1461
    re.compile(r"\bAIR\s+(?:1|2)\d{3}\s+[A-Z][A-Za-z]{1,6}\s+\d+\b"),
)


def extract_citation(text: str) -> str:
    """First citation found in the front matter, or an empty string."""
    for pattern in _CITATION_PATTERNS:
        match = pattern.search(text)
        if match:
            return re.sub(r"\s+", " ", match.group(0)).strip()
    return ""


# ─── Court ───────────────────────────────────────────────────────────────────

_COURT_ALIASES = known_court_aliases()
# Longest first, so "punjab and haryana high court" wins over "haryana".
_COURT_PATTERN = re.compile(
    "|".join(re.escape(name) for name in sorted(_COURT_ALIASES, key=len, reverse=True)),
    re.I,
)


def extract_court(text: str, hint: str | None = None) -> str:
    """Canonical court code for a document.

    A caller-supplied ``hint`` (the scraper knows which court it downloaded from)
    always wins over text detection, which is a guess by comparison -- judgments
    routinely name other courts in their first page.
    """
    if hint:
        resolved = resolve_court(hint)
        if resolved.code != "misc":
            return resolved.code

    match = _COURT_PATTERN.search(text)
    if match:
        return _COURT_ALIASES[match.group(0).lower()]
    return ""


# ─── Dates ───────────────────────────────────────────────────────────────────

_MONTHS = {
    m: i
    for i, m in enumerate(
        ["january", "february", "march", "april", "may", "june", "july",
         "august", "september", "october", "november", "december"],
        start=1,
    )
}

_DATE_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\b((?:1|2)\d{3})-(\d{1,2})-(\d{1,2})\b"), "ymd"),
    (re.compile(r"\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9}),?\s+((?:1|2)\d{3})\b"), "dmy_name"),
    (re.compile(r"\b([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+((?:1|2)\d{3})\b"), "mdy_name"),
    (re.compile(r"\b(\d{1,2})[./-](\d{1,2})[./-]((?:1|2)\d{3})\b"), "dmy_numeric"),
)


def extract_date(text: str) -> str:
    """First parseable date, normalised to ``YYYY-MM-DD``.

    Indian legal documents are written day-first, so ``03.04.2026`` is 3 April,
    not 4 March. The numeric pattern is read that way deliberately.
    """
    for pattern, shape in _DATE_PATTERNS:
        for match in pattern.finditer(text):
            parsed = _normalize_date(match.groups(), shape)
            if parsed:
                return parsed
    return ""


def _normalize_date(groups: tuple[str, ...], shape: str) -> str:
    try:
        if shape == "ymd":
            year, month, day = int(groups[0]), int(groups[1]), int(groups[2])
        elif shape == "dmy_numeric":
            day, month, year = int(groups[0]), int(groups[1]), int(groups[2])
        elif shape == "dmy_name":
            month = _MONTHS.get(groups[1].lower())
            if not month:
                return ""
            day, year = int(groups[0]), int(groups[2])
        else:  # mdy_name
            month = _MONTHS.get(groups[0].lower())
            if not month:
                return ""
            day, year = int(groups[1]), int(groups[2])
    except (ValueError, IndexError):
        return ""

    if not (1 <= month <= 12 and 1 <= day <= 31 and 1600 <= year <= 2200):
        return ""
    return f"{year:04d}-{month:02d}-{day:02d}"


# ─── Title and type ──────────────────────────────────────────────────────────

_NOISE_PREFIXES = ("<!--", "#", "*", "-", "=", "|")

_TYPE_MARKERS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("judgment", ("judgment", "judgement", "in the supreme court", "in the high court",
                  "criminal appeal", "civil appeal", "writ petition", "special leave petition")),
    ("order", ("order", "interim order", "cause list")),
    ("statute", ("act, ", "bare act", "ministry of law", "be it enacted", "chapter i",
                 "short title and commencement")),
    ("rules", ("rules, ", "regulation", "notification")),
    ("contract", ("agreement", "this deed", "witnesseth", "parties hereto", "indemnify")),
)


def extract_document_type(text: str) -> str:
    lowered = text.lower()
    for document_type, markers in _TYPE_MARKERS:
        if any(marker in lowered for marker in markers):
            return document_type
    return "document"


def extract_title(text: str, filename: str | None = None) -> str:
    """First real heading, falling back to the filename.

    Never empty: the title is what the admin UI and every citation chip display,
    and a blank one reads as a broken ingest.
    """
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or len(stripped) < 6:
            continue
        cleaned = stripped.lstrip("#").strip()
        if not cleaned or stripped.startswith(_NOISE_PREFIXES[0]):
            continue
        if len(cleaned) > 200:
            cleaned = cleaned[:197].rstrip() + "..."
        return cleaned
    if filename:
        return Path(filename).stem.replace("_", " ").replace("-", " ").strip() or "Untitled document"
    return "Untitled document"


# ─── Entry point ─────────────────────────────────────────────────────────────


def extract_metadata(
    text: str,
    filename: str | None = None,
    court_hint: str | None = None,
) -> DocumentMetadata:
    """Extract identity fields from a document's front matter."""
    front_matter = text[:FRONT_MATTER_CHARS]

    metadata = DocumentMetadata(
        title=extract_title(front_matter, filename),
        document_type=extract_document_type(front_matter),
        date=extract_date(front_matter),
        court=extract_court(front_matter, court_hint),
        citation=extract_citation(front_matter),
    )

    if _llm_enabled() and _is_sparse(metadata):
        return _refine_with_llm(front_matter, metadata)
    return metadata


def _llm_enabled() -> bool:
    enabled = os.getenv("METADATA_LLM_ENABLED", "false").strip().lower() in {"1", "true", "yes"}
    return enabled and bool(os.getenv("OPENAI_API_KEY"))


def _is_sparse(metadata: DocumentMetadata) -> bool:
    """Only worth a model call when the deterministic pass found little."""
    return not metadata.date or metadata.document_type == "document"


def _refine_with_llm(text: str, fallback: DocumentMetadata) -> DocumentMetadata:
    """Optional model pass. Never fatal -- the heuristic result already stands."""
    try:
        from langchain_openai import ChatOpenAI
        from pydantic import BaseModel

        class _Extracted(BaseModel):
            title: str
            document_type: str
            date: str

        model = os.getenv("METADATA_LLM_MODEL", "gpt-4o-mini")
        result = ChatOpenAI(model=model).with_structured_output(_Extracted).invoke(text)
    except Exception as exc:
        logger.warning("Metadata LLM pass failed (%s); keeping heuristic metadata", exc)
        return fallback

    return DocumentMetadata(
        title=result.title or fallback.title,
        document_type=result.document_type or fallback.document_type,
        date=result.date or fallback.date,
        # Never model-generated: a hallucinated court or citation is worse than
        # an empty one, because both are used as lookup keys.
        court=fallback.court,
        citation=fallback.citation,
    )
