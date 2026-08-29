import os
from pathlib import Path

os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS", "1")  # Windows blocks HF cache symlinks without Developer Mode

# Docling has no plain-text format, so .txt is read directly instead of converted.
PLAIN_TEXT_SUFFIXES = {".txt"}

_converter = None


def _get_converter():
    # Built on first use, not at import: constructing it loads the layout model
    # and costs ~60s, which would otherwise be paid by whoever imports this.
    global _converter
    if _converter is None:
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.object_detection_engine_options import OnnxRuntimeObjectDetectionEngineOptions
        from docling.datamodel.pipeline_options import LayoutObjectDetectionOptions, PdfPipelineOptions
        from docling.document_converter import DocumentConverter, PdfFormatOption

        pipeline_options = PdfPipelineOptions(
            layout_options=LayoutObjectDetectionOptions(engine_options=OnnxRuntimeObjectDetectionEngineOptions()),
        )  # torch layout engine segfaults on Windows/CPU, so force ONNX Runtime

        _converter = DocumentConverter(
            format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)}
        )
    return _converter


def load_text(path):
    """Return the document as markdown text, whatever the input format."""
    path = Path(path)
    if path.suffix.lower() in PLAIN_TEXT_SUFFIXES:
        return path.read_text(encoding="utf-8", errors="replace")
    return _get_converter().convert(str(path)).document.export_to_markdown()


def load_pdf(pdf_path):
    return _get_converter().convert(str(pdf_path)).document


if __name__ == "__main__":
    pdf_path = Path(__file__).resolve().parents[2] / "scrapping" / "data" / "raw" / "sci" / "pdfs" / "ESCR010002412026.pdf"
    print(load_text(pdf_path)[:500])
