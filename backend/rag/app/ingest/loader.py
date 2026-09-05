import gc
from pathlib import Path
from typing import Literal

ExtractionMode = Literal["auto", "force_ocr", "text_only"]

# Docling has no plain-text format, so .txt is read directly instead of converted.
PLAIN_TEXT_SUFFIXES = {".txt"}
# Mirrors this pipeline's own allow-list (backend/app/rag_routes.py).
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}

# A page with fewer real characters than this in its embedded text layer is
# treated as scanned (no usable text layer) rather than as a very short page.
MIN_TEXT_LAYER_CHARS = 20

# RapidOCR's detection/recognition/classification models default to Chinese,
# not cosmetic -- an unset lang_type silently OCRs English contracts through
# the wrong character set.
_RAPIDOCR_PARAMS = {"Det.lang_type": "en", "Rec.lang_type": "en"}

_ocr_engine = None


def _get_ocr_engine():
    # Built on first use, not at import: construction loads the tiny ONNX
    # detection + recognition + orientation-classification weights (~170MB
    # resident, well under a second on a warm disk). This used to be a full
    # Docling DocumentConverter -- a document-layout model, a table-structure
    # model, and torch itself, none of which OCR actually needs -- which cost
    # ~1.2-1.4GB peak RSS on even a lightweight document and was what got this
    # process OOM-killed on anything below a 4GB instance. A plain OCR engine
    # with no layout/table understanding is a real trade: multi-column pages,
    # tables and headings no longer come back structured, just linear text --
    # acceptable here because load_text's caller re-flows everything through
    # its own markdown/HTML pipeline anyway, and it's what keeps this running
    # on a small server instead of needing one sized for a research pipeline.
    global _ocr_engine
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


def _load_pdf_pages(path: Path, mode: ExtractionMode = "auto") -> list[str]:
    """Extract a PDF page by page: its embedded text layer where one exists,
    OCR only for the pages that don't have one.

    Most uploaded contracts are Word-exported PDFs with a full text layer --
    reading it directly costs single-digit milliseconds per page and is exact,
    character for character. OCR only runs on pages that actually need it (a
    scan, or a signed page inserted as an image), which keeps the common case
    fast and bounds the worst case's peak memory to roughly one rendered page
    at a time instead of scaling with how many pages a document has.

    `mode` overrides that per-page heuristic: "force_ocr" always OCRs, even
    pages with a text layer (useful when the embedded layer is present but
    garbled -- e.g. from a prior bad OCR pass); "text_only" never OCRs, so a
    genuinely scanned page comes back blank rather than paying the OCR cost.
    """
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(str(path))
    try:
        pages_text = []
        for page in pdf:
            textpage = page.get_textpage()
            text = textpage.get_text_range()
            textpage.close()

            needs_ocr = mode == "force_ocr" or (mode == "auto" and len(text.strip()) < MIN_TEXT_LAYER_CHARS)
            if needs_ocr and mode != "text_only":
                bitmap = page.render(scale=200 / 72)
                text = _ocr_pil_image(bitmap.to_pil())
                bitmap.close()
                # CPython's allocator doesn't reliably hand a page bitmap's
                # memory back to the OS between iterations, so an uncollected
                # multi-page scan climbs in peak RSS the way the old Docling
                # pipeline did. Collecting after each OCR pass is what keeps
                # a long scanned document's footprint flat instead of growing
                # with page count.
                gc.collect()

            pages_text.append(text)
            page.close()
        return pages_text
    finally:
        pdf.close()


def load_pages(path, mode: ExtractionMode = "auto") -> list[str]:
    """Return the document as one string per page.

    Only PDFs really have pages; every other format comes back as a single
    element so callers can treat the shape uniformly. Contract review uses this
    to tag each block of the extracted document with the page it came from,
    which is what lets a citation chip open the original at the right place.
    """
    path = Path(path)
    if path.suffix.lower() in PLAIN_TEXT_SUFFIXES:
        return [path.read_text(encoding="utf-8", errors="replace")]
    if path.suffix.lower() in IMAGE_SUFFIXES:
        _normalize_image_orientation(path)
        from PIL import Image

        with Image.open(path) as img:
            return [_ocr_pil_image(img)]
    return _load_pdf_pages(path, mode)


def load_text(path, mode: ExtractionMode = "auto"):
    """Return the document as text, whatever the input format.

    `mode` only affects PDFs, which are the only format with a text-layer
    alternative to OCR -- plain text is always read as-is, and images always
    need OCR since they have no embedded text layer to fall back to.
    """
    return "\n\n".join(load_pages(path, mode))


if __name__ == "__main__":
    pdf_path = Path(__file__).resolve().parents[2] / "scrapping" / "data" / "raw" / "sci" / "pdfs" / "ESCR010002412026.pdf"
    print(load_text(pdf_path)[:500])
