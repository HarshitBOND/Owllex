import os
from pathlib import Path

os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS", "1")  # Windows blocks HF cache symlinks without Developer Mode

from docling.datamodel.base_models import InputFormat
from docling.datamodel.object_detection_engine_options import OnnxRuntimeObjectDetectionEngineOptions
from docling.datamodel.pipeline_options import LayoutObjectDetectionOptions, PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption

pipeline_options = PdfPipelineOptions(
    layout_options=LayoutObjectDetectionOptions(engine_options=OnnxRuntimeObjectDetectionEngineOptions()),
)  # torch layout engine segfaults on Windows/CPU, so force ONNX Runtime

converter = DocumentConverter(
    format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)}
)


def load_pdf(pdf_path):
    result = converter.convert(pdf_path)
    return result.document


if __name__ == "__main__":
    pdf_path = Path(__file__).resolve().parents[2] / "scrapping" / "data" / "raw" / "sci" / "pdfs" / "ESCR010002412026.pdf"
    doc = load_pdf(pdf_path)
    print(doc.export_to_markdown()[:500])
