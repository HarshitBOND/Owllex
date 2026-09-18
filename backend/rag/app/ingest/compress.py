"""Lossy PDF recompression before a source document is archived in R2.

Court judgments arrive as scans -- page-sized images wrapped in a PDF, often
several MB each. Ghostscript's /screen profile re-encodes those images at
72 dpi (144 dpi for 1-bit mono), which is the smallest Ghostscript preset --
it takes the most it can off a scan (more than /ebook) and almost nothing off
an already-text PDF. This is the maximum-compression end of the dial: seals,
signatures, and fine print will visibly soften.

This is deliberately lossy and irreversible: seals and signatures on a scanned
judgment will lose detail. It is safe for retrieval because text extraction and
OCR always run against the *original* file -- compression happens afterwards and
only affects the archived artifact, never what the RAG pipeline reads.

Callers get the original path back on any failure, so a broken or hostile PDF
degrades to "stored uncompressed" rather than failing the ingest.
"""

import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from rag.core.config import RagConfig

logger = logging.getLogger(__name__)

_GS_BINARY = shutil.which("gs")


def _gs_available() -> bool:
    return _GS_BINARY is not None


def compress_pdf(src_path: str | Path, config: "RagConfig") -> tuple[str, dict]:
    """Return (path_to_store, stats).

    The returned path is either a new temp file the caller must delete, or
    src_path unchanged. stats["compressed"] says which.

    Takes ``config`` explicitly rather than reading a module-level settings
    object -- this module used to import ``app.config.settings``, which pulls
    in the entire FastAPI layer's env requirements (CLERK_JWT_ISSUER,
    CORS_ORIGINS, ...) for three PDF-compression numbers. That made
    ``rag.core.services.build_services()`` -- and therefore every rag/
    script, including PRODUCTION_TODO.md T10's build_index.py running on a
    box with no FastAPI app in the picture at all -- fail to construct
    unless those unrelated production settings were also configured. See
    ``RagConfig.pdf_compression_*`` for where this configuration now lives.
    """
    src = Path(src_path)
    original_bytes = src.stat().st_size
    stats = {
        "original_bytes": original_bytes,
        "stored_bytes": original_bytes,
        "compressed": False,
    }

    if not config.pdf_compression_enabled:
        return str(src), stats
    if src.suffix.lower() != ".pdf":
        return str(src), stats
    if not _gs_available():
        logger.warning("ghostscript not on PATH; storing %s uncompressed", src.name)
        return str(src), stats

    dpi = config.pdf_compression_dpi
    # A scratch file for ghostscript's output only -- document_store.py's
    # _atomic_copy moves the result into the archive with a real copy, not a
    # rename, so this need not share a filesystem with anything else.
    fd, out_path = tempfile.mkstemp(suffix=".pdf", dir=tempfile.gettempdir())
    os.close(fd)

    cmd = [
        _GS_BINARY,
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.7",
        "-dPDFSETTINGS=/screen",
        "-dDownsampleColorImages=true",
        f"-dColorImageResolution={dpi}",
        "-dDownsampleGrayImages=true",
        f"-dGrayImageResolution={dpi}",
        # Mono is 1-bit scanned text. Downsampling it to the same dpi as the
        # colour channels makes it illegible, so it keeps twice the resolution.
        "-dDownsampleMonoImages=true",
        f"-dMonoImageResolution={dpi * 2}",
        # Collapses repeated images (letterheads, stamps, logos across pages)
        # to a single copy instead of re-encoding each occurrence.
        "-dDetectDuplicateImages=true",
        "-dNOPAUSE",
        "-dBATCH",
        "-dQUIET",
        f"-sOutputFile={out_path}",
        str(src),
    ]

    try:
        # Ghostscript hangs outright on some malformed PDFs, so this must be
        # bounded -- an ingest worker blocked forever is worse than a big file.
        result = subprocess.run(
            cmd,
            timeout=config.pdf_compression_timeout_seconds,
            capture_output=True,
        )
    except subprocess.TimeoutExpired:
        logger.warning("ghostscript timed out on %s; storing uncompressed", src.name)
        _unlink(out_path)
        return str(src), stats
    except OSError as exc:
        logger.warning("ghostscript failed to run on %s (%s); storing uncompressed", src.name, exc)
        _unlink(out_path)
        return str(src), stats

    if result.returncode != 0:
        logger.warning(
            "ghostscript exited %s on %s; storing uncompressed", result.returncode, src.name
        )
        _unlink(out_path)
        return str(src), stats

    out_size = os.path.getsize(out_path) if os.path.exists(out_path) else 0

    # An empty or larger output means the re-encode gained nothing (or lost the
    # document). Either way the original is the better thing to store.
    if out_size == 0 or out_size >= original_bytes:
        _unlink(out_path)
        return str(src), stats

    stats["stored_bytes"] = out_size
    stats["compressed"] = True
    logger.info(
        "compressed %s: %d -> %d bytes (-%.0f%%)",
        src.name,
        original_bytes,
        out_size,
        (1 - out_size / original_bytes) * 100,
    )
    return out_path, stats


def _unlink(path: str) -> None:
    try:
        os.remove(path)
    except OSError:
        pass
