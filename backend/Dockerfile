# Two targets. The default build (no --target) produces `ingest`, which is the
# full image the single-service deployment uses today -- Next talks to one
# backend URL, and both extraction and PDF compression live behind it.
#
# `--target api` builds the same app without the rag extra, for when the two are
# split onto separate services. See the notes on each stage.

FROM python:3.11-slim AS base

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PATH="/app/.venv/bin:$PATH"

COPY pyproject.toml uv.lock .

EXPOSE 8000


# ---------------------------------------------------------------------------
# api -- cause-list parsing, auth, search, admin routes. Opt in with:
#   docker build --target api .
#
# Deliberately WITHOUT --extra rag. pyproject.toml says it outright: "Docling
# pulls in torch and OCR models (multi-GB); the API image must not carry them."
# Routes needing Docling already return a 503 naming the missing extra, so they
# fail loudly here instead of silently running on the wrong service.
#
# Note this image cannot serve /documents/extract or /documents/compress, so
# splitting it out means pointing those calls at the ingest service.
# ---------------------------------------------------------------------------
FROM base AS api

RUN uv sync --locked --no-install-project
COPY . .
RUN uv sync --locked

CMD ["sh", "-c", "gunicorn -k uvicorn.workers.UvicornWorker app.main:app --bind 0.0.0.0:${PORT:-8000} --workers ${WEB_CONCURRENCY:-2} --timeout ${WEB_TIMEOUT:-120}"]


# ---------------------------------------------------------------------------
# ingest -- everything above plus Docling extraction, OCR, chunking, embedding
# and PDF compression. Last stage, so this is what a plain `docker build`
# produces and the current single-service deploy is unchanged.
#
# Defaults to ONE worker: each lazily builds its own Docling converter, costing
# ~60s and a full set of layout/OCR model weights, so two workers doubled both
# for no throughput gain on a queue already serialized by
# MAX_CONCURRENT_BULK_IMPORTS. Raise WEB_CONCURRENCY only with the RAM to match.
# ---------------------------------------------------------------------------
FROM base AS ingest

# Ghostscript recompresses scanned PDFs before archival
# (rag/app/ingest/compress.py). Only this image ever runs it.
# libgl1 + libglib2.0-0: rapidocr pulls in opencv-python (not headless), which
# dlopen()s libGL.so.1 at import time even though nothing here does GUI/video --
# without these, OCR engine init fails (see loader.py's use of RapidOCR).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ghostscript libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

RUN uv sync --locked --no-install-project --extra rag
COPY . .
RUN uv sync --locked --extra rag

CMD ["sh", "-c", "gunicorn -k uvicorn.workers.UvicornWorker app.main:app --bind 0.0.0.0:${PORT:-8000} --workers ${WEB_CONCURRENCY:-1} --timeout ${WEB_TIMEOUT:-300}"]
