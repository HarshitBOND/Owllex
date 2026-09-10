"""End-to-end check of the self-hosted RAG pipeline.

Confirms the whole path works: config -> storage layout -> dependencies ->
extraction -> chunking -> local embedding -> FAISS -> SQLite -> retrieval ->
dedup -> cleanup.

    cd backend
    .venv/bin/python rag/scripts/verify_rag.py            # in-process
    .venv/bin/python rag/scripts/verify_rag.py --http     # through the API

--http hits the running FastAPI server exactly the way the admin page does,
including the internal-token header, so it also proves the wiring in between.
The API only enqueues the ingest (PRODUCTION_TODO.md T2), so --http also needs
an ingest worker draining INBOX_ROOT -- either `owllex-ingest.service`, or for
a one-off check: `.venv/bin/python -m rag.scripts.ingest_worker --once`.

It writes into the configured DATA_ROOT and removes what it wrote. To keep it
away from a production corpus entirely, point it at a scratch volume:

    DATA_ROOT=/tmp/rag-verify .venv/bin/python rag/scripts/verify_rag.py
"""

import argparse
import os
import sys
import tempfile
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

PASS = "[PASS]"
FAIL = "[FAIL]"
SKIP = "[SKIP]"

failures = []


def check(name, ok, detail=""):
    print(f"{PASS if ok else FAIL} {name}" + (f" - {detail}" if detail else ""))
    if not ok:
        failures.append(name)
    return ok


# A tiny, distinctive document so retrieval is unambiguous.
SAMPLE = """# Test Judgment - Verification Document

IN THE SUPREME COURT OF RAVENSLAW
Criminal Appeal No. 9910 of 2026

The appellant challenged the rejection of anticipatory bail. The Court held
that the twin conditions under Section 45 do not apply where the accused has
already cooperated with the investigation for over eighteen months.

The distinctive verification phrase for this test is: zephyrquartzbail.

Accordingly, the appeal is allowed and bail is granted subject to the
appellant surrendering the passport.
"""

QUERY = "zephyrquartzbail"


def run_in_process():
    print("\n--- Config ---")
    try:
        from rag.core.config import get_config

        config = get_config()
    except Exception as e:
        check("RAG config builds", False, str(e))
        return
    check("RAG config builds", True, f"SSD={config.ssd_data_root} HDD={config.hdd_data_root}")
    if config.storage_is_split:
        print("       storage tiers are split (SSD metadata / HDD bulk)")
    else:
        print(f"       single volume at {config.data_root}")
    # The tiers are what everything actually resolves against; DATA_ROOT is only
    # a fallback for the paths they do not already cover.
    for name, root in (("SSD_DATA_ROOT", config.ssd_data_root), ("HDD_DATA_ROOT", config.hdd_data_root)):
        check(
            f"{name} is writable",
            os.access(root, os.W_OK) if root.exists() else os.access(root.parent, os.W_OK),
            str(root),
        )

    print("\n--- Dependencies ---")
    try:
        import faiss  # noqa: F401
        import lmdb  # noqa: F401

        from rag.app.ingest.pipeline import IngestionPipeline
        from rag.app.retrieval.retriever import Retriever
        from rag.core.services import build_services, shutdown, startup

        check("RAG modules import", True)
    except Exception as e:
        check("RAG modules import", False, f"{e} (run: uv sync --extra rag)")
        return

    print("\n--- Storage ---")
    try:
        services = build_services()
        startup(services)
    except Exception as e:
        check("storage starts", False, str(e))
        return
    check("storage starts", True, f"embeddings: {services.signature}")

    before = services.metadata.stats()
    print(f"       vector store: FAISS at {config.faiss_root}")
    print(f"       before: {before['document_count']} docs / {before['chunk_count']} chunks")

    tmp = Path(tempfile.gettempdir()) / f"ravenslaw_verify_{uuid.uuid4().hex}.md"
    tmp.write_text(SAMPLE, encoding="utf-8")
    document_id = uuid.uuid4().hex
    pipeline = IngestionPipeline(services)
    result = {}

    try:
        print("\n--- Ingest ---")
        t = time.time()
        result = pipeline.ingest(str(tmp), document_id=document_id).to_dict()
        took = time.time() - t

        if result.get("skipped"):
            check("document ingested", False, "already present - delete the hash entry to re-run cleanly")
        else:
            check(
                "document ingested",
                result.get("chunk_count", 0) > 0,
                f"{result.get('chunk_count')} chunks in {took:.1f}s",
            )
            check(
                "metadata extracted",
                bool(result.get("title")),
                f"title={result.get('title')!r}, type={result.get('document_type')!r}, "
                f"court={result.get('court')!r}",
            )

        print("\n--- Vector store ---")
        after = services.metadata.stats()
        check(
            "chunk count grew",
            after["chunk_count"] > before["chunk_count"],
            f"{before['chunk_count']} -> {after['chunk_count']}",
        )
        check(
            "FAISS matches SQLite",
            services.indexes.global_index().ntotal == after["chunk_count"],
            f"faiss={services.indexes.global_index().ntotal}, sqlite={after['chunk_count']}",
        )

        print("\n--- Retrieval ---")
        hits = Retriever(services).search_public(QUERY, top_k=3)
        check("search returned hits", len(hits) > 0, f"{len(hits)} hits")
        if hits:
            check(
                "the ingested document is retrievable",
                document_id in [h.document_id for h in hits],
                f"top score {hits[0].score:.4f}",
            )
            print(f"       top chunk: {hits[0].text[:120]!r}")

        print("\n--- Dedup ---")
        again = pipeline.ingest(str(tmp), document_id=uuid.uuid4().hex).to_dict()
        check("re-ingesting the same bytes is skipped", bool(again.get("skipped")), again.get("reason", ""))

        print("\n--- Cleanup ---")
        freed = services.metadata.delete_documents("lexvert", document_id=document_id)
        services.indexes.global_index().remove(freed)
        services.hashes.delete(result["content_hash"])
        if result.get("storage_ref"):
            services.documents.delete(result["storage_ref"])
        final = services.metadata.stats()
        check(
            "test document removed",
            final["chunk_count"] == before["chunk_count"],
            f"back to {final['chunk_count']} chunks",
        )
    finally:
        tmp.unlink(missing_ok=True)
        shutdown(services)


def run_http():
    import requests

    base = os.getenv("RAVENSLAW_API_BASE", "http://localhost:8000")
    token = os.getenv("RAVENSLAW_INTERNAL_TOKEN", "")
    headers = {"x-internal-token": token}

    print(f"\n--- API at {base} ---")
    if not check("RAVENSLAW_INTERNAL_TOKEN is set", bool(token)):
        return

    try:
        r = requests.get(f"{base}/api/v1/rag/status", headers=headers, timeout=30)
    except Exception as e:
        check("backend reachable", False, f"{e} - start it with: uvicorn app.main:app --port 8000")
        return

    check("GET /api/v1/rag/status", r.ok, f"HTTP {r.status_code}")
    if not r.ok:
        print(f"       body: {r.text[:300]}")
        return

    status = r.json()
    print(f"       {status}")
    check("pipeline reports ready", status.get("ready") is True, status.get("error") or "")
    if not status.get("ready"):
        return

    tmp = Path(tempfile.gettempdir()) / f"ravenslaw_verify_{uuid.uuid4().hex}.md"
    tmp.write_text(SAMPLE, encoding="utf-8")
    try:
        with tmp.open("rb") as fh:
            t = time.time()
            r = requests.post(
                f"{base}/api/v1/rag/ingest",
                headers=headers,
                files={"file": (tmp.name, fh, "text/markdown")},
                timeout=60,
            )
        ok = check("POST /api/v1/rag/ingest", r.ok, f"HTTP {r.status_code} in {time.time() - t:.1f}s")
        if not ok:
            print(f"       body: {r.text[:300]}")
            return
        enqueued = r.json()
        job_id = enqueued.get("job_id")
        ok = check("response carries a job_id", bool(job_id), str(enqueued))
        if not ok:
            return

        # The API only enqueues -- the ingest worker (the sole FAISS writer,
        # PRODUCTION_TODO.md T2) is what actually runs the pipeline. Poll the
        # job the same way the Next app does rather than assuming a worker is
        # even running.
        deadline = time.time() + 600
        data = None
        while time.time() < deadline:
            jr = requests.get(f"{base}/api/v1/rag/jobs/{job_id}", headers=headers, timeout=30)
            if not jr.ok:
                check("GET /api/v1/rag/jobs/{job_id}", False, f"HTTP {jr.status_code}: {jr.text[:200]}")
                return
            data = jr.json()
            if data.get("status") in ("complete", "duplicate", "failed"):
                break
            time.sleep(2)
        else:
            check(
                "ingest job reached a terminal status",
                False,
                "timed out after 600s -- is owllex-ingest (or `python -m rag.scripts.ingest_worker "
                "--once`) running against this INBOX_ROOT?",
            )
            return

        ok = check(
            "ingest job completed",
            data.get("status") == "complete",
            f"status={data.get('status')} error={data.get('error')}",
        )
        if not ok:
            return
        print(f"       {data}")

        r = requests.post(
            f"{base}/api/v1/rag/search",
            headers=headers,
            json={"query": QUERY, "k": 3},
            timeout=120,
        )
        check("POST /api/v1/rag/search", r.ok, f"HTTP {r.status_code}")
        if r.ok:
            results = r.json().get("results", [])
            check("search returned hits", len(results) > 0, f"{len(results)} hits")
            if results:
                print(f"       top: {results[0]['text'][:120]!r} (score {results[0]['score']:.4f})")
    finally:
        tmp.unlink(missing_ok=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--http", action="store_true", help="test through the running FastAPI server")
    args = parser.parse_args()

    if args.http:
        run_http()
    else:
        run_in_process()

    print()
    if failures:
        print(f"{FAIL} {len(failures)} check(s) failed: {', '.join(failures)}")
        sys.exit(1)
    print(f"{PASS} all checks passed")
