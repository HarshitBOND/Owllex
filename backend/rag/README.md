# Owllex RAG stack

Self-hosted retrieval over Indian legal documents. Everything runs on one Ubuntu
VPS: no vector-database vendor, no embedding API, no object store.

```
Frontend (React Native / Web)
  └── Cloudflare Worker (API/auth, proxies to the VPS)
        └── Ubuntu VPS  (32 GB RAM)
              ├── FastAPI                      app/
              ├── Docling                      rag/app/ingest/loader.py
              ├── Qwen3-Embedding (local)      rag/core/embeddings.py
              ├── FAISS                        rag/core/vector_index.py
              ├── SQLite                       rag/core/sqlite_store.py
              ├── LMDB                         rag/core/hash_index.py
              └── PDFs on the mounted HDD      rag/core/document_store.py
```

## What each store is for

| Store | Holds | Why it, and not one of the others |
|---|---|---|
| **FAISS** | Vectors, keyed by `faiss_id` | Fast ANN search. It has no metadata and no text, so it is never the source of truth. |
| **SQLite** | Documents, chunks, page numbers, court, citation, file paths | Everything a result needs to be rendered or cited, plus per-document `status`, which is what makes a bulk ingest resumable. |
| **LMDB** | SHA-256 → `{document_id, file_path, court}` | O(1) "have I already got this?" in front of the expensive stages. A B-tree probe against a memory-mapped file: constant memory whatever the corpus size. |
| **HDD** | The source PDFs | The archive an answer cites back to. Content-addressed, so re-ingesting can never write a second copy. |

The important consequence: **FAISS is a cache of SQLite.** Chunk text is in the
database, so a lost or drifted index is always rebuildable
(`rag/scripts/rebuild_index.py`) rather than restorable-only.

## Tenant isolation

There is **one** FAISS index, shared by every tenant. Vectors are never
duplicated and there is no per-user index. Isolation is enforced entirely
through the id space, and rests on two rules.

**Rule 1 — an empty allow-list returns zero results.**

```python
ids = metadata.faiss_ids_for_owner(owner_id)   # indexed, single-table
if len(ids) == 0:
    return []                                   # never search_all()
selector = faiss.IDSelectorBatch(ids)
```

An empty list is not "no filter applied". It is the answer *"this owner has
nothing indexed"*, and the difference between those two readings is one lawyer's
privileged documents appearing in another's results. `VectorIndex.search`
enforces this independently of the retriever, so both layers would have to
regress together for a leak to reach production. The shape below must never
appear anywhere in this tree:

```python
if not ids:
    return search_everything()      # WRONG — this is the leak
```

`SearchFilter` exists to make that mistake hard to write: unrestricted search is
a field you have to set (`SearchFilter.everything()`), not a default reachable
by letting a `None` through.

**Rule 2 — public and private vectors live in disjoint id ranges.**

```
[1, 2^62)        public legal corpus     → IDSelectorRange, O(1) per candidate
[2^62, 2^63)     private, owner-scoped   → IDSelectorBatch of the owner's ids
```

The public corpus is far too large to enumerate: at 10^8 chunks the allow-list
alone would be 800 MB per query. Expressing "everything public" as a range makes
it free, and it means a private vector can never be reached by a public search
because its id is not in that range. `IDSelectorOr` combines the two for
"search the public corpus and my own documents", which is the common case.

SQLite triggers refuse to write a chunk whose `owner_id` and `faiss_id`
partition disagree, or whose owner differs from its document's — so the
invariant holds for migrations and hand-run `UPDATE`s during an incident, not
just for the code path that normally writes. Startup refuses to serve if any row
violates it.

`tests/test_tenant_isolation.py` covers cross-tenant retrieval in both
directions, empty owners, ranking inside the allowed subset, re-ingest
replacement, and the triggers themselves.

## Layout on disk

Storage is two-tier. The split follows from what each store actually does, not
from a preference for one disk over another.

**NVMe (`SSD_DATA_ROOT`) — small, random-access, latency-critical.** SQLite and
LMDB serve the path inside every request: resolving a tenant's allow-list, then
hydrating the top hits. That is thousands of small random reads, and on a
spinning disk a few thousand seeks is tens of milliseconds added to every query.

**HDD (`HDD_DATA_ROOT`) — bulk, immutable, sequential.** The PDFs are written
once and read only when a user opens a document. The FAISS index is read once at
boot into RAM and rewritten wholesale on flush. Neither benefits from random-read
performance, and together they are essentially the entire disk footprint —
25 TB at 10 crore documents, against a few hundred GB of metadata. Paying SSD
prices per GB for them is the largest avoidable cost in the system, which is the
whole reason this split exists.

```
$SSD_DATA_ROOT                         NVMe
    sqlite/chunks.db                   metadata; read on every query
    lmdb/hashdb/                       content-hash dedup
    lmdb/scrapping_hashdb/             scraper "already downloaded" index
    logs/

$HDD_DATA_ROOT                         spinning disk
    legal_corpus/sci/2026/<sha256>.pdf     public, owner_id IS NULL
    legal_corpus/hc/delhi/2026/...
    users/<owner_id>/contracts/<sha256>.pdf  private, 0700 all the way down
    faiss/owllex.faiss                 the one index (+ .meta.json)
    archive/                           immutable originals
    inbox/                             drop directory for the ingest worker
    backups/<date>/{faiss,sqlite,lmdb}/
    models/                            Hugging Face weight cache
```

Both roots default to `DATA_ROOT`, so a single-volume host runs unchanged and
the split is opted into by setting the two variables. Config **refuses to start**
if a bulk path resolves onto the SSD while the tiers are split: bulk data filling
the NVMe would take SQLite, and therefore every search, down with it.

SQLite stores **relative** paths, so moving the corpus between volumes is a file
move and never a data migration:

```bash
sudo systemctl stop owllex
python -m rag.scripts.migrate_storage_split --plan     # always look first
python -m rag.scripts.migrate_storage_split --apply
sudo systemctl start owllex
```

It renames within a filesystem and copy-verifies across one, deleting the source
only after verification, so an interrupted run leaves the original intact.

The two document trees are siblings rather than one tree with a visibility
column choosing the subdirectory: they have different access rules, different
permissions and different backup cadences, and keeping them apart means a bug in
the corpus path builder cannot address a user's file.

## Module map

```
rag/
├── core/                    infrastructure; no HTTP, no business logic
│   ├── config.py            every path and tunable, resolved from env once
│   ├── paths.py             court aliases -> canonical code -> archive path
│   ├── sqlite_store.py      documents + chunks + embedding-id allocation
│   ├── hash_index.py        LMDB duplicate detection
│   ├── embeddings.py        Qwen3 locally; deterministic stub for tests
│   ├── vector_index.py      FAISS persistence, incremental insert, filtering
│   ├── document_store.py    atomic, content-addressed PDF archive
│   ├── services.py          composition root: builds, starts and verifies
│   └── backup.py            nightly FAISS + SQLite + LMDB snapshots
├── app/
│   ├── ingest/
│   │   ├── pipeline.py      the 10-step resumable ingest
│   │   ├── loader.py        Docling, with a pypdfium/OCR fallback
│   │   ├── splitter.py      chunking that carries page numbers through
│   │   ├── metadata.py      title/type/date/court/citation, parsed not guessed
│   │   ├── compress.py      Ghostscript recompression before archival
│   │   └── ingest.py        thin module-level wrapper over the pipeline
│   └── retrieval/
│       └── retriever.py     query -> FAISS -> SQLite hydration
├── scripts/
│   ├── verify_rag.py            end-to-end health check
│   ├── rebuild_index.py         re-embed into a fresh index; repairs partitions
│   ├── migrate_storage_split.py move an existing corpus onto the HDD tier
│   ├── backup_now.py            run a backup outside the scheduler
│   └── migrate_hash_values.py
└── scrapping/               document acquisition (TypeScript, unchanged)
```

Nothing under `core/` imports from `app/`, and nothing outside `services.py`
reaches for a global store — the pipeline and the retriever take a
`RagServices` container, which is what lets the whole stack run against a temp
directory in tests.

## The ingest pipeline

```
read bytes -> SHA-256 -> LMDB check -> Docling parse -> chunk
  -> embed -> SQLite metadata -> FAISS vectors -> archive PDF -> LMDB commit
```

**Resumability comes from the order of the last two steps**, not from a separate
journal. The LMDB write is the commit point, so a run killed at any earlier
stage leaves the document absent from the hash index and it is re-ingested next
pass. Three properties make that retry safe rather than duplicative:

- the archive is content-addressed, so re-storing writes nothing new;
- `replace_chunks` deletes the previous attempt's rows and returns their
  embedding ids, which are removed from FAISS before the new vectors go in;
- embedding ids are never reused, so a vector that outlives its row can only
  fail to resolve — never resolve to the wrong chunk.

## Operations

```bash
# health check, end to end
.venv/bin/python rag/scripts/verify_rag.py
.venv/bin/python rag/scripts/verify_rag.py --http     # through the running API

# backup now (before a deploy or a bulk delete)
.venv/bin/python -m rag.scripts.backup_now

# rebuild an index: after an unclean shutdown, a lost .faiss, or a model change
.venv/bin/python -m rag.scripts.rebuild_index --all

# move an existing single-volume deployment onto the SSD + HDD split
.venv/bin/python -m rag.scripts.migrate_storage_split --plan
.venv/bin/python -m rag.scripts.migrate_storage_split --apply   # service stopped

# tests (offline: no model download, no network)
.venv/bin/python tests/test_rag_stack.py
.venv/bin/python tests/test_tenant_isolation.py   # the security-critical ones
```

See [`FAISS_ARCHITECTURE.md`](FAISS_ARCHITECTURE.md) for the index design,
parameters and memory/cost tables from 3 lakh to 10 crore documents.

### Sizing

The two numbers that decide whether this fits the box:

- **Model.** Qwen3-Embedding-8B is ~16 GB in bfloat16. `EMBED_MODEL` also
  accepts `qwen3-embedding-4b` and `qwen3-embedding-0.6b`, which are the right
  answer on a smaller host — the code path is identical.
- **Index.** A flat index costs `chunks × EMBED_DIM × 4` bytes, resident. At the
  default 1024 dims that is ~4 GB per million chunks; at Qwen3's native 4096 it
  would be ~16 GB. `EMBED_DIM` truncates via the model's Matryoshka training,
  which is what keeps a multi-million-chunk corpus inside RAM. Past roughly
  4M chunks, move to a compressed factory (`FAISS_INDEX_FACTORY=IVF4096,PQ64`)
  and build it with `rebuild_index.py`, which trains in bulk.

Changing `EMBED_MODEL` or `EMBED_DIM` invalidates every stored vector. The
signature is recorded in SQLite and checked at startup, so a mismatch refuses to
boot instead of silently returning wrong neighbours.

### Backups

The nightly job snapshots FAISS, SQLite and LMDB into `/data/backups/<date>/`,
keeping `BACKUP_RETENTION_DAYS` of them. Each store is captured with the
mechanism that is consistent under concurrent writes: SQLite `VACUUM INTO`,
LMDB's compacting environment copy, and a plain copy of the FAISS files (which
are only ever replaced atomically).

**PDFs are deliberately not copied.** They are the bulk of the volume by orders
of magnitude and they are immutable, so nightly duplication would fill the disk
to protect against nothing. They need a separate off-host mirror:

```bash
restic -r sftp:u123456@u123456.your-storagebox.de:/backup backup /data/documents
```

That is the one piece of the backup story this repository does not implement,
and the corpus is not fully protected until it exists.
