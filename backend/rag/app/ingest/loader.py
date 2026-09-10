"""Document text extraction: Docling first, with a lightweight fallback.

Two backends, selected by ``PARSER_BACKEND``:

* **docling** (default) -- layout analysis, table-structure recovery and OCR in
  one pass, emitting Markdown. Structure survives extraction, which matters
  because the chunker splits on headings and a citation is only useful if it can
  say "Section 53(2)" rather than "chunk 7". Docling also reports real page
  boundaries, which is what fills SQLite's ``page_number`` column.

* **pypdfium** -- the text layer read directly, with RapidOCR only for pages that
  have none. This was the sole backend while the service ran on a sub-4GB box,
  where Docling's layout + table models cost ~1.2-1.4GB peak RSS and got the
  process OOM-killed. On the 32GB VPS that trade no longer applies, but the
  backend is kept: it is the fallback when Docling is unavailable or fails on a
  document, and it stays the right choice for a small instance.

Whichever backend runs, ``load_pages`` returns one string per page and
``load_text`` joins them. Both contracts predate this file and are relied on by
``/documents/extract``, so neither changes.
"""

from __future__ import annotations

import gc
import logging
import threading
from pathlib import Path
from typing import Literal

logger = logging.getLogger("ravenslaw.rag.loader")

ExtractionMode = Literal["auto", "force_ocr", "text_only"]

# Docling has no plain-text format, so .txt is read directly instead of converted.
PLAIN_TEXT_SUFFIXES = {".txt", ".md"}
# Mirrors this pipeline's own allow-list (backend/app/rag_routes.py).
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}
# Formats Docling understands and the fast pypdfium path does not.
DOCLING_ONLY_SUFFIXES = {".docx"}

# A page with fewer real characters than this in its embedded text layer is
# treated as scanned (no usable text layer) rather than as a very short page.
MIN_TEXT_LAYER_CHARS = 20

# RapidOCR's detection/recognition/classification models default to Chinese,
# not cosmetic -- an unset lang_type silently OCRs English contracts through
# the wrong character set.
_RAPIDOCR_PARAMS = {"Det.lang_type": "en", "Rec.lang_type": "en"}

_ocr_engine = None
_ocr_lock = threading.Lock()
_docling_converter = None
_docling_lock = threading.Lock()


# ─── Backend selection ───────────────────────────────────────────────────────


def _configured_backend() -> str:
    try:
        from rag.core.config import get_config

        return get_config().parser_backend
    except Exception:
        # Extraction must work even if the RAG config cannot be built (e.g. an
        # API-only host with no DATA_ROOT); the light backend needs nothing.
        return "pypdfium"


# ─── Docling ─────────────────────────────────────────────────────────────────


def get_document_converter():
    """Build the Docling converter once, on first use.

    Construction loads the layout and table-structure models. Warmed at startup
    by app/main.py so the cost does not land on whoever uploads first after a
    restart.
    """
    global _docling_converter
    if _docling_converter is not None:
        return _docling_converter
    with _docling_lock:
        if _docling_converter is None:
            from docling.document_converter import DocumentConverter

            _docling_converter = DocumentConverter()
    return _docling_converter


def _docling_pages(path: Path, mode: ExtractionMode) -> list[str]:
    """Convert with Docling and return one Markdown string per page."""
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.document_converter import DocumentConverter, PdfFormatOption

    pipeline_options = PdfPipelineOptions()
    # "auto" leaves Docling's own per-page decision in place; the two explicit
    # modes exist for documents whose embedded text layer is present but garbled.
    pipeline_options.do_ocr = mode != "text_only"
    pipeline_options.do_table_structure = True
    if mode == "force_ocr":
        pipeline_options.ocr_options.force_full_page_ocr = True

    converter = (
        get_document_converter()
        if mode == "auto"
        else DocumentConverter(
            format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)}
        )
    )

    document = converter.convert(str(path)).document
    page_numbers = sorted(document.pages) if getattr(document, "pages", None) else []

    if not page_numbers:
        return [document.export_to_markdown()]

    pages: list[str] = []
    for page_no in page_numbers:
        try:
            pages.append(document.export_to_markdown(page_no=page_no))
        except TypeError:
            # docling-core too old for per-page export: one page of everything
            # is still correct, it just loses page provenance.
            logger.warning("docling-core has no per-page export; page numbers unavailable")
            return [document.export_to_markdown()]
    return pages


# ─── pypdfium + RapidOCR ─────────────────────────────────────────────────────


def _get_ocr_engine():
    # Built on first use, not at import: construction loads the ONNX detection,
    # recognition and orientation-classification weights (~170MB resident).
    global _ocr_engine
    if _ocr_engine is not None:
        return _ocr_engine
    with _ocr_lock:
        if _ocr_engine is None:
            from rapidocr import RapidOCR

            _ocr_engine = RapidOCR(params=_RAPIDOCR_PARAMS)
    return _ocr_engine


def _normalize_image_orientation(path: Path) -> None:
    """EXIF auto-orient a photo before OCR sees it.

    A phone photo can be physically rotated 90/180/270 degrees on disk while
    displaying upright in any normal viewer -- raw pixels ignore the EXIF
    orientation tag, so skipping this silently OCRs sideways text as garbage.
    """
    from PIL import Image, ImageOps

    with Image.open(path) as img:
        fixed = ImageOps.exif_transpose(img)
        if fixed is not img:
            fixed.save(path)


def _ocr_pil_image(pil_image) -> str:
    result = _get_ocr_engine()(pil_image.convert("RGB"))
    return "\n".join(result.txts) if result and result.txts else ""


def _pypdfium_pages(path: Path, mode: ExtractionMode = "auto") -> list[str]:
    """Extract a PDF page by page: its embedded text layer where one exists,
    OCR only for the pages that don't have one.

    Most uploaded contracts are Word-exported PDFs with a full text layer --
    reading it directly costs single-digit milliseconds per page and is exact,
    character for character. OCR only runs on pages that actually need it, which
    keeps the common case fast and bounds peak memory to roughly one rendered
    page at a time instead of scaling with page count.
    """
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(str(path))
    try:
        pages_text = []
        for page in pdf:
            textpage = page.get_textpage()
            text = textpage.get_text_range()
            textpage.close()

            needs_ocr = mode == "force_ocr" or (
                mode == "auto" and len(text.strip()) < MIN_TEXT_LAYER_CHARS
            )
            if needs_ocr and mode != "text_only":
                bitmap = page.render(scale=200 / 72)
                text = _ocr_pil_image(bitmap.to_pil())
                bitmap.close()
                # CPython's allocator doesn't reliably hand a page bitmap's
                # memory back to the OS between iterations, so an uncollected
                # multi-page scan climbs in peak RSS. Collecting after each OCR
                # pass keeps a long scanned document's footprint flat.
                gc.collect()

            pages_text.append(text)
            page.close()
        return pages_text
    finally:
        pdf.close()


# ─── Public API ──────────────────────────────────────────────────────────────


def load_pages(path, mode: ExtractionMode = "auto", backend: str | None = None) -> list[str]:
    """Return the document as one string per page.

    Only PDFs really have pages; every other format comes back as a single
    element so callers can treat the shape uniformly. Contract review uses this
    to tag each block of the extracted document with the page it came from,
    which is what lets a citation chip open the original at the right place.
    """
    path = Path(path)
    suffix = path.suffix.lower()

    if suffix in PLAIN_TEXT_SUFFIXES:
        return [path.read_text(encoding="utf-8", errors="replace")]

    backend = backend or _configured_backend()

    if suffix in IMAGE_SUFFIXES and backend != "docling":
        _normalize_image_orientation(path)
        from PIL import Image

        with Image.open(path) as img:
            return [_ocr_pil_image(img)]

    if backend == "docling" or suffix in DOCLING_ONLY_SUFFIXES:
        try:
            return _docling_pages(path, mode)
        except ImportError:
            logger.warning("Docling not installed; falling back to the pypdfium backend")
        except Exception as exc:
            # A single malformed document must not fail extraction outright when
            # a second, independent parser might still read it.
            logger.warning("Docling failed on %s (%s); falling back to pypdfium", path.name, exc)

        if suffix in DOCLING_ONLY_SUFFIXES:
            raise RuntimeError(f"Could not extract {path.name}: Docling is required for {suffix}")
        if suffix in IMAGE_SUFFIXES:
            _normalize_image_orientation(path)
            from PIL import Image

            with Image.open(path) as img:
                return [_ocr_pil_image(img)]

    return _pypdfium_pages(path, mode)


def load_text(path, mode: ExtractionMode = "auto", backend: str | None = None) -> str:
    """Return the document as text, whatever the input format.

    ``mode`` only affects formats with a text-layer alternative to OCR -- plain
    text is always read as-is, and images always need OCR since they have no
    embedded text layer to fall back to.
    """
    return "\n\n".join(load_pages(path, mode, backend))
