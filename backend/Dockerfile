# Three targets. The default build (no --target) produces `ingest`, the full
# image the single-service deployment uses: extraction, embedding, indexing and
# PDF compression behind one backend URL.
#
# All three expect the persistent volume mounted at /data (DATA_ROOT). Nothing
# durable is written inside the container -- see docker-compose.yml.

FROM python:3.11-slim AS base

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PATH="/app/.venv/bin:$PATH" \
    DATA_ROOT=/data

COPY pyproject.toml uv.lock .

EXPOSE 8000


# ---------------------------------------------------------------------------
# api -- cause-list parsing, auth, admin routes. Opt in with:
#   docker build --target api .
#
# Deliberately WITHOUT the rag extras: FAISS, Docling and the embedding stack
# are multi-GB and this image has no reason to carry them. Routes needing them
# already return a 503 naming the missing extra, so they fail loudly here
# instead of silently running on the wrong service.
#
# This image cannot serve /rag/*, /documents/extract or /documents/compress.
# ---------------------------------------------------------------------------
FROM base AS api

RUN uv sync --locked --no-install-project
COPY . .
RUN uv sync --locked

CMD ["sh", "-c", "gunicorn -k uvicorn.workers.UvicornWorker app.main:app --bind 0.0.0.0:${PORT:-8000} --workers ${WEB_CONCURRENCY:-2} --timeout ${WEB_TIMEOUT:-120}"]


# ---------------------------------------------------------------------------
# ingest -- everything above plus parsing, chunking, local embeddings, FAISS and
# PDF compression. Last stage, so a plain `docker build` produces this.
#
# ONE worker by default. Each worker loads its own copy of the embedding model
# (~16GB for Qwen3-8B in bfloat16) and its own FAISS index, so a second worker
# doubles RAM for no throughput gain on a queue already serialized by
# MAX_CONCURRENT_BULK_IMPORTS. More importantly, two workers would each hold the
# LMDB environment and their own in-memory FAISS index over the same files --
# scale out by splitting read and write instances, not by raising this.
# ---------------------------------------------------------------------------
FROM base AS ingest

# ghostscript: recompresses scanned PDFs before archival (rag/app/ingest/compress.py).
# libgl1 + libglib2.0-0: rapidocr pulls in opencv-python (not headless), which
# dlopen()s libGL.so.1 at import time even though nothing here does GUI/video.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ghostscript libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

RUN uv sync --locked --no-install-project --extra rag --extra embeddings
COPY . .
RUN uv sync --locked --extra rag --extra embeddings

# Model weights are cached on the volume, not baked into the image and not
# re-downloaded on every container start.
ENV HF_HOME=/data/models

# The corpus lives here. Declared so `docker run` without an explicit -v still
# gets a named volume rather than writing into the container's ephemeral layer.
VOLUME ["/data"]

CMD ["sh", "-c", "gunicorn -k uvicorn.workers.UvicornWorker app.main:app --bind 0.0.0.0:${PORT:-8000} --workers ${WEB_CONCURRENCY:-1} --timeout ${WEB_TIMEOUT:-300}"]
