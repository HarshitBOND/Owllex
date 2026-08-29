"""End-to-end check of the RAG pipeline.

Run this after adding OPENAI_API_KEY to backend/.env to confirm the whole path
works: config -> dependencies -> extraction -> chunking -> embedding -> Chroma
-> retrieval -> dedup.

    cd backend
    .venv/Scripts/python.exe rag/scripts/verify_rag.py            # in-process
    .venv/Scripts/python.exe rag/scripts/verify_rag.py --http     # through the API

--http hits the running FastAPI server exactly the way the admin page does,
including the internal-token header, so it also proves the wiring in between.
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

IN THE SUPREME COURT OF LEXVERT
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
    key = os.getenv("OPENAI_API_KEY", "")
    if not check("OPENAI_API_KEY is set", bool(key), "add it to backend/.env"):
        return
    check("OPENAI_API_KEY looks well-formed", key.startswith("sk-"), f"starts with {key[:3]!r}")

    chroma_ok = bool(os.getenv("CHROMA_API_KEY") and os.getenv("CHROMA_TENANT") and os.getenv("CHROMA_DATABASE"))
    if not check("CHROMA_API_KEY/TENANT/DATABASE are set", chroma_ok, "add them to backend/.env"):
        return

    print("\n--- Dependencies ---")
    try:
        from rag import hash_db
        from rag.app.ingest.ingest import ingest_document
        from rag.app.ingest.vector_db import collection_stats, get_vector_db
        check("RAG modules import", True)
    except Exception as e:
        check("RAG modules import", False, str(e))
        return

    before = collection_stats()
    print(f"       vector store: Chroma Cloud database {os.getenv('CHROMA_DATABASE')!r}")
    print(f"       before: {before['document_count']} docs / {before['chunk_count']} chunks")

    print("\n--- Ingest ---")
    tmp = Path(tempfile.gettempdir()) / f"lexvert_verify_{uuid.uuid4().hex}.md"
    tmp.write_text(SAMPLE, encoding="utf-8")
    document_id = uuid.uuid4().hex

    try:
        t = time.time()
        result = ingest_document(str(tmp), document_id)
        took = time.time() - t

        if result.get("skipped"):
            check("document ingested", False, "already present - delete the hash entry to re-run cleanly")
        else:
            check("document ingested", result.get("chunk_count", 0) > 0, f"{result.get('chunk_count')} chunks in {took:.1f}s")
            check("metadata extracted by the LLM", bool(result.get("title")), f"title={result.get('title')!r}, type={result.get('document_type')!r}")

        print("\n--- Vector store ---")
        after = collection_stats()
        check(
            "chunk count grew",
            after["chunk_count"] > before["chunk_count"],
            f"{before['chunk_count']} -> {after['chunk_count']}",
        )

        print("\n--- Retrieval ---")
        hits = get_vector_db().similarity_search_with_score(QUERY, k=3)
        check("search returned hits", len(hits) > 0, f"{len(hits)} hits")
        if hits:
            top_ids = [d.metadata.get("document_id") for d, _ in hits]
            check("the ingested document is retrievable", document_id in top_ids, f"top distance {hits[0][1]:.4f}")
            print(f"       top chunk: {hits[0][0].page_content[:120]!r}")

        print("\n--- Dedup ---")
        again = ingest_document(str(tmp), uuid.uuid4().hex)
        check("re-ingesting the same bytes is skipped", bool(again.get("skipped")), again.get("reason", ""))

        print("\n--- Cleanup ---")
        get_vector_db()._collection.delete(where={"document_id": document_id})
        hash_db.delete(result["content_hash"])
        final = collection_stats()
        check(
            "test document removed",
            final["chunk_count"] == before["chunk_count"],
            f"back to {final['chunk_count']} chunks",
        )
    finally:
        tmp.unlink(missing_ok=True)


def run_http():
    import requests

    base = os.getenv("LEXVERT_API_BASE", "http://localhost:8000")
    token = os.getenv("LEXVERT_INTERNAL_TOKEN", "")
    headers = {"x-internal-token": token}

    print(f"\n--- API at {base} ---")
    if not check("LEXVERT_INTERNAL_TOKEN is set", bool(token)):
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

    tmp = Path(tempfile.gettempdir()) / f"lexvert_verify_{uuid.uuid4().hex}.md"
    tmp.write_text(SAMPLE, encoding="utf-8")
    try:
        with tmp.open("rb") as fh:
            t = time.time()
            r = requests.post(
                f"{base}/api/v1/rag/ingest",
                headers=headers,
                files={"file": (tmp.name, fh, "text/markdown")},
                timeout=600,
            )
        ok = check("POST /api/v1/rag/ingest", r.ok, f"HTTP {r.status_code} in {time.time() - t:.1f}s")
        if not ok:
            print(f"       body: {r.text[:300]}")
            return
        data = r.json()
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
                print(f"       top: {results[0]['text'][:120]!r} (distance {results[0]['score']:.4f})")
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
