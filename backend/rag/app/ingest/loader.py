import os
from pathlib import Path

os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS", "1")  # Windows blocks HF cache symlinks without Developer Mode

# Docling has no plain-text format, so .txt is read directly instead of converted.
PLAIN_TEXT_SUFFIXES = {".txt"}
# Mirrors this pipeline's own allow-list (backend/app/rag_routes.py), not Docling's full
# InputFormat.IMAGE support (which also covers tiff/bmp/webp) -- keep the two in sync.
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}

_converter = None


def _get_converter():
    # Built on first use, not at import: constructing it loads the layout model
    # and costs ~60s, which would otherwise be paid by whoever imports this.
    global _converter
    if _converter is None:
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.object_detection_engine_options import OnnxRuntimeObjectDetectionEngineOptions
        from docling.datamodel.pipeline_options import (
            LayoutObjectDetectionOptions,
            OcrMode,
            PdfPipelineOptions,
            RapidOcrOptions,
        )
        from docling.document_converter import DocumentConverter, ImageFormatOption, PdfFormatOption

        layout_options = LayoutObjectDetectionOptions(engine_options=OnnxRuntimeObjectDetectionEngineOptions())
        # Pinned to RapidOcrOptions instead of Docling's default OcrAutoOptions for the same
        # reason the layout engine above is pinned to ONNX: auto-selection can land on EasyOCR
        # (needs torch) or system Tesseract (not installed in this project's Docker image, not
        # guaranteed on a dev machine either) depending on the runtime -- RapidOCR is already an
        # installed transitive dependency of docling>=2.0 and is ONNX-based, so nothing extra is
        # needed. lang=["en"] is required, not cosmetic: RapidOcrOptions defaults to ["chinese"].
        # Docling's default batch size is 4: four pages' decoded images and model
        # activations held in memory at once for layout, OCR and table extraction
        # each. That is fine on a machine with headroom, but on a small server (or
        # this dev container) it is the difference between a slow extraction and
        # the process being SIGKILLed by the OOM killer mid-request -- which looks
        # to the caller exactly like the backend being down, with no traceback to
        # explain why. Processing one page at a time trades some wall-clock time
        # for a peak footprint that stays flat regardless of document length.
        _LOW_MEMORY_BATCH_SIZE = 1
        pdf_pipeline_options = PdfPipelineOptions(
            layout_options=layout_options,
            ocr_options=RapidOcrOptions(lang=["en"]),
            layout_batch_size=_LOW_MEMORY_BATCH_SIZE,
            ocr_batch_size=_LOW_MEMORY_BATCH_SIZE,
            table_batch_size=_LOW_MEMORY_BATCH_SIZE,
        )
        image_pipeline_options = PdfPipelineOptions(
            layout_options=layout_options,
            layout_batch_size=_LOW_MEMORY_BATCH_SIZE,
            ocr_batch_size=_LOW_MEMORY_BATCH_SIZE,
            table_batch_size=_LOW_MEMORY_BATCH_SIZE,
            # A phone photo has no separate text/non-text regions the way a structured PDF page
            # does, and the layout model may mis-detect the "text region" in a skewed or
            # badly-lit shot -- force whole-page OCR instead of trusting region detection.
            ocr_options=RapidOcrOptions(lang=["en"], mode=OcrMode.FULL_PAGE),
        )

        _converter = DocumentConverter(format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pdf_pipeline_options),
            InputFormat.IMAGE: ImageFormatOption(pipeline_options=image_pipeline_options),
        })
    return _converter


def _normalize_image_orientation(path: Path) -> None:
    """EXIF auto-orient a photo before Docling sees it.

    A phone photo can be physically rotated 90/180/270 degrees on disk while
    displaying upright in any normal viewer -- Docling/PIL read raw pixels and
    ignore the EXIF orientation tag, so skipping this silently OCRs sideways
    text as garbage.
    """
    from PIL import Image, ImageOps

    with Image.open(path) as img:
        fixed = ImageOps.exif_transpose(img)
        if fixed is not img:
            fixed.save(path)


def load_text(path):
    """Return the document as markdown text, whatever the input format."""
    path = Path(path)
    if path.suffix.lower() in PLAIN_TEXT_SUFFIXES:
        return path.read_text(encoding="utf-8", errors="replace")
    if path.suffix.lower() in IMAGE_SUFFIXES:
        _normalize_image_orientation(path)
    return _get_converter().convert(str(path)).document.export_to_markdown()


def load_pdf(pdf_path):
    return _get_converter().convert(str(pdf_path)).document


if __name__ == "__main__":
    pdf_path = Path(__file__).resolve().parents[2] / "scrapping" / "data" / "raw" / "sci" / "pdfs" / "ESCR010002412026.pdf"
    print(load_text(pdf_path)[:500])
