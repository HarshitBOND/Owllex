# Owllex production FAISS architecture

The retrieval design this repository implements, and the reasoning behind each
choice. Scope: Indian legal search growing to 10 crore (10^8) documents, on
self-hosted Hetzner hardware, CPU-first, no managed vector database.

Planning assumptions used throughout, stated once so every number below can be
re-derived: **15 chunks per document** (2,000-character chunks, 200 overlap,
~25,000 characters for a typical judgment), **1024-dimensional** embeddings,
**250 KB** per archived PDF after Ghostscript recompression.

| Corpus | Documents | Chunks |
|---|---|---|
| Tier 1 | 3 lakh | 4.5 M |
| Tier 2 | 30 lakh | 45 M |
| Tier 3 | 3 crore | 450 M |
| Tier 4 | 10 crore | 1.5 B |

---

## 1. Final recommended architecture

**One global FAISS `OPQ64_1024,IVF<nlist>_HNSW32,PQ64` index. Tenancy by id
partition. SQLite for metadata on NVMe, PDFs and index files on HDD.**

```
query
  ├─ embed locally (Qwen3-Embedding-0.6B, 1024-d, L2-normalised)   ~80 ms
  ├─ resolve scope in SQLite                                        ~2 ms
  │     public          → IDSelectorRange(1, 2^62)      no enumeration
  │     owner "u_123"   → SELECT faiss_id WHERE owner_id = ?  (covering index)
  │     both            → IDSelectorOr(range, batch)
  ├─ OPQ rotation → HNSW coarse search → nprobe lists               ~3 ms
  ├─ PQ asymmetric-distance scan, over-fetch k=100                 5–30 ms
  ├─ hydrate top-100 chunk rows from SQLite                          ~5 ms
  └─ return top 10 → LLM
```

### Why each decision

**Single index, not one per tenant.** A thousand tenants would mean a thousand
files, a thousand coarse quantizers trained on samples far too small to cluster
meaningfully, and a thousand-fold duplication of the public corpus if it were to
stay searchable alongside private documents. One index also means one recall
profile to tune instead of a distribution of them.

**Tenancy by id partition, not by index.** The id space is split:

```
[1, 2^62)            public legal corpus
[2^62, 2^63)         private, owner-scoped
```

This is what makes public search expressible as an `IDSelectorRange` — an O(1)
bounds check per candidate. The alternative, an allow-list of every public id,
is 800 MB per query at tier 3 and 12 GB at tier 4, so a design that filters
public search by enumeration does not reach production at all. Private access
stays an `IDSelectorBatch`, which is small by construction and is the only shape
that can express "these exact rows and nothing else".

**`IVF*_HNSW32` rather than a flat coarse quantizer.** At tier 3, `nlist` is
131,072 centroids of 1024 dimensions. Scanning them exhaustively is 134 M
multiply-adds per query — 50–100 ms on CPU, which would dominate the entire
search. An HNSW graph over the centroids answers the same question in ~1 ms.
Below ~16k centroids the flat quantizer is fine and simpler; above it, this is
the single highest-leverage parameter in the whole design.

**PQ64, not Flat or SQ8.** Flat float32 is 4 KB per vector: 18 GB at tier 1 and
6.1 TB at tier 4. SQ8 is 1 KB: still 1.5 TB at tier 4. PQ64 is 64 bytes — a 64×
compression that turns the index from the thing that does not fit into a
rounding error against the embedding model. The accuracy cost is real and is
covered under Trade-offs.

**OPQ before PQ: yes, and more so here than in general.** Plain PQ splits the
1024 dimensions into 64 contiguous 16-dimensional subvectors and quantizes each
independently, which assumes variance is spread evenly across dimensions. For
Matryoshka-trained embeddings that assumption is *specifically* wrong: MRL
front-loads information into the leading dimensions by construction, so the
first subquantizer would carry far more variance than the last and most of the
code budget would be spent describing dimensions that barely move. OPQ learns a
1024×1024 rotation that equalises variance across the subspaces before the
split. The cost is one matrix multiply per query (~1 M FLOPs, well under a
millisecond) and a rotation applied once per vector at index time. On MRL
embeddings this is worth several points of recall@10, not a fraction of one.

**Qwen3-Embedding-0.6B, not 8B.** This is the decision most likely to surprise,
so the arithmetic is worth showing. A single forward pass of an 8B model over a
32-token query is ~512 GFLOPs; a 16-core CPU sustains roughly 200 GFLOPS, so a
query embedding would take **~2.5 seconds** before FAISS is even reached. The
0.6B model is ~40 GFLOPs, i.e. under 100 ms, and its native output dimension is
1024 — exactly the target, with no truncation needed. Indexing arithmetic points
the same way: at tier 3 the 8B model is roughly 13× the GPU-hours of the 0.6B.

`EMBED_DIM=1024` is nonetheless kept as an explicit contract rather than an
accident of the model, because it is what makes 4B and 8B drop-in upgrades later
(truncate their 2560/4096 outputs to 1024 and the index geometry, the schema and
every stored id are unchanged — only the vectors are recomputed).

---

## 2. Folder structure

Two tiers, because the access patterns are not alike: SQLite and LMDB serve
thousands of small random reads on the latency-critical path, while PDFs and
index files are enormous and read sequentially or once at boot.

```
$SSD_DATA_ROOT              NVMe — small, random-access, latency-critical
    sqlite/chunks.db        metadata; a lookup sits inside every query
    lmdb/hashdb/            content-hash dedup, one B-tree probe per ingest
    lmdb/scrapping_hashdb/  the scrapers' "already downloaded" index
    logs/

$HDD_DATA_ROOT              spinning disk — bulk, immutable, sequential
    legal_corpus/           public corpus, by court and year
        sci/2026/<sha256>.pdf
        hc/delhi/2026/<sha256>.pdf
    users/<owner_id>/       private documents, 0700 all the way down
        contracts/<sha256>.pdf
    faiss/
        owllex.faiss        the one index; read at boot, rewritten in bulk
        owllex.meta.json    embedding signature, dimension, factory string
    archive/                immutable originals, superseded snapshots
    inbox/                  drop directory drained by the ingest worker
    backups/<date>/{faiss,sqlite,lmdb}/
    models/                 Hugging Face weight cache (HF_HOME)
```

Both roots default to `DATA_ROOT`, so a single-volume host runs unchanged and
the split is opted into by setting the two variables. Paths in SQLite are
**relative** to their root, so moving the corpus is a file move, never a data
migration — `rag/scripts/migrate_storage_split.py` performs it.

The two document trees are siblings rather than one tree with a visibility
column choosing a subdirectory: they have different access rules, different
permissions and different backup cadences, and keeping them apart means a bug in
the corpus path builder cannot address a user's file.

Config refuses to start if `FAISS_ROOT`, `LEGAL_CORPUS_ROOT`, `USERS_ROOT`,
`ARCHIVE_ROOT`, `BACKUP_ROOT` or `INBOX_ROOT` resolve onto the SSD while the
tiers are split — bulk data filling the NVMe would take SQLite, and therefore
every search, down with it.

---

## 3. Database schema

```sql
CREATE TABLE documents (
    document_id   TEXT PRIMARY KEY,
    collection    TEXT NOT NULL,          -- logical corpus
    court         TEXT,                   -- 'sci', 'hc/delhi', ...
    citation      TEXT,                   -- '2026 INSC 793'
    title         TEXT,
    file_path     TEXT,                   -- relative to its root
    content_hash  TEXT,                   -- SHA-256, the dedup key
    document_type TEXT,
    doc_date      TEXT,
    owner_id      TEXT,                   -- NULL ⇒ public corpus
    visibility    TEXT NOT NULL DEFAULT 'public',
    clerk_uid     TEXT,                   -- legacy owner column
    page_count    INTEGER NOT NULL DEFAULT 0,
    chunk_count   INTEGER NOT NULL DEFAULT 0,
    status        TEXT NOT NULL,          -- resumability
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

CREATE TABLE chunks (
    chunk_id     TEXT PRIMARY KEY,
    document_id  TEXT NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,
    collection   TEXT NOT NULL,
    owner_id     TEXT,                    -- denormalised; NULL ⇒ public
    chunk_index  INTEGER NOT NULL,
    chunk_text   TEXT NOT NULL,
    page_number  INTEGER,
    faiss_id     INTEGER NOT NULL UNIQUE, -- the id inside FAISS
    created_at   TEXT NOT NULL
);

-- The tenant-isolation lookup. Covering, so it is an index-only scan.
CREATE INDEX idx_chunks_owner ON chunks(owner_id, faiss_id);
```

`chunks.owner_id` is deliberately denormalised. It is the tenant boundary, and
resolving it must be a single-table index scan: a join would put the
security-critical lookup on the query path for every search, and correlated
joins are exactly where filter bugs hide.

    EXPLAIN QUERY PLAN SELECT faiss_id FROM chunks WHERE owner_id = ?
    → SEARCH chunks USING COVERING INDEX idx_chunks_owner (owner_id=?)

Two invariants are enforced by triggers rather than by whichever code path
happens to be writing, because they must also hold for a migration or a
hand-run `UPDATE` during an incident:

1. A private chunk carries a `faiss_id` from the private partition and a public
   chunk one from the public range. *A private vector in the public range would
   be returned by every public search, silently.*
2. A chunk's `owner_id` equals its document's effective owner,
   `COALESCE(owner_id, clerk_uid)`.

`faiss_id` is allocated from two forward-only counters and **never reused**, even
after deletion — so a vector that outlives its row can only fail to resolve,
never resolve to somebody else's chunk.

---

## 4. FAISS factory string

```
OPQ64_1024,IVF<nlist>_HNSW32,PQ64
```

Read left to right: rotate 1024 dimensions into 64 OPQ-balanced subspaces; route
to one of `nlist` inverted lists using an HNSW graph over the centroids; store
each vector as 64 one-byte PQ codes. Metric is inner product over L2-normalised
vectors, which is cosine similarity.

Wrapped in `IndexIDMap2` so vectors are addressed by the `faiss_id` SQLite
allocated rather than by insertion position — `remove_ids` compacts a flat index
and would otherwise renumber every later chunk.

Tier 1 may use `OPQ64_1024,IVF8192,PQ64` (flat coarse quantizer) — at 8k
centroids the HNSW layer is not yet earning its complexity.

---

## 5. Recommended parameters

| | Tier 1 (4.5 M) | Tier 2 (45 M) | Tier 3 (450 M) | Tier 4 (1.5 B) |
|---|---|---|---|---|
| `nlist` | 8,192 | 32,768 | 131,072 | 262,144 |
| coarse quantizer | flat | HNSW32 | HNSW32 | HNSW32 |
| `nprobe` | 16 | 32 | 64 | 96 |
| `efSearch` (coarse) | — | 64 | 96 | 128 |
| PQ `m` × bits | 64 × 8 | 64 × 8 | 64 × 8 | 64 × 8 |
| IVF training sample | 1 M | 3 M | 13 M | 26 M |
| over-fetch `k` | 100 | 100 | 200 | 300 |
| returned to LLM | 10 | 10 | 10 | 10 |

`nlist ≈ 4·√N`, the standard FAISS heuristic: it balances list length against
coarse-search cost. `nprobe` is the recall dial — it is the one parameter to
tune against a labelled query set, and doubling it roughly doubles the scan
cost. Training needs ≥39 vectors per centroid for k-means to be meaningful;
~100 per centroid is the comfortable figure used above.

Over-fetching before hydration matters more than it looks: PQ distances are
approximate, so the true top-10 is reliably *inside* the top-100 but not
reliably at the top of it. The final ordering is done on hydrated rows.

---

## 6. Memory calculations

Per-vector RAM: 64 bytes of PQ code + 8 bytes of id + ~8 bytes of list
overhead ≈ **80 bytes**. HNSW coarse quantizer: `nlist × (1024×4 + links)` ≈
`nlist × 4.3 KB`. OPQ rotation matrix: 4 MB, constant.

| | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---|---|---|---|
| PQ codes | 0.36 GB | 3.6 GB | 36 GB | 120 GB |
| coarse quantizer | 0.04 GB | 0.14 GB | 1.1 GB | 2.3 GB |
| embedding model (0.6B, bf16) | 1.2 GB | 1.2 GB | 1.2 GB | 1.2 GB |
| **resident total** | **~1.7 GB** | **~5.1 GB** | **~38 GB** | **~124 GB** |
| RAM to provision | 32 GB | 32 GB | 64 GB | 256 GB |

For contrast, a flat float32 index would need 18 GB / 184 GB / 1.8 TB / 6.1 TB.
That single row is the argument for PQ.

### Disk

| | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---|---|---|---|
| PDFs (HDD, @250 KB) | 75 GB | 750 GB | 7.5 TB | 25 TB |
| FAISS file (HDD) | 0.4 GB | 3.7 GB | 37 GB | 123 GB |
| SQLite chunk text | 10 GB | 99 GB | 990 GB | 3.3 TB |
| SQLite hot metadata | 0.9 GB | 9 GB | 90 GB | 300 GB |
| LMDB | 0.1 GB | 0.9 GB | 9 GB | 30 GB |
| **HDD** | ~0.1 TB | ~0.9 TB | ~9 TB | ~29 TB |
| **NVMe** | ~15 GB | ~110 GB | ~1.1 TB | ~3.6 TB |

From tier 3 the chunk text — which is 90% of the SQLite footprint and is read
only for the final ten hits — should move to a second SQLite file on the HDD,
keeping ids, owner and page number on NVMe. That drops the NVMe requirement to
~100 GB at tier 3 and ~330 GB at tier 4, and costs ten sequential HDD reads per
query. This is not implemented yet; it is the tier-3 change to plan for.

---

## 7. Search latency expectations

Single query, warm index, 16-core CPU, index resident in RAM:

| Stage | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---|---|---|---|
| embed query (0.6B, CPU) | 80 ms | 80 ms | 80 ms | 80 ms |
| SQLite scope resolution | 1 ms | 1 ms | 2 ms | 3 ms |
| coarse search | 1 ms | 2 ms | 3 ms | 4 ms |
| PQ scan | 3 ms | 8 ms | 25 ms | 60 ms |
| hydrate top-k | 3 ms | 4 ms | 6 ms | 8 ms |
| **total** | **~90 ms** | **~95 ms** | **~115 ms** | **~155 ms** |

The embedding model dominates until tier 3 — which is the practical argument for
the 0.6B model restated as a latency budget. On a box with a GPU, or with a
batched embedding service, everything above collapses toward the FAISS numbers.

Private search is *cheaper* than public: the allow-list confines the scan to one
owner's few hundred vectors, so it is bounded by SQLite, not by FAISS.

Cold start is dominated by reading the index off HDD: ~37 GB at tier 3 at
~200 MB/s is roughly three minutes. Budget for it in health checks and do not
let an orchestrator restart-loop the service during load.

---

## 8. Trade-offs

**PQ is lossy, and this is the real cost.** `OPQ64,PQ64` at nprobe 64 typically
lands around 90–95% recall@10 against exact search. For a lawyer, a missed
controlling judgment is the expensive failure mode, so: over-fetch generously,
tune `nprobe` against a labelled set rather than accepting the default, and
treat recall as a metric to measure per release, not assume.

**No neural reranker at query time.** A cross-encoder over 50 candidates is
~14 TFLOPs — a minute of CPU. The LLM stage that consumes the top-10 is the
de-facto reranker. If a dedicated reranker is wanted it needs a GPU, and that is
a separate service, not something to fold into this box.

**A single index means a single write path.** One process owns the index; scaling
out is read replicas plus one writer, not multiple writers on shared storage.
Two workers would each hold their own in-memory copy and diverge.

**Deletion leaves tombstones.** `remove_ids` on IVF removes the entry, but PQ
lists are not compacted until the index is rebuilt. A corpus with heavy churn
grows its file beyond its live vector count; rebuild periodically.

**The id partition is permanent.** 2^62 public ids is not a limit anyone will
reach, but it is baked into stored ids and cannot be renumbered without a full
rebuild.

**HDD for PDFs means slow single-document reads.** ~10 ms seek per document
fetch. Fine for the viewer route; it would not be fine if PDFs were on the
retrieval path, which is why extraction happens once, at ingest.

---

## 9. Index building

Offline, resumable, and separate from the serving process.

```
1. chunk       RecursiveCharacterTextSplitter, 2000 chars, 200 overlap,
               split over the whole document so a paragraph spanning a page
               break stays intact; page numbers recovered from offsets
2. embed       GPU, batched. Write vectors to a memory-mapped float32 file
               alongside their faiss_id — this is the checkpoint
3. train       sample ~100×nlist vectors from that file
                 a. OPQ rotation      (~1 M sample vectors is plenty)
                 b. IVF k-means       (nlist centroids)
                 c. PQ codebooks      (64 subquantizers × 256 centroids)
               persist the trained-but-empty index before adding anything
4. add         stream the mmap in 1 M-vector batches, add_with_ids
5. flush       write the index; record embedding signature in SQLite
```

**Resumability** comes from step 2's mmap plus the per-document `status` column.
A run killed anywhere restarts from the documents that never reached `complete`;
because the LMDB hash write is the last step, a partially-ingested document is
absent from the dedup index and is simply redone. Re-running is safe rather than
duplicative: `replace_chunks` returns the previous attempt's ids and they are
removed from FAISS before the new vectors are added.

**Train once, add forever.** The trained quantizers are the expensive artefact;
new documents are added to the existing index without retraining. Retrain only
when the corpus grows by roughly an order of magnitude, at which point `nlist`
should move to the next tier anyway.

### Embedding throughput and cost

At ~200 chunks/s on one A100 (0.6B model, 512-token chunks, ~40% MFU):

| | chunks | GPU-hours | ≈ rented cost |
|---|---|---|---|
| Tier 1 | 4.5 M | 6 h | €10–15 |
| Tier 2 | 45 M | 62 h | €100–150 |
| Tier 3 | 450 M | 625 h | €1,000–1,500 |
| Tier 4 | 1.5 B | 2,080 h | €3,500–5,000 |

One-time, parallelisable across GPUs, and the dominant cost of reaching tier 3+.
CPU-only indexing is not viable at any tier past the first: the same work is
~500× slower.

---

## 10. Cost analysis

Hetzner, order of magnitude, EUR/month. Verify against current pricing — these
move.

| | Hardware | RAM | Storage | ≈ €/mo |
|---|---|---|---|---|
| Tier 1 | AX41-NVMe | 64 GB | 2×512 GB NVMe + 5 TB Storage Box | 60 |
| Tier 2 | AX52 / AX102 | 64–128 GB | NVMe + 2 TB HDD | 100–140 |
| Tier 3 | SX65 | 64 GB | 4×22 TB HDD + NVMe | 200–260 |
| Tier 4 | AX162-R + SX | 256 GB | ~30 TB HDD + 4 TB NVMe | 500–750 |

The shape worth noticing: **storage, not compute, is what grows.** Compute is
nearly flat from tier 1 to tier 3 because the PQ index stays small; the bill is
PDFs on spinning disk. That is the entire argument for the HDD/NVMe split, and
it is why a managed vector database — priced per vector or per GB of index — is
the wrong cost curve for this workload. At tier 3, 450 M vectors on a hosted
service is a five-figure monthly bill against roughly €250 here.

---

## 11. Future upgrade path

Ordered by when it becomes necessary, and chosen so no step requires
redesigning the schema or the id space.

1. **Tune `nprobe`.** Free, immediate, no rebuild. First response to a recall
   complaint.
2. **Flat → HNSW coarse quantizer** when `nlist` passes ~16k. Rebuild of the
   index only; ids, schema and stored paths unchanged.
3. **Move chunk text to a second SQLite file on HDD** at tier 3. Application
   change, no re-embedding.
4. **Raise PQ `m` to 128** if measured recall is short. Doubles index RAM,
   improves accuracy; rebuild from the vector mmap without re-embedding.
5. **Add an `IndexRefineFlat` layer** where full-precision vectors fit on NVMe
   (tiers 1–2). Exact rescoring of the top-200, ~20 ms.
6. **Upgrade the embedding model** to 4B or 8B, truncating to 1024 dimensions.
   Requires re-embedding but *nothing else*: the factory string, `nlist`, the
   schema and every stored `faiss_id` are unchanged. This is what `EMBED_DIM` as
   a fixed contract buys. The startup signature check refuses to serve a corpus
   whose vectors disagree with the configured model, so a half-finished upgrade
   fails closed.
7. **Shard by court or year** past tier 4. Each shard is a complete instance of
   this architecture; the id partition scheme already keeps ids globally unique,
   so a scatter-gather layer merges results by score without renumbering.

Steps 1–5 preserve the corpus. Step 6 recomputes vectors but keeps ids. Step 7
is the first that changes topology, and it is deliberately last: everything
above it buys enough headroom to reach 10^8 documents on one machine.
