# Owllex Production Readiness — Implementation TODO

**Purpose.** Work through this list top to bottom, one task at a time. When every box is
ticked, the stack can be deployed and operated without reading the source: every failure
mode found in the September 2026 architecture audit is either fixed or has a documented,
tested runbook entry.

**Scope.** T1–T22 come from that audit (its findings S1–S18). The suffixed tasks — **T0,
T2a, T2b, T4a, T4b, T5a, T9a, T11a, T19a, T21a, T21b** — come from a second pass over the
same tree at `4b40e0f`, covering ground the architecture audit did not: authentication,
process/deployment interaction, and the test suite itself. Five of them are the same class
of bug the audit's Phase 0 exists for, and one is a correction to it:

| Task | Finding | Class |
|---|---|---|
| **T0** | `pytest tests/` reports 49 failures + a collection error on a clean tree — every **Verify** step below is unusable until fixed | blocker |
| **T2a** | The nightly backup opens a *third* FAISS writer and flushes its own snapshot over the live index — scheduled, not a race | critical, data loss |
| **T2b** | `allocate_faiss_ids` is not atomic across processes; two processes hand out the same id range (reproduced) | critical |
| **T4a** | An unset `CLERK_JWT_ISSUER` — how `.env.example` ships — makes the backend trust the issuer inside the unverified token. Full authentication bypass | critical, security |
| **T4b** | `ProtectSystem=strict` + `ReadWritePaths=/data` means the services cannot write at all on the split host `.env.example` recommends | critical, deploy |
| **T5a** | Changing `FAISS_INDEX_FACTORY` on an existing index is a silent no-op | significant |
| **T9a** | **Corrects audit finding S4.** `_train`'s `nlist` guard never fires, for any factory — the audit's premise that it "raises" is wrong | correctness |
| **T9b** | A compressed index is trained once; the corpus arrives court by court, and the quantizer drifts (list `max/mean` 1.08 → 11.55 in test) | significant |
| **T11a** | The ingest worker re-walks the entire inbox every 30s; drains slowest when fullest | throughput |
| **T19a** | Unbounded per-IP rate-limiter memory; raw exception text in 500 bodies | hygiene |
| **T21a** | Concurrent schema migration on deploy; orphaned vectors never reclaimed | correctness |
| **T21b** | `clerk_uid` is a field in the request body — the tenant boundary is enforced only by every caller happening to be correct | security, design |

Everything else the audit found — S1–S3, S5–S18, the storage and acquisition analysis — was
checked against the code and stands as written.

**Revised under review.** T7, T8, T14, T16 and T17 were changed after a review round, and
T9b was added by it. The task blocks below carry only the final guidance; what was proposed,
what the code turned out to say, and why four of six proposals were adopted with modified
reasoning are recorded once in **Appendix — review round, September 2026**. Read that before
re-proposing any of them.

**How to use this file.**

1. Find the first unchecked `- [ ]` task.
2. Read **only that task block**. It contains everything needed: why it matters, which
   files, what to change, and the exact command that proves it worked.
3. Make the change. Run the **Verify** command. It must pass.
4. Tick the box, and add a one-line note under **Result** if anything differed.
5. Stop. Do not batch tasks — several of them change the same files, and the verification
   steps assume the earlier tasks already landed.

**Rules that apply to every task.**

- Never delete or overwrite anything under `$HDD_DATA_ROOT` or `$SSD_DATA_ROOT` without an
  explicit instruction in the task.
- These four files are **untracked in git** — never delete them, they cannot be recovered:
  `backend/MIGRATION.md`, `backend/deploy/README.md`, `backend/rag/README.md`,
  `backend/rag/FAISS_ARCHITECTURE.md`.
- If a Verify step fails, fix it before ticking. Do not proceed to the next task.
- If a task turns out to be already done, tick it and note "already correct" under Result.

---

## System context (read once, before starting)

You need this to understand any task below.

**What the system is.** A self-hosted RAG stack for Indian legal documents. A Next.js app
(Vercel) talks to a Python FastAPI backend on a Hetzner machine. The backend owns the
corpus: PDFs on disk, chunk metadata in SQLite, vectors in a single FAISS index, a
content-hash dedup index in LMDB. There is no managed vector database and no object store —
Chroma Cloud, OpenAI embeddings and Cloudflare R2 were all removed (see
`backend/MIGRATION.md`).

**Where things live.** Storage is two-tier and both roots default to `DATA_ROOT`:

```
$SSD_DATA_ROOT        sqlite/chunks.db, lmdb/hashdb, lmdb/scrapping_hashdb, logs/
$HDD_DATA_ROOT        legal_corpus/, users/, faiss/, archive/, inbox/, backups/, models/
```

Resolution lives in exactly one place: `backend/rag/core/config.py`. Nothing below it may
call `os.getenv` for a path. The config refuses to boot if a bulk path resolves onto the
SSD while the tiers are split.

**The two processes.**

- `owllex-rag.service` — gunicorn, **1 worker**, binds `127.0.0.1:8000` behind nginx.
  Serves queries. Also currently ingests (which task **T3** changes).
- `owllex-ingest.service` — drains `$INBOX_ROOT` through the ingest pipeline.

**The critical invariant.** Vector ids are partitioned: `[1, 2^62)` is the public corpus,
`[2^62, 2^63)` is private per-owner. Public search is an `IDSelectorRange` over that first
range; private search is an `IDSelectorBatch` of the owner's exact ids. **An empty
allow-list must return zero results and must never widen into an unfiltered search.** This
is enforced in `VectorIndex.search`, again by SQLite triggers, and is covered by
`backend/tests/test_tenant_isolation.py`. Do not weaken it in any task.

**Scale targets.** Tier 1 is 3 lakh documents / 4.5 M chunks. Tier 2 is 30 lakh / 45 M.
Tier 3 is 3 crore / 450 M. Tier 4 is 10 crore / 1.5 B. Planning assumptions throughout:
15 chunks per document, 1024-dim vectors, 250 KB per archived PDF.

**Where the reasoning lives.** `backend/rag/FAISS_ARCHITECTURE.md` is the design of record
for retrieval and sizing. `backend/rag/ARCHITECTURE.md` holds the metadata schema and
chunking rationale but its *infrastructure* sections are superseded — read `MIGRATION.md`
for what is actually deployed. `backend/rag/TODO.md` tracks a separate axis of work
(citation resolution, lineage, closed-vocabulary classification) and is not part of this
list.

**Running commands.** Backend commands run from `backend/` with `.venv/bin/python`.
Frontend commands run from the repo root with `npm`.

---

# Phase 0 — Stop the data loss

Seven bugs that destroy data, plus the one that stops you proving any of them are fixed.
Nothing else matters until these are done. T0 comes first because every **Verify** step
below it runs the test suite, and the test suite does not currently run.

### - [x] T0. Make `pytest tests/` runnable at all

**Why.** Every task in this file ends in a **Verify** step, and most of those are
`cd backend && .venv/bin/python -m pytest tests/ -q`. Run that command today and it reports
**49 failures and a collection error** on an unmodified tree. So the verification loop this
document depends on cannot distinguish "my change broke something" from "the suite was
already red", and the security suite in particular is only green when run one file at a
time.

**The bug — two of them.**

1. *Collection error.* `backend/tests/test_scrapping.py` imports
   `rag.scrapping.curl_import`, which does not exist, so pytest aborts collection for the
   whole run before anything executes. (T22 owns the eventual fix; T0 only needs the suite
   to collect.)

2. *Import-order pollution.* `backend/app/config.py` builds a frozen module-level singleton
   at import time — `settings = Settings()` — so whichever test module imports `app.config`
   first freezes the configuration for the entire session.
   `tests/test_user_documents.py` sets `RAVENSLAW_TRUSTED_HOSTS=testserver,...` at module
   scope and documents that it must happen "before `app.config` is first imported", but
   pytest collects `test_parser.py`, `test_rag_stack.py` and `test_tenant_isolation.py`
   first, and one of those imports it first. `TrustedHostMiddleware` is then built with the
   `DEBUG` fallback `["localhost", "127.0.0.1"]`, `TestClient` sends `Host: testserver`, and
   every request in `test_user_documents.py` returns **400 Invalid host header**:

   ```
   tests/test_user_documents.py:193: AssertionError: 400 != 201 : Invalid host header
   ```

   That file is the ownership, path-traversal, public/private-corpus and quota suite — the
   tests that hold the tenant boundary. Alone: 44 passed. In the full run: 41 failed.
   There is no `backend/tests/conftest.py`.

**Files.** new `backend/tests/conftest.py`, `backend/tests/test_scrapping.py`,
`backend/app/config.py`.

**Change.**
1. Add `backend/tests/conftest.py` that sets the test environment
   (`RAVENSLAW_DEBUG`, `RAVENSLAW_INTERNAL_TOKEN`, `RAVENSLAW_TRUSTED_HOSTS`,
   `RAVENSLAW_CORS_ORIGINS`, `DATA_ROOT`) **before** any test module is imported. conftest
   is imported first by pytest, which is the only place this can be made order-independent.
   Then delete the now-redundant module-scope `os.environ.setdefault` block from
   `test_user_documents.py` so there is one place that does this.
2. Mark `test_scrapping.py` with `pytest.importorskip("rag.scrapping.curl_import")` at the
   top so it skips instead of aborting collection, until T22 deletes or rewrites it.
3. Consider making `app.config.settings` lazy (`get_settings()` with an `lru_cache` that a
   test can clear), rather than a frozen import-time singleton. Optional, but it is the root
   cause; the conftest is the workaround.

**Verify.**
```bash
cd backend && .venv/bin/python -m pytest tests/ -q
```
Must report zero failures and zero collection errors. Then confirm order-independence:
```bash
cd backend && .venv/bin/python -m pytest tests/ -q -p no:randomly
cd backend && .venv/bin/python -m pytest tests/test_user_documents.py -q     # still 44 passed
```

**Done when.** `pytest tests/` is green on an unmodified tree, and stays green regardless of
which order the modules are collected in. Every **Verify** step below this one is only
meaningful after this is true.

**Result.** Added `backend/tests/conftest.py` (env vars set before any test module import,
so import order no longer determines the frozen `Settings()` singleton) and removed the
now-redundant module-scope `os.environ.setdefault` block from `test_user_documents.py`.
Marked `test_scrapping.py` with `pytest.importorskip("rag.scrapping.curl_import")`. Did not
make `app.config.settings` lazy — optional per the task, and the conftest already makes the
suite order-independent. One thing not covered by the task's own bug description: with those
three fixed, `test_parser.py::TestParserAccuracy` still failed 8/8 — it depends on PDF
fixtures under `test_pdfs/`/`src/` at the repo root that are not checked into this tree (no
`.gitignore` entry either; they appear to have never shipped). Changed `setUpClass` to raise
`unittest.SkipTest` when no fixture PDFs are found, rather than fail, matching the same
"skip when the resource isn't present" pattern already used for `test_scrapping.py`.
`pytest tests/ -q` now reports `121 passed, 9 skipped, 0 failed` — verified stable across 3
consecutive runs, under `-p no:randomly`, and `test_user_documents.py` run in isolation
still reports `44 passed` as the task specifies.

---

### - [x] T1. Fix `rebuild_index.py` replacing the live index with an empty one

**Why.** This is the documented recovery path for a corrupt index, a changed embedding
model, or index drift — and running it as documented destroys the corpus's entire vector
set while reporting success. Until this is fixed, the disaster-recovery command *is* the
disaster.

**The bug.** `backend/rag/core/vector_index.py` defines `COLLECTIONS = ("owllex",)` — the
*physical* index name. The ingest pipeline writes chunk rows with `collection` set to
`"lexvert"` or `"lexvert_user"` — the *logical* names. `rebuild_collection()` in
`backend/rag/scripts/rebuild_index.py` queries `WHERE collection = 'owllex'`, matches zero
rows, takes the `total == 0` branch, logs "no chunks to index", then calls `staging.flush()`
and `_swap()` — moving a freshly created empty index over the live one.
`--collection` cannot save you either: `choices=list(COLLECTIONS)` means the only value
argparse accepts is the one that matches nothing.

**Files.** `backend/rag/scripts/rebuild_index.py`, `backend/rag/core/vector_index.py`.

**Change.**
1. Rebuild must read rows across the **logical** collections (`LOGICAL_COLLECTIONS`), not
   the physical one, since that is what the `chunks.collection` column holds.
2. Make `--collection` accept the logical names.
3. Add a guard in `rebuild_collection()`: if `total == 0` **and** the target index file
   already exists with `ntotal > 0`, abort with a non-zero exit and an explicit message.
   Never swap an empty index over a non-empty one without `--force`.

**Verify.**
```bash
cd backend && .venv/bin/python -m pytest tests/test_rag_stack.py -q
```
Then add and run a regression test asserting that a rebuild which resolves zero chunks
leaves an existing non-empty index file untouched.

**Done when.** A rebuild over a corpus with chunks re-indexes them all, and a rebuild that
finds nothing exits non-zero without touching the index file.

**Result.** The tree had already moved past the audit's snapshot: `vector_index.py` now has
exactly one physical index (`GLOBAL_COLLECTION = "owllex"`) that every logical collection
(`LOGICAL_COLLECTIONS = ("lexvert", "lexvert_user")`) resolves onto via `VectorIndexRegistry`.
So the specific line the audit quotes (`COLLECTIONS = ("owllex",)`, `WHERE collection =
'owllex'`) no longer exists verbatim, but the same bug survived the refactor one layer up:
`rebuild_index.py`'s `--collection` choices were still `list(COLLECTIONS)` (only `"owllex"`),
so its SQL `WHERE collection = ?` could never match a row (`chunks.collection` only ever
holds `"lexvert"`/`"lexvert_user"`), `total` was always 0, and it swapped an empty index over
the live one exactly as described.

Renamed `rebuild_collection()` to `rebuild_collections()` (plural) and had it take the *set*
of logical collections to include, because with one physical file behind both logical
collections, the old per-collection loop in `main()` — now that `--collection` accepts logical
names — would have swapped the same physical file once per name in the loop, each swap
dropping whichever logical collection wasn't in that iteration. Added a second guard beyond
the one the task specifies: refuse (unless `--force`) when the requested collections omit a
logical collection that SQLite still has chunks for, since that omission is the same
data-loss shape as the `total == 0` case, just partial rather than total. Both guards raise a
new `RebuildRefused`, caught in `main()` and reported as a non-zero exit. Left `rebuild_index.py`'s
`OFFSET`-based pagination as-is — the task assigns that fix to T9, not here.

Added `TestRebuildIndex` (4 tests) to `test_rag_stack.py`: a normal rebuild re-indexes
everything; a rebuild that resolves zero chunks against a non-empty on-disk index raises
`RebuildRefused` and leaves the file's `ntotal` unchanged; `--force` overrides that guard; and
rebuilding with only one logical collection specified while the other has chunks is refused.
`pytest tests/test_rag_stack.py -q` → 56 passed; full suite still 125 passed, 9 skipped.

---

### - [x] T2. Make the FAISS index single-writer

**Why.** `owllex-rag.service` and `owllex-ingest.service` both call `build_services()` and
`startup()`, and both write vectors. Each holds its own in-memory `IndexIDMap2`, and
`flush()` rewrites the whole file. Whichever flushes last wins and the other process's
vectors are silently gone — with the SQLite rows still present, so the corpus looks
complete and searches quietly miss. The units are ordered `After=`, not `Conflicts=`, so
they run concurrently by design. `FAISS_ARCHITECTURE.md` §8 states the rule the deployment
does not implement: *"One process owns the index."*

**Files.** `backend/deploy/systemd/owllex-rag.service`,
`backend/deploy/systemd/owllex-ingest.service`, `backend/rag/core/vector_index.py`,
`backend/app/rag_routes.py`.

**Change.** Pick the enqueue model (preferred) — the ingest worker becomes the sole writer:
1. API ingest routes write the uploaded file into `$INBOX_ROOT` and return a job id
   instead of running `IngestionPipeline` inline.
2. Add a `VectorIndex` file lock (`fcntl.flock` on a sidecar `.lock` next to the `.faiss`)
   acquired for the duration of any `add`/`remove`/`flush`, so a second writer fails loudly
   rather than corrupting silently. This is belt-and-braces and must stay even after (1).
3. Document in `backend/deploy/README.md` that `rebuild_index.py` and
   `migrate_storage_split.py` require `systemctl stop owllex-ingest` first.

**Verify.**
```bash
cd backend && .venv/bin/python - <<'PY'
# two VectorIndex handles on the same path; the second add must raise, not corrupt
PY
```
Write that as a test in `backend/tests/test_rag_stack.py`.

**Done when.** Only one process can hold the index for writing, and an attempt by a second
raises immediately.

**Result.** Took the enqueue model, confirmed with the user first since it changes the
`/ingest`/`/corpus/ingest` wire contract from a synchronous result to `202 {job_id}` — a
decision that reaches into the Next.js frontend, not something to make unilaterally.

1. **Enqueue.** `app/rag_routes.py`'s `_enqueue_ingest` spools the upload into
   `INBOX_ROOT/api/<job_id>/` (each file written to a `.part` sibling and atomically
   `os.replace`d into place) next to a `job.manifest.json` (document_id, collection,
   dedupe_scope, persist_source, court_hint, extra_metadata), creates an `ingest_jobs` row
   (new table in `sqlite_store.py`) and returns `{job_id, status: "queued"}` immediately. It
   never imports or calls `IngestionPipeline` — the route that used to run the pipeline
   inline now only touches the filesystem and SQLite.
2. **Worker.** `rag/scripts/ingest_worker.py` recognises a job directory by
   `job.manifest.json` (a fixed filename, not tied to any page's own name, so a multi-page
   `/ingest` upload — several files, one manifest — works the same way as a single file).
   `_pending_files` only surfaces a job's *first* page as a candidate, so the pipeline still
   sees one document per job, not one per page; `_ingest_one` reads the manifest for the
   fields the route decided (instead of deriving them from inbox path, as an organic drop
   still does) and updates the job row (`processing` → `complete`/`duplicate`/`failed`) with
   the same `IngestResult.to_dict()` shape `/ingest` used to return synchronously. An organic
   inbox drop (no manifest) is unaffected — verified by a dedicated regression test, since
   this is the path every existing bulk-ingest operator instruction still relies on.
3. **Poll endpoint.** New `GET /api/v1/rag/jobs/{job_id}`, gated by the same
   `require_internal_token` dependency as the rest of the router.
4. **Lock (belt-and-braces, item 2).** `VectorIndex` gained a lazily-acquired, non-blocking
   `fcntl.flock` on `<index>.lock`, taken on the *first* `add`/`remove`/`flush`, held for the
   instance's lifetime, released in `close()`. Lazy on purpose: acquiring it in `load()` would
   make the now-read-only API process (it only searches, post-enqueue-model) contend for a
   lock it never needs, breaking search the moment the ingest worker is active. A `_dirty`
   flag (true only for pending adds/removes, or a freshly-created index with no file on disk
   yet) makes a pure reader's shutdown-time `flush()` a true no-op — it neither touches the
   file nor the lock — which is what makes the read/write split actually safe rather than
   just untested.
5. **Frontend.** New `app/api/lib/ragIngestPoll.ts` (`pollIngestJob`, `enqueueAndAwaitIngest`)
   turns the async contract back into a synchronous result at the Next.js boundary, so
   `app/api/lib/corpusBackend.ts::ingestCorpusDocument` and `app/api/admin/rag/ingest/route.ts`
   keep their exact existing return/response shapes — neither `app/api/corpus/[id]/documents/route.ts`,
   `app/api/lib/services/corpusFacts.ts`, nor `features/admin/hooks/useRagIngestData.ts` needed
   any change. `npx tsc --noEmit` on the whole project: clean.
6. **Other direct callers, found by grep, not in the task's Files list.**
   `backend/rag/scrapping/sources/sci-judgments/download.ts`'s `ingestIntoKnowledgeBase` POSTs
   to `/ingest` directly (this is the same function **T11** exists to decouple further) — it
   now polls the job the same way, which moves the wait out of a held-open gunicorn worker
   thread on the backend without fully solving T11 (the scraper's own loop still blocks on
   it; that part is T11's). `backend/rag/scripts/verify_rag.py --http` now polls
   `GET /jobs/{job_id}` too, and its docstring notes `--http` needs an ingest worker running
   (`owllex-ingest`, or `... ingest_worker --once`) since the API alone no longer completes
   an ingest.
7. **`backend/deploy/README.md`** (item 3): documents that `rebuild_index.py` needs
   `owllex-ingest` stopped because it writes through `VectorIndex` and would hit the lock, and
   that `migrate_storage_split.py` needs it stopped for an unrelated reason the lock does
   *not* cover — it moves the `.faiss` file at the filesystem level, so a live worker's next
   flush after the move would recreate a file at the old, now-stale path.

**Coordination note.** Another session was independently starting T2 on this same working
tree; confirmed scope by message before either side wrote more, and it moved to T3 instead.
Mentioned here because the two sessions' T0/T1 Results independently describe the same fixes
— that duplication is a symptom of working unisolated on a shared tree, not of the fixes
being wrong.

**Verify.** `cd backend && .venv/bin/python -m pytest tests/test_rag_stack.py -q` → 62 passed
(`TestVectorIndex::test_a_second_writer_is_refused_not_silently_clobbered` and
`::test_a_read_only_process_never_contends_for_the_write_lock`, plus
`TestIngestJobQueue`'s 4 tests, which drive the real worker functions against a manifest
written the same way the route writes one — enqueue → complete, enqueue → duplicate, enqueue
→ failed/quarantined, and an organic drop alongside a manifest job in the same pass). Full
suite: `pytest tests/ -q` → 131 passed, 9 skipped, 0 failed.

---

### - [x] T2a. Stop the nightly backup from truncating the FAISS index

**Why.** T2 describes a *race* between two writers. This is the same failure on a **timer**:
it is not a race, it happens every night, and it silently discards every vector the ingest
worker added while the backup was running.

**The bug.** `owllex-backup.service` runs `backend/rag/scripts/backup_now.py`, which does:

```python
services = build_services()
startup(services)          # -> services.indexes.load_all()   reads owllex.faiss into RAM
result  = run_backup(services, ...)
shutdown(services)         # -> services.indexes.close() -> flush()
```

`startup()` loads the live index into this third process's memory. Then
`_backup_faiss()` in `backend/rag/core/backup.py:234-237` calls
`services.indexes.flush_all()` — described as "flush the in-memory indexes, then copy the
index files", which is correct *inside the writer process* and actively destructive in a
read-only one. `flush()` writes this process's snapshot over `owllex.faiss` via
`os.replace`. `shutdown()` then flushes it a second time.

So the on-disk index is rewound to whatever it was when the backup process started.
`owllex-backup.service` sets `TimeoutStartSec=21600`, and the weekly document mirror
legitimately runs for hours — every vector `owllex-ingest` writes during that window is
gone, with its `chunks` rows still in SQLite. Nothing errors. The next search simply misses.

`deploy/README.md` already tells you to set `BACKUP_ENABLED=false` and prefer the timer, so
this is the *recommended* configuration.

**Files.** `backend/rag/core/backup.py`, `backend/rag/scripts/backup_now.py`,
`backend/rag/core/vector_index.py`.

**Change.**
1. `_backup_faiss` must not flush. The index is replaced atomically by `os.replace`, so a
   plain `shutil.copy2` of `owllex.faiss` + `owllex.meta.json` is already a consistent
   snapshot. Flushing is only correct when the backup runs in-process under
   `BACKEND_ENABLED=true` APScheduler — pass an explicit `flush: bool` and default it off.
2. `backup_now.py` must open the stack **read-only**: add a `read_only=True` to
   `build_services()`/`startup()` that skips `load_all()` entirely (the backup only needs
   the paths), and make `shutdown()` not flush in that mode.
3. Add the T2 file lock, so even if (1) and (2) regress, the third writer fails loudly.
4. Note in `deploy/README.md` that the backup snapshots the index **as last flushed**, which
   is the point of `rebuild_index.py`.

**Verify.**
```bash
cd backend && .venv/bin/python - <<'PY'
# add vectors in proc A, run backup_now in proc B, assert A's vectors survive on disk
PY
```
Write it as a regression test: record `ntotal`, run `backup_now.main()`, assert the on-disk
`ntotal` did not go down.

**Done when.** Running a backup, at any point during an ingest, cannot reduce the number of
vectors in `owllex.faiss`.

**Result.** Implemented all four Change items, plus found this needed less new machinery than
expected because T2's `_dirty`-flag fix (a pure reader's `flush()` is already a no-op) turned
out to cover most of this bug's mechanism as a side effect — implemented anyway, since the
task is explicit that these should be independent, redundant safeguards, not one fix relying
on another module's internals holding forever.

1. `rag/core/backup.py`: `_backup_faiss` takes `flush: bool = False`; only calls
   `services.indexes.flush_all()` when `True`. `run_backup` takes `flush_faiss: bool = False`
   and threads it through. Docstrings on both explain *why* False is correct in every caller
   that currently exists — including the in-process APScheduler job inside `owllex-rag`,
   which the original task text flagged as the one place flushing was historically correct;
   it no longer is, now that T2 made that process read-only too. No caller passes `True`
   anywhere in the tree today; the parameter exists for a hypothetical future in-process
   writer, per the task.
2. `rag/core/services.py`: `startup()` takes `read_only: bool = False`; when set, skips
   `services.indexes.load_all()` entirely (and everything downstream of it — drift/partition
   checks — since there is nothing loaded to check). Didn't thread `read_only` through
   `shutdown()`: with `load_all()` skipped, `VectorIndexRegistry._indexes` is empty, so
   `close()` already has nothing to flush — a second flag there would duplicate what an empty
   dict already guarantees.
3. `rag/scripts/backup_now.py`: `startup(services, read_only=True)`.
4. T2's file lock already covers item 3 of this task's Change list — nothing further needed;
   confirmed the read-only path never calls `_acquire_write_lock()` (it returns out of
   `flush()` before reaching that line whenever nothing is dirty).
5. `backend/deploy/README.md`: corrected the backup tree diagram (it said "flushed first",
   which was the bug) and added a paragraph under Backups explaining the snapshot is a plain
   copy of the last flush, with `rebuild_index.py` named as the tool for drift, not a flush.

**Verify.** Added two tests to `TestBackups` in `test_rag_stack.py`, simulating a second
process as a separate `RagServices` sharing `self.services`'s SQLite/LMDB/embedder but with
its *own* `VectorIndexRegistry` (LMDB refuses to open the same environment path twice within
one OS process, so a literal second `build_services()`+`startup()` call fails on that, not on
anything FAISS-related — this isolates the test to the store the bug is actually about):
`test_a_backup_does_not_rewind_vectors_added_while_it_runs` (the primary regression: a
read-only second process, ingest happens on the real writer while it's "open", backup runs,
on-disk vector count is unaffected) and `test_a_stale_snapshot_is_not_written_even_if_told_to_flush`
(defense-in-depth: even a second process that loaded the full index and is explicitly told
`flush_faiss=True` still writes nothing, because its own `_dirty` is false). `pytest
tests/test_rag_stack.py -q -k Backup` → 17 passed. Full suite: `pytest tests/ -q` → 133
passed, 9 skipped, 0 failed.

---

### - [x] T2b. Make FAISS id allocation atomic across processes

**Why.** `SqliteStore.allocate_faiss_ids` is the counter the whole tenancy design rests on —
"ids are never reused, even after their rows are deleted: a vector that outlives its row
must be able to fail to resolve, never to resolve to somebody else's chunk". It is safe
between threads and **not safe between processes**, and T2 establishes that two processes
write today.

**The bug.** `backend/rag/core/sqlite_store.py:570-608`. `_write()` takes
`self._write_lock`, a `threading.Lock` — per-process — and then `with conn:`. Python's
`sqlite3` defaults to `isolation_level=""`, a **deferred** transaction: no `BEGIN` is emitted
until the first DML statement. The `SELECT value FROM meta WHERE key = ?` therefore runs in
autocommit, outside any transaction, and releases its read lock immediately. Two processes
read the same `start` and both hand out the same range. Reproduced:

```
$ python toctou.py t.db alloc &  ; python toctou.py t.db alloc
pid 16309 allocated 1..11
pid 16307 allocated 1..11
final: [('next_public_faiss_id', '11')]
```

`busy_timeout` does not help — there is no lock to wait on.

What saves you today is one line of schema: `faiss_id INTEGER NOT NULL UNIQUE` on `chunks`.
The loser's `replace_chunks` fails with `UNIQUE constraint failed: chunks.faiss_id`, the
document is marked `failed`, LMDB is not written, and the next pass retries it. So the
observable symptom is **concurrent ingest failing at random with an opaque IntegrityError**,
plus a silently burned id range each time — not a leak. That constraint is load-bearing in a
way nothing in the code says, and if it is ever relaxed, or if a future path adds to FAISS
before writing SQLite, the same race becomes one document's vectors resolving to another
document's text.

**Files.** `backend/rag/core/sqlite_store.py`.

**Change.**
1. Make the read-modify-write one atomic statement:
   ```sql
   UPDATE meta SET value = CAST(value AS INTEGER) + ? WHERE key = ?
   RETURNING CAST(value AS INTEGER) - ?
   ```
   (SQLite 3.35+ has `RETURNING`; check `sqlite3.sqlite_version` at startup and fail loudly
   if older.) Keep the partition-floor clamp and the exhaustion checks.
2. Alternatively, open connections with `isolation_level=None` and wrap the allocation in an
   explicit `BEGIN IMMEDIATE` ... `COMMIT`, which takes the write lock before the `SELECT`.
   Do this for **every** read-then-write in the file, not just this one.
3. Add a comment on `chunks.faiss_id UNIQUE` saying it is the last line of defence against a
   double-allocation, so nobody drops it as redundant.

**Verify.**
```bash
cd backend && .venv/bin/python - <<'PY'
# fork two processes, allocate 1000 ids each, assert the two ranges are disjoint
PY
```

**Done when.** Two concurrent processes allocating from the same counter never receive an
overlapping range, proven by a test that actually forks.

**Result.** Already correct on this tree — implemented (apparently by another session working
the same shared checkout; no separate coordination message this time, unlike T2) and already
committed at `46b3978`, just not ticked off here. Verified rather than re-implemented:

1. `allocate_faiss_ids` (`rag/core/sqlite_store.py:609-674`) uses exactly the atomic form the
   task specifies — a single `UPDATE meta SET value = CAST(value AS INTEGER) + ? WHERE key = ?
   AND CAST(value AS INTEGER) + ? < ? RETURNING CAST(value AS INTEGER) - ? AS start`, no bare
   `SELECT` anywhere in the allocation path. The partition-floor clamp is its own guarded
   `UPDATE ... RETURNING` too, so two processes racing the seed-and-clamp step agree on the
   same outcome rather than one silently overwriting the other's clamp.
2. `SqliteStore.initialize()` checks `sqlite3.sqlite_version_info < (3, 35, 0)` and raises
   loudly before any table is created, with a comment pointing at this task and naming
   `allocate_faiss_ids`'s dependency on `RETURNING` as the reason.
3. The `chunks.faiss_id INTEGER NOT NULL UNIQUE` schema comment (`sqlite_store.py:116`) already
   documents it as "the last line of defence" per Change item 3.
4. `tests/test_rag_stack.py::TestSqliteStore::test_allocate_faiss_ids_is_atomic_across_real_processes`
   is the Verify script as a permanent regression test: two real `multiprocessing.Process`
   workers (module-level `_allocate_ids_in_subprocess`, not a closure, so it's importable under
   any start method) each allocate 1000 ids from the same on-disk `chunks.db`, and the test
   asserts the two returned ranges are disjoint. Its docstring is explicit about *why* it forks
   rather than threads: `_write_lock` is a `threading.Lock`, per-process, so two threads would
   never exercise the bug — only two independent `sqlite3` connections from two independent
   processes reproduce what the deferred-isolation bare-`SELECT` race actually does in
   production.

**Verify.** `cd backend && .venv/bin/python -m pytest tests/test_rag_stack.py -q -k
atomic_across_real_processes` → 1 passed. Full suite: `pytest tests/ -q` → 134 passed, 9
skipped, 0 failed (up from T2a's 133 passed because this task's regression test is new since
that Result was written). Needed no code change — a local `.venv` did not yet exist on this
checkout, so it was built from `uv.lock` (`uv sync`) plus `faiss-cpu`, `lmdb`, `numpy<3`,
`langchain-text-splitters`, `pytest` and `httpx2` installed ad hoc (none of these are pulled in
by the base dependency set or the `rag` extra without also dragging in `docling`'s multi-GB
torch/CUDA chain, which does not fit this host's disk budget and is not needed for a suite that
is "entirely offline: no ... Docling" per its own docstring). Not persisted to `pyproject.toml`
— matching how T0–T2a's Results describe running the same `pytest` commands without listing
`pyproject.toml` under Files, this tree's convention is evidently to keep the test-only
dependency set out of the lockfile.

---

### - [x] T3. Fix the SCI scraper permanently losing judgments

**Why.** A crash in a one-line window makes a judgment unfetchable forever, silently, and
re-running does not recover it.

**The bug.** In `backend/rag/scrapping/sources/sci-judgments/download.ts` the order is:
fetch bytes → hash → `await put('sci:cnr:' + cnr, 1)` → check hash dedup → `writeFileSync`
→ append manifest. The CNR is marked as downloaded **before** the file is written. A crash,
kill or OOM in that window leaves LMDB asserting the judgment was fetched when nothing was
stored — and `has('sci:cnr:' + cnr)` is the skip check at the top of the loop, so no future
run ever fetches it again.

**Files.** `backend/rag/scrapping/sources/sci-judgments/download.ts`.

**Change.** Move the `put('sci:cnr:...')` call to **after** `writeFileSync` and the
`appendFileSync` of the manifest row, matching the commit-last discipline the Python
pipeline already uses (LMDB write is the last step — see `backend/rag/app/ingest/pipeline.py`
module docstring). Keep the `sci:hash:` dedup check where it is.

**Verify.** Write a script that kills the process between download and write, re-runs, and
asserts the CNR is fetched on the second run. At minimum, add a reconciliation script
`backend/rag/scripts/audit_scrape_index.py` that diffs LMDB `sci:cnr:*` keys against
`manifest.jsonl` and reports orphans, then run it.

**Done when.** An interrupted scrape re-fetches the in-flight document on the next run, and
the audit script reports zero orphaned CNR keys.

**Result.** Fixed, but the literal instruction ("move the `put('sci:cnr:...')` call to after
`writeFileSync` and the `appendFileSync`") turned out to be necessary but not sufficient — a
regression test caught a narrower version of the same bug one step later.

1. **Extracted** the per-document commit logic out of `download.ts` (which launches a real
   Chromium via Playwright and can't be unit-tested cheaply) into new
   `sources/sci-judgments/persist.ts::persistDownloadedJudgment`, importing only `node:crypto`,
   `node:fs`, `hashdb.js` and `storage.js` — no Playwright, so it's testable without a browser.
   `download.ts`'s loop now calls it instead of inlining the write.
2. **The ordering fix**, and a subtlety the task's Change section doesn't mention. Moving only
   the CNR marker (`put(sci:cnr:...)`) to the end, per the literal instruction, still leaves the
   hash marker (`put(sci:hash:...)`) set *before* it, in its original position. A crash between
   those two `put` calls means a retry for the *same* CNR sees its own interrupted attempt's
   hash marker, takes the "someone else already has this content" duplicate branch, and marks
   the CNR done **without ever writing the manifest row** — the file exists on disk (written on
   the first attempt) but nothing in `manifest.jsonl` points at it. Caught by
   `tests/unit/scrapping-sci-persist.test.ts`'s first test, not by inspection. Fixed by moving
   the hash marker too, so both markers are written only after the manifest row exists, hash
   first then CNR: a crash between the two now replays as a correct no-op (duplicate branch,
   CNR marked, no second manifest row) instead of a lost manifest row. The dedup check itself
   stays where the task says to keep it — before the file write.
3. **`backend/rag/scripts/audit_scrape_index.py`** (new): opens the scraper's LMDB directly
   (not through `rag/core/hash_index.py`, which is a different index — see that file's own
   docstring), diffs `<source>:cnr:*` keys against `manifest.jsonl`'s `cnr` fields, reports
   orphans (marked downloaded, no manifest row) and, with `--fix`, deletes them so the next
   scrape retries. Also reports the harmless reverse case (manifest row, no marker) without
   failing on it.
4. **A real cross-runtime compatibility gap**, found while building (3), not documented
   anywhere in the tree before now: the npm `lmdb` package defaults to on-disk data format V2,
   which Python's `lmdb` binding cannot open at all (`lmdb.InvalidError: ... File is not an LMDB
   file`) — confirmed by writing keys with node's `lmdb` and failing to read them with py-lmdb,
   then succeeding after rebuilding the native module with `LMDB_DATA_V1=true`. Without that
   rebuild, `audit_scrape_index.py` cannot function at all against a real index, which would
   otherwise make this task's own Verify step untestable in production. Did **not** wire this
   into `npm install` for the whole project — the scraper and this audit script run wherever
   scraping actually happens, not in the Vercel build, and forcing every install everywhere to
   compile a native module from source is a bigger call than this task's scope. Instead: added
   `npm run scrape:setup-lmdb-v1` (one-time, opt-in) and documented the requirement in
   `rag/scrapping/README.md`, and `audit_scrape_index.py` catches `lmdb.InvalidError` and prints
   that exact command rather than a bare traceback. `package.json` also gained
   `"allowScripts": {"lmdb@3.5.6": true}` — a prerequisite for `lmdb`'s native binding to build
   at all under this repo's install-script gating, unrelated to V1 vs V2 and needed either way.
   While correcting this, also fixed several already-stale specifics in the adjacent README
   section (`data/hash_index.lmdb` → `SCRAPE_LMDB_PATH`, `backupToR2()` → `backupHashIndex()`
   writing local snapshots, `rag/hash_db.py` → `rag/core/hash_index.py`) since leaving them wrong
   next to a new, correct note would have been worse than not writing the note.
5. **Environment note, not a code issue.** This checkout had no `.venv` and no `node_modules`.
   Built both from lockfiles (`uv sync`; `npm ci`) rather than the full `--extra rag --extra
   embeddings`/unpinned install, because the disk budget here is 4.8G total and `docling`
   pulls in a multi-GB torch/CUDA chain unrelated to anything this task touches — installed only
   `faiss-cpu`, `lmdb`, `numpy<3`, `langchain-text-splitters`, `pytest`, `httpx2` ad hoc for the
   Python side (same convention as T0–T2b's Results: these aren't declared as a `pytest`/test
   dependency group anywhere in `pyproject.toml`, so this checkout's state doesn't persist them
   there either).

**Verify.** Unit tests: `npx vitest run tests/unit/scrapping-sci-persist.test.ts` → 4 passed,
covering (a) a crash between file-write and manifest-append leaves neither marker set and a
retry writes exactly one manifest row, (b) duplicate content is marked done immediately with no
second file, and (c) the hash/CNR-marker-ordering regression described in item 2 above. Full
`npx vitest run` → 265 passed, 2 failed (`tests/api/contract-review-compression.test.ts`, both
timeouts calling a route needing services unavailable in this sandbox — untouched by this task;
confirmed unrelated by file scope). `npx tsc --noEmit` → clean. End-to-end, by hand: wrote one
correctly-committed document and one hand-simulated pre-fix-shaped orphan through the real
`persistDownloadedJudgment`/`put` via `tsx`, into a real LMDB rebuilt in V1 format, then ran
`.venv/bin/python -m rag.scripts.audit_scrape_index` against it — reported exactly the one
orphan and left the good document alone; `--fix` removed it and a re-run reported zero orphans,
exit 0. Full backend suite unaffected: `pytest tests/ -q` → 134 passed, 9 skipped, 0 failed.

---

### - [x] T4. Point the TypeScript scrapers at the same storage roots as Python

**Why.** On the split host that `backend/.env.example` itself describes, the scraper
archives PDFs to one path while the backend reads another, so scraped documents are
invisible to ingest and the dedup indexes diverge.

**The bug.** `backend/rag/scrapping/paths.ts` reads only `DATA_ROOT` and `PDF_ROOT`. Python
reads `HDD_DATA_ROOT`, `SSD_DATA_ROOT` and `LEGAL_CORPUS_ROOT`. With
`HDD_DATA_ROOT=/mnt/hdd/owllex` and `LEGAL_CORPUS_ROOT=/mnt/hdd/owllex/legal_corpus`, the
scraper writes to `/data/documents`. Same divergence for `SCRAPE_LMDB_PATH` (defaults under
`/data`, not the SSD tier) and `backupRoot`.

Separately, `backend/rag/scrapping/storage.ts:20` uses
`String(new Date().getUTCFullYear())` — the **download** year — while
`backend/rag/core/paths.py` buckets by the **document's own** year. A 1998 judgment scraped
today lands at `sci/2026/<hash>.pdf` from TypeScript and `sci/1998/<hash>.pdf` from Python,
so the "writing it twice is free" claim in `storage.ts` is false and you get two full copies
of every scraped PDF.

**Files.** `backend/rag/scrapping/paths.ts`, `backend/rag/scrapping/storage.ts`.

**Change.**
1. `paths.ts`: resolve `HDD_DATA_ROOT` then `DATA_ROOT` for bulk paths, and
   `SSD_DATA_ROOT` then `DATA_ROOT` for the LMDB path. Honour `LEGAL_CORPUS_ROOT` (and
   legacy `PDF_ROOT`) exactly as `rag/core/config.py::_resolve_legal_corpus_root` does.
2. `storage.ts`: take the document year as a parameter from the caller. When the year is
   unknown, write to a `unknown-year/` bucket rather than silently using the current year.

**Verify.**
```bash
cd backend && HDD_DATA_ROOT=/tmp/hdd SSD_DATA_ROOT=/tmp/ssd npx tsx -e \
  'import {pdfRoot,backupRoot} from "./rag/scrapping/paths.js"; console.log(pdfRoot(),backupRoot())'
```
Both must print paths under `/tmp/hdd`, matching what `rag/core/config.py` resolves for the
same environment.

**Done when.** A scraped PDF and the same PDF ingested through Python land at byte-identical
paths.

**Result.**

1. **`paths.ts`** rewritten: added `hddDataRoot()`/`ssdDataRoot()` (each `HDD_DATA_ROOT`/
   `SSD_DATA_ROOT` or `DATA_ROOT`, mirroring `RagConfig.from_env`'s fallback exactly).
   `pdfRoot()` now reimplements `rag/core/config.py::_resolve_legal_corpus_root` line for line,
   including its two fallbacks: an explicit `LEGAL_CORPUS_ROOT` (or legacy `PDF_ROOT`) always
   wins, and failing that a non-empty pre-rename `documents/` directory is used as-is rather
   than presenting a live corpus as empty. `backupRoot()` now bases on `hddDataRoot()` instead
   of `dataRoot()` — it was one of the divergences the bug report named explicitly.
2. **`hashdb.ts`**: `SCRAPE_LMDB_PATH`'s default now resolves under `ssdDataRoot()` (matching
   `rag/core/config.py`'s own `LMDB_PATH`, whose tier this index is a sibling of, not the same
   database as) instead of `dataRoot()`.
3. **`storage.ts`**: `uploadRawDocument` takes an optional `year` parameter instead of computing
   `new Date().getUTCFullYear()` internally; an implausible or missing year (checked against the
   same year-range regex `rag/core/paths.py::_year_segment` uses) buckets under `unknown-year/`.
   This is a deliberate divergence from `_year_segment`'s own fallback (which silently uses the
   current year) — the point of this task is that a silent, plausible-looking wrong guess is the
   actual bug, so matching Python's fallback would just move the same defect one file over. An
   operator seeing `unknown-year/` knows to look; one seeing `2026/` for a 1998 judgment doesn't.
4. **Threaded the new `year` parameter through both existing callers**, though only `storage.ts`
   and `paths.ts` were in this task's Files list. `sources/sci-judgments/persist.ts` (T3's
   extraction) gained an optional `year` field on `DownloadedJudgment`, passed through — nothing
   currently populates it (the SCI search results page has no parsed date, only free-text and a
   CNR that does encode a year but isn't parsed anywhere; that's future work, not this field's
   job), so SCI documents land in `unknown-year/` until it is. `sources/india_code/download.ts`
   *does* already parse a real year per document (`dc.date.act_year`, with `"0000"` as India
   Code's own "unknown" sentinel) and was one line from passing it — leaving it unthreaded would
   have silently regressed every India Code archive copy from "current year" to "unknown-year"
   despite the real value sitting right there in scope for the same call site, so it's threaded
   too (`row.actYear`; the `"0000"` sentinel fails the plausible-year check the same way a
   missing year does, landing in `unknown-year/` same as before, correctly).
5. **`hc-judgments`** has no source directory yet (README: "not built"), so nothing to update
   there.

**Verify.** The task's exact command:
```
cd backend && HDD_DATA_ROOT=/tmp/hdd SSD_DATA_ROOT=/tmp/ssd npx tsx -e \
  'import {pdfRoot,backupRoot} from "./rag/scrapping/paths.js"; console.log(pdfRoot(),backupRoot())'
```
→ `/tmp/hdd/legal_corpus /tmp/hdd/backups`. Cross-checked against Python for the same
environment: `RagConfig.from_env().legal_corpus_root` / `.backup_root` → the identical two
paths. Also confirmed by hand: `SCRAPE_LMDB_PATH`'s default now lands under `/tmp/ssd/lmdb/`,
not `/tmp/hdd/`; and `uploadRawDocument` with a known year, an omitted year, and India Code's
`"0000"` sentinel land in `.../1998/`, `.../unknown-year/`, `.../unknown-year/` respectively —
never silently in the scrape day's year. Added `tests/unit/scrapping-paths.test.ts` (7 tests)
as permanent regression coverage for all of the above. Full suite: `npx vitest run` → 272
passed, 2 failed (the same pre-existing, unrelated `contract-review-compression.test.ts`
timeouts noted in T3's Result). `npx tsc --noEmit` → clean.

---

# Phase 0b — Close the authentication and deployment holes

Two findings outside the architecture audit's scope. The first is an authentication bypass
that a default `.env` turns on. The second means the services cannot write to disk at all on
the very host layout `.env.example` recommends.

### - [x] T4a. Refuse a token whose issuer you did not configure

**Why.** With `CLERK_JWT_ISSUER` unset — which is how `backend/.env.example` ships it, and
which the file's own header lists as *not* required in production — `require_authenticated_user`
trusts the issuer printed inside the **unverified** token and fetches the signing keys from
it. Anyone can mint a token, host a JWKS document at their own HTTPS domain, put that domain
in `iss`, and be authenticated as any `sub` they choose. That is every user-scoped route:
`/api/user-documents`, `/api/documents`, the whole `userdetails` tree.

**The bug.** `backend/app/security.py:20-66`.

```python
issuer = unverified_payload.get("iss")                  # attacker-controlled
if not isinstance(issuer, str) or not issuer.startswith("https://"):
    raise HTTPException(401, "Invalid token issuer")     # only checks the scheme

expected_issuer = settings.CLERK_JWT_ISSUER.strip()
if expected_issuer and issuer.rstrip("/") != expected_issuer.rstrip("/"):
    raise HTTPException(401, "Token issuer mismatch")     # skipped entirely when empty

jwk_client = py_jwk_client(f"{issuer.rstrip('/')}/.well-known/jwks.json")   # attacker's keys
...
decode_kwargs = {"issuer": expected_issuer or issuer, ...}                  # verifies against itself
```

`if expected_issuer and ...` is the whole defect: an unconfigured issuer means *no* issuer
check, and `expected_issuer or issuer` then makes PyJWT verify the token against the issuer
the token itself supplied. `backend/app/config.py:66` defaults it to `""`.

Two lesser problems in the same function: the outbound JWKS fetch is an unauthenticated
server-side request to a URL derived from request input (SSRF — it can be pointed at a link-local
or internal address that answers with JSON), and a fresh `PyJWKClient` is constructed **per
request**, so every authenticated call makes a synchronous network round trip to Clerk with
no cache and no timeout.

**Files.** `backend/app/security.py`, `backend/app/config.py`, `backend/.env.example`.

**Change.**
1. Make `CLERK_JWT_ISSUER` **required**: raise in `Settings.__post_init__` when it is empty
   and `DEBUG` is false, exactly as `RAVENSLAW_CORS_ORIGINS` already does. Fail at boot, not
   at the first forged token.
2. Remove the `expected_issuer or issuer` fallback. Compare against the configured issuer
   only, and build the JWKS URL from the **configured** issuer, never from the token.
3. Construct one module-level `PyJWKClient` with `cache_keys=True` and an explicit
   `timeout`, rather than one per request.
4. Update `.env.example`: move `CLERK_JWT_ISSUER` into the required list in the header
   comment and give it a real example value.

**Verify.**
```bash
cd backend && .venv/bin/python -m pytest tests/ -q -k security
```
Add tests: (a) a token whose `iss` is not the configured issuer is 401 **without** any
outbound request; (b) an empty `CLERK_JWT_ISSUER` with `RAVENSLAW_DEBUG=false` refuses to
construct `Settings`.

**Done when.** A token from an issuer you did not configure is rejected, and the process will
not start in production without an issuer configured.

**Result.** All four Change items done, plus the two lesser problems the task calls out.

1. **`app/config.py`**: added a `CLERK_JWT_ISSUER`-required check to `Settings.__post_init__`,
   right alongside the existing `RAVENSLAW_CORS_ORIGINS` one. Reads `os.getenv("CLERK_JWT_ISSUER",
   "")` fresh rather than `self.CLERK_JWT_ISSUER` — that field's class-level default is a dataclass
   default expression, evaluated once at `app.config`'s first import, so `self.CLERK_JWT_ISSUER`
   would silently ignore any environment change made after that (the same reason `CORS_ORIGINS`'s
   check already does a fresh read instead of trusting its own field). Fails loudly with
   `RuntimeError` outside `DEBUG`, exactly like the existing CORS/trusted-hosts checks.
2. **`app/security.py`** rewritten. The JWKS URL is now built once, at module import time, from
   `settings.CLERK_JWT_ISSUER` — never from a request. `require_authenticated_user` no longer
   reads `unverified_payload.get("iss")` to decide *where to fetch keys from*; it only reads it
   as a cheap, fail-fast pre-check (reject before making any outbound request if the claimed
   issuer obviously isn't the configured one), and the actual security boundary is the `issuer=`
   kwarg passed to the signature-verified `jwt.decode()` call. The `expected_issuer or issuer`
   fallback is gone entirely — decode always verifies against the configured issuer, full stop.
3. **SSRF**: closed as a side effect of (2) — the JWKS fetch target is now a fixed,
   operator-configured URL, never derived from request input.
4. **Per-request `PyJWKClient`**: replaced with one module-level instance, `cache_keys=True`,
   explicit `timeout=5.0` (PyJWT's own default is 30s — tightened so a slow/dead JWKS endpoint
   fails a request instead of holding a worker thread for half a minute).
5. **`.env.example`**: `CLERK_JWT_ISSUER` moved into the required list in the header comment,
   given a real-shaped example value and a comment explaining what it gates and where to find it
   on Clerk's dashboard.

**Verify.** New `backend/tests/test_security.py` (10 tests), all against the real module-level
`_jwk_client` with only its network call mocked (never the signature check) — real RS256
sign/verify throughout via `cryptography`. Covers both cases the task names: (a) a token whose
`iss` isn't the configured issuer is rejected with zero calls to the JWKS lookup, asserted via
mock call count — this is the actual regression test, since the pre-fix bug's entire mechanism
was making that lookup against an attacker-chosen domain; and (b) a fresh subprocess with
`RAVENSLAW_DEBUG=false` and no `CLERK_JWT_ISSUER` fails to construct `Settings`, exit non-zero,
`CLERK_JWT_ISSUER` named in stderr — run as a real subprocess deliberately, because
`app.config`'s dataclass field defaults (`DEBUG` included) are frozen at first import for the
whole pytest session (this session already imports `app.config` with `RAVENSLAW_DEBUG=true` via
`tests/conftest.py`), so no in-process `Settings()` construction can ever see `DEBUG=false` no
matter what `os.environ` is monkeypatched to. Also added: the actual pre-fix bypass shape
reproduced and confirmed now rejected (a token forged with the attacker's own key but claiming
the *real* issuer — passes the fast pre-check, fails signature verification against the
JWKS-lookup-returned trusted key), expired token, missing subject, missing/malformed
Authorization header, and that `DEBUG=true` still boots with no issuer configured (the deliberate
laptop-checkout escape hatch). `tests/conftest.py` gained `CLERK_JWT_ISSUER` in its
session-wide test defaults, alongside the other settings T0 already centralized there — needed
so `app.security`'s module-level `_jwk_client` exists at all for these tests to patch.

`.venv/bin/python -m pytest tests/ -q -k security` → 10 passed, 1 skipped (the pre-existing
`test_scrapping.py` skip, unrelated). Full suite: `pytest tests/ -q` → 144 passed, 9 skipped, 0
failed (up from T4's 134 — 10 new). Stable under `-p no:randomly`; `test_user_documents.py` run
alone still 44 passed; `test_security.py` run alone still 10 passed.

---

### - [x] T4b. Stop the systemd units hardcoding `/data`

**Why.** On the split host `backend/.env.example` describes — `HDD_DATA_ROOT=/mnt/hdd/owllex`,
`SSD_DATA_ROOT=/mnt/nvme/owllex` — all three units combine `ProtectSystem=strict` with
`ReadWritePaths=/data`. `ProtectSystem=strict` mounts the entire filesystem read-only except
what `ReadWritePaths` re-opens, so the service can read the corpus and **cannot write a byte
of it**: every ingest, every FAISS flush, every SQLite write fails with `EROFS`. The service
starts cleanly and then fails on first write.

Three more hardcodes in the same files:

- `RequiresMountsFor=/data` — described in `owllex-rag.service` as "the single most important
  line in this file", the guard against starting before the data volume mounts. On a split
  host `/data` is not a mount point and may not exist, so the guard silently passes and the
  thing it was written to prevent happens anyway.
- `Environment=HF_HOME=/data/models` — model weights land on the boot SSD. (T19 covers this
  one; it is the same root cause.)
- `owllex-rag.service` sizes `MemoryMax=26G` and its "one worker, deliberately" comment
  around "~16GB resident for the 8B model" — which is the model T19 says the deployment
  should not be running. With the 0.6B model those numbers describe nothing real.

**Files.** `backend/deploy/systemd/owllex-rag.service`,
`backend/deploy/systemd/owllex-ingest.service`, `backend/deploy/systemd/owllex-backup.service`,
`backend/deploy/deploy.sh`.

**Change.**
1. Stop hardcoding. Have `deploy.sh` render the units from a template, substituting the
   `HDD_DATA_ROOT` / `SSD_DATA_ROOT` actually present in `.env` into `ReadWritePaths=`,
   `RequiresMountsFor=` and `HF_HOME=`. A `.d/` drop-in per host works too; a template is
   less to get wrong.
2. `RequiresMountsFor=` must list **both** tiers on a split host. A backend that starts with
   the NVMe mounted and the HDD missing is the failure this line exists to prevent.
3. Add a boot-time assertion in `rag/core/services.py::startup` that each configured root is
   writable (create and unlink a probe file), and fail the unit if not — so a units/env
   mismatch is a refused start with a clear message rather than a first-write error hours
   later.
4. Re-derive `MemoryMax` from the model T19 settles on, and rewrite the comment to match.

**Verify.**
```bash
sudo systemd-analyze verify /etc/systemd/system/owllex-rag.service
sudo systemctl show owllex-rag -p ReadWritePaths -p RequiresMountsFor
sudo -u owllex touch "$HDD_DATA_ROOT/.probe" && rm "$HDD_DATA_ROOT/.probe"
```
Every configured root must appear in `ReadWritePaths`, and the probe must succeed **as the
service user, under the unit's sandbox** — `systemd-run --uid=owllex --property=ProtectSystem=strict ...`
is the honest test, since a plain `sudo -u` bypasses the sandbox that causes the bug.

**Done when.** The units grant write access to exactly the roots `.env` configures, and a
missing mount on either tier refuses the start.

**Result.** All four Change items done. `deploy.sh`'s own mounting/directory-creation logic
(steps 4–5) is still single-`DATA_ROOT` only — deliberately left that way; see item 1 below for
why that's still enough to satisfy this task's literal ask.

1. **Templating (`deploy.sh`).** The task's own wording is precise: substitute the roots "as
   they actually appear in `.env`" — not deploy.sh's own `$DATA_ROOT` shell variable, which
   only reflects what the script was invoked with and goes stale the moment `.env` is
   hand-edited afterward (exactly how an operator would actually turn on the split: mount a
   second volume themselves, add `HDD_DATA_ROOT`/`SSD_DATA_ROOT` to `.env`, re-run the
   idempotent script). So step 9 now reads `HDD_DATA_ROOT`/`SSD_DATA_ROOT` straight out of
   `$ENV_FILE` (falling back to `DATA_ROOT` *from that same file*, then to the script's own
   variable — mirroring `RagConfig.from_env`'s exact fallback chain), computes the deduplicated
   set of distinct roots, and substitutes that into `RequiresMountsFor=`, `ReadWritePaths=` and
   `HF_HOME=`. On the common, unsplit host this collapses to the same single-path substitution
   as before (verified byte-identical output); on a split host it lists both. This did not
   require teaching steps 4–5 to mount or provision two volumes — that's a separate, larger
   feature (autodetecting/formatting a second block device the way step 4 already does for one)
   that this bug report doesn't ask for and the task's own wording doesn't imply.
2. **`RequiresMountsFor=` lists both tiers on a split host** — a direct consequence of (1)'s
   dedup logic: the two roots differ, so both appear, space-separated (systemd's directive
   already accepts that form; confirmed below).
3. **Boot-time writability probe**, `rag/core/services.py::_check_storage_writable`, called from
   `startup()` right after `ensure_directories`. The reason this can't just be
   `ensure_directories` doing more of what it already does: `Path.mkdir(exist_ok=True)` on a
   directory that already exists is a true no-op — it does not attempt a write syscall — which
   is exactly the common case (a re-provisioned volume) and exactly the case that would otherwise
   hide a `ReadWritePaths=` mismatch until the first real write, possibly hours into uptime on
   the query-serving process. The probe creates and unlinks a real file in each distinct
   configured tier root.
4. **`MemoryMax` re-derived**, anticipating T19's model default (`qwen3-embedding-0.6b` — not
   yet the *code*-level default in this tree, T19 owns that, but already `.env.example`'s actual
   value, which is what every `deploy.sh`-provisioned host inherits regardless of whether T19
   has landed). The re-derivation surfaced that the original `26G`/`24G` figures' own stated
   reasoning was wrong independent of which model is running: the comment attributed the memory
   requirement entirely to the embedding model and reasoned about "page cache" headroom, but
   `VectorIndex.load()` calls `faiss.read_index()`, a real heap allocation inside the process —
   not something the OS page cache absorbs — and at tier 1 with the `Flat` factory (correct at
   this tier per `FAISS_ARCHITECTURE.md` and `.env.example`) that index alone is `4.5M × 1024 ×
   4 bytes ≈ 18.4GB`, resident in *both* `owllex-rag` and `owllex-ingest` independently (each
   process holds its own copy). So swapping to the smaller model does not shrink the real floor
   anywhere near as much as looking at the model alone would suggest — `18.4GB` (FAISS) + `1.2GB`
   (0.6B model, `FAISS_ARCHITECTURE.md` §6's own figure) still dominates. Set both units to
   `28G` (up slightly from `26G`/`24G`) with a comment giving the actual arithmetic, its source
   (`FAISS_ARCHITECTURE.md` §6), and explicit pointers to re-derive it again in either direction
   — up before growing past tier 1 while still on `Flat`, down once T9 makes a compressed
   factory buildable (§6's own figure there is `~1.7GB` total, a very different number).
5. **`.env.example`**: no changes needed here — `EMBED_MODEL=qwen3-embedding-0.6b` and the tier
   env vars were already correct; this task's Files list names it but the actual staleness was
   entirely in the systemd units' comments and `deploy.sh`'s substitution, not `.env.example`
   itself.
6. **Found, deliberately not fixed here (would need its own dedicated fix and tests, like T1's):
   `rag/core/services.py::_report_index_drift`** iterates the physical-name backward-compat
   alias `COLLECTIONS = ("owllex",)` and compares `metadata.stats("owllex")` (always 0 — the
   `chunks.collection` column only ever holds the logical names, per T1) against
   `indexes.get("owllex").ntotal` (the real physical total) — a spurious "index drift" warning
   at every boot once there's any data. Same bug class T1 fixed in `rebuild_index.py`, left
   behind here. Out of scope for this task (not in its Files list, not something the writability
   probe touches) and risky to fix as a drive-by edit — the correct fix isn't a one-line
   `s/COLLECTIONS/LOGICAL_COLLECTIONS/` (that would double-count the one physical index's
   `ntotal` once per logical collection); it needs summing SQLite's counts across
   `LOGICAL_COLLECTIONS` and comparing once against the one physical `ntotal`. Also found:
   `backend/deploy/README.md`'s architecture diagram (line ~27) still shows one HDD tier holding
   `faiss/`, `sqlite/` and `lmdb/` together, predating the SSD/HDD metadata-vs-bulk split
   `rag/core/config.py` actually implements. Fixed the two README bullets this task's own
   changes touch directly (`RequiresMountsFor=` derivation, `MemoryMax=` reasoning); left the
   diagram itself alone as a separate, larger documentation debt.

**Verify.**
```
sudo systemd-analyze verify /etc/systemd/system/owllex-rag.service
```
Rendered both scenarios by hand (deploy.sh needs root, a real block device and a running
systemd to exercise end-to-end) and ran `systemd-analyze verify` against real stub
`ExecStart=` binaries and mount targets under `/opt/owllex`, `/mnt/hdd/owllex`,
`/mnt/nvme/owllex`: unsplit `.env` (`DATA_ROOT` only) renders the same single-path substitution
as before this task, byte-for-byte; split `.env` (`HDD_DATA_ROOT=/mnt/hdd/owllex`,
`SSD_DATA_ROOT=/mnt/nvme/owllex`) renders `RequiresMountsFor=/mnt/hdd/owllex /mnt/nvme/owllex`,
matching `ReadWritePaths=`, and `HF_HOME=/mnt/hdd/owllex/models` — all three `.service` files,
both scenarios, `systemd-analyze verify` exit 0. Could not run the task's literal
`systemctl show`/`systemd-run --uid=owllex` steps — this container's systemd is present as a
tool but not running as PID 1 (`systemctl is-system-running` → `offline`) — `systemd-analyze
verify`'s clean exit on the actual rendered files, plus the direct `grep` of their substituted
`RequiresMountsFor=`/`ReadWritePaths=`/`HF_HOME=` lines shown above, is the closest available
substitute for what those steps would have confirmed. The writability probe itself is covered
where it can actually run: new `TestStartup::test_an_unwritable_root_refuses_to_start` in
`test_rag_stack.py` builds the layout normally (writable), revokes write permission from one
tier root, and asserts `startup()` raises `RuntimeError` naming that exact path — reproducing
the "directory already exists, `mkdir(exist_ok=True)` is a no-op, only a real write syscall
notices" mechanism without needing an actual `ProtectSystem=strict` sandbox. `pytest tests/ -q`
→ 145 passed, 9 skipped, 0 failed (up from T4a's 144 — this one test).

---

# Phase 1 — Make retrieval correct

The index works at tier 1. These make it correct and let it grow past that.

### - [x] T5. Use `SearchParametersIVF` and add a configurable `nprobe`

**Why.** Two defects in one place, and together they are the reason the documented
production index cannot be used.

**Bug A — every scoped search raises on IVF.** `VectorIndex._build_params` in
`backend/rag/core/vector_index.py` ends with `params = faiss.SearchParameters()`. That is
the base class; an IVF index requires `faiss.SearchParametersIVF` and rejects anything else.
Reproduced against faiss 1.15.0:
```
RuntimeError: Error in virtual void faiss::IndexIVF::search(...)
at IndexIVF.cpp:319: Error: '!(params)' failed: IndexIVF params have incorrect type
```
Every search goes through `_build_params`, so the moment `FAISS_INDEX_FACTORY` is anything
but `Flat`/`HNSW`, retrieval returns 500 for every user.

**Bug B — `nprobe` is never set.** There is no `nprobe` field in `RagConfig`, no
`FAISS_NPROBE` in `.env.example`, and no assignment anywhere in the tree. FAISS defaults it
to **1**. At tier 3 that probes one inverted list out of 131,072 — roughly 3,400 of 450 M
vectors, i.e. low-single-digit recall@10. The failure is silent: ten confident, plausible,
wrong results, and nothing in the health endpoint notices.
`FAISS_ARCHITECTURE.md` §5 specifies 16 / 32 / 64 / 96 by tier.

**Files.** `backend/rag/core/vector_index.py`, `backend/rag/core/config.py`,
`backend/.env.example`.

**Change.**
1. In `_build_params`, detect whether the underlying index is IVF
   (`faiss.extract_index_ivf` inside a `try`) and build `SearchParametersIVF` when it is,
   plain `SearchParameters` otherwise. Set `params.sel` on both.
2. Add `faiss_nprobe: int` to `RagConfig` (`FAISS_NPROBE`, default 16) and set
   `params.nprobe` on the IVF path. Validate `> 0`.
3. Add `FAISS_NPROBE=16` to `.env.example` with the tier table from §5 in a comment.
4. Record `nprobe` and `index_factory` in the `.meta.json` sidecar written by `flush()`, and
   surface both in `/health` so a misconfigured index is visible.

**Verify.**
```bash
cd backend && .venv/bin/python - <<'PY'
import numpy as np, faiss
d=8; n=20000; rng=np.random.default_rng(0)
base=faiss.index_factory(d,"IVF64,PQ4np",faiss.METRIC_INNER_PRODUCT)
idx=faiss.IndexIDMap2(base)
v=rng.normal(size=(n,d)).astype('float32'); faiss.normalize_L2(v)
idx.train(v)
ids=np.concatenate([np.arange(1,n//2+1),(1<<62)+np.arange(n//2)]).astype('int64')
idx.add_with_ids(v,ids)
q=rng.normal(size=(1,d)).astype('float32'); faiss.normalize_L2(q)
p=faiss.SearchParametersIVF(); p.sel=faiss.IDSelectorRange(1,1<<62); p.nprobe=32
D,I=idx.search(q,20,params=p)
got=[int(i) for i in I[0] if i!=-1]
assert got and not any(i>=(1<<62) for i in got), "private id leaked"
print("ok:",len(got),"hits, 0 leaked")
PY
```
Then run the real suite with an IVF factory:
```bash
cd backend && FAISS_INDEX_FACTORY="IVF64,PQ4np" .venv/bin/python -m pytest tests/test_tenant_isolation.py -q
```

**Done when.** Scoped search works on an IVF index, `nprobe` is configurable, and tenant
isolation still passes under a compressed factory.

**Result.** All four Change items done.

1. **`_build_params`** (`rag/core/vector_index.py`) is no longer a `@staticmethod` -- it needs
   `self.nprobe` and `self.index`, the latter to call `faiss.extract_index_ivf(self.index)`
   inside a `try`, exactly as specified: that helper walks through whatever wraps the real IVF
   index (`IndexIDMap2`, OPQ's `IndexPreTransform`, ...) and raises `RuntimeError` when there
   isn't one, which is the only reliable way to ask "is this actually IVF underneath" against
   every factory string `FAISS_ARCHITECTURE.md` §5 lists, rather than an `isinstance` check
   against each wrapper type. Builds `SearchParametersIVF` (with `nprobe` set) when it finds
   one, plain `SearchParameters` otherwise; `params.sel` is set on either. The old
   `scope.unrestricted` fast path (`return None, ()`, skipping params construction entirely)
   is preserved for Flat/HNSW, since neither has anything to configure -- but an unrestricted
   search on an *IVF* index still needs params, purely to carry `nprobe`, so that case now
   falls through instead of also short-circuiting to `None`.
2. **`FAISS_NPROBE`** added to `RagConfig` (default 16, validated `> 0` in `validate()` next to
   `EMBED_DIM`'s check) and threaded through `VectorIndexRegistry.__init__` -> each
   `VectorIndex.__init__` -> `_build_params`, the same path `index_factory`/`flush_every`
   already take. Added to `.env.example` with the full tier/`nlist`/`nprobe` pairing from
   §5's table (corrected mid-task: `.env.example`'s own comment says `Flat` is right "below
   ~1M chunks," while PRODUCTION_TODO's "tier 1" is 4.5M -- already past that threshold by the
   doc's own numbers, so I wrote the comment around "whichever `nlist` you actually rebuilt
   with," not a tier label, to avoid asserting something the source docs don't agree on
   themselves).
3. **Sidecar + `/health`**: `flush()` now writes `nprobe` into `.meta.json` alongside the
   already-present `index_factory`. `/health/vector`'s top-level response gained `"nprobe"`
   (the configured value, next to the already-present `"index_factory"`); `_collection_health`
   gained `index_factory_on_disk`/`nprobe_on_disk` read from each collection's meta, parallel to
   the existing `ntotal_on_disk` — comparing configured-vs-on-disk for either is now possible
   from one endpoint. (T5a is what will actually *enforce* the `index_factory` comparison at
   load time; this task's ask was only to surface it.)

**Verify.** The task's own manual snippet (`IVF64,PQ4np`, raw FAISS, no scoped selector) → `ok:
20 hits, 0 leaked`. Running the task's literal
`FAISS_INDEX_FACTORY="IVF64,PQ4np" pytest tests/test_tenant_isolation.py` reproduces a *different*
bug, not this one: `_train`'s existing guard requires >= `nlist` vectors in the first `add()`
call, and these fixtures' test documents are one or two chunks each -- nowhere near IVF64's 64.
That is T9's problem ("no code path can currently train an IVF index"), not T5's, and fixing it
here would be doing T9's job out of order. Instead added
`TestTenantIsolationUnderAnIVFIndex` (4 tests) to `test_tenant_isolation.py`: its `setUp` builds
a real `IVF16,PQ4np` index (`nlist=16` for a fast test, `PQ4`'s own per-subquantizer clustering
still needs >= 256 training points regardless of `nlist` -- learned by hitting that exact error
first) and pre-trains it directly with a synthetic 300-vector batch at ids far outside anything
the test's real documents allocate (dropped silently by `Retriever._hydrate` if ever surfaced,
since they have no chunk row) -- enough to get the index into a searchable state without
touching T9's actual bulk-build machinery at all. Then: search doesn't raise on a real IVF index
(the literal bug -- confirmed failing on the pre-fix code via `git stash`, `TypeError` this time
since old `VectorIndexRegistry.__init__` doesn't even accept `nprobe`, but failing either way
proves the test isn't vacuous); cross-tenant isolation and public/private separation both hold
under IVF; and a mock on `index.index.search` (the raw FAISS object) confirms the *configured*
`nprobe` (16) is the value actually reaching FAISS, not just "search doesn't crash." `pytest
tests/ -q` → 149 passed, 9 skipped, 0 failed (up from T4b's 145 -- these 4).

---

### - [x] T5a. Refuse to load an index whose factory is not the configured one

**Why.** After T5 makes `FAISS_INDEX_FACTORY` usable, the next thing an operator does is
change it. Nothing checks that the change took effect, and the failure is silent in the
direction that costs you the most: you believe you are running the compressed production
index, and you are running the tier-1 Flat one.

**The bug.** `VectorIndex.load()` in `backend/rag/core/vector_index.py:170-196` reads an
existing file with `faiss.read_index(str(self.path))` and never compares it to
`self.index_factory`. `self.index_factory` is consulted **only** by `_new_index()`, on the
path where no file exists. `_verify_meta()` — which exists precisely to catch this class of
drift, and does it properly for the embedding signature — checks `signature` and nothing
else, even though `flush()` writes `index_factory` into the same sidecar three lines away.

So: set `FAISS_INDEX_FACTORY=OPQ64,IVF32768,PQ64`, restart, get no error, no warning, and a
Flat index. And the reverse — restoring a compressed index onto a host configured for `Flat`
— is equally quiet.

**Files.** `backend/rag/core/vector_index.py`.

**Change.**
1. Extend `_verify_meta()` to compare the sidecar's `index_factory` against the configured
   one and raise the same shape of error it already raises for a signature mismatch, naming
   `rebuild_index.py` as the way to act on it.
2. When the sidecar predates this field, warn rather than raise — an older index has no
   recorded factory and refusing to boot on it would be worse than the drift.
3. Log the loaded factory alongside the existing "Loaded FAISS index %s (%d vectors, dim %d)"
   line, so the running configuration is visible in the journal without a health call.
4. Surface it in `/health/rag` (T20).

**Verify.**
```bash
cd backend && .venv/bin/python -m pytest tests/test_rag_stack.py -q
```
Add a test: build an index under one factory, reopen it under another, assert it raises.

**Done when.** Changing `FAISS_INDEX_FACTORY` without rebuilding is a refused start, not a
silent no-op.

**Result.** All four Change items done, in `_verify_meta()` right alongside the existing
signature check (same shape: compare, raise naming `rebuild_index.py`, mention the older-sidecar
escape hatch).

1. Compares `meta.get("index_factory")` against `self.index_factory` (the configured value);
   raises `RuntimeError` naming `rebuild_index.py` on a mismatch, in the same voice as the
   existing embedding-signature check right above it.
2. A sidecar with no `index_factory` key at all (predates T5, which is what first started
   writing it) logs a warning instead of raising -- nothing to compare against, and refusing to
   boot on every pre-existing index the moment this code ships would be strictly worse than the
   drift it's trying to catch.
3. The existing "Loaded FAISS index..." log line now includes the factory.
4. Already surfaced in `/health/vector` by T5 (`index_factory_on_disk` alongside the configured
   `index_factory`) -- there is no separate `/health/rag` endpoint in this tree (T20 is the task
   that would introduce or rename one); `/health/vector` is what T5's own Change item 4 pointed
   at, and now doubles as the surface this item asks for too.

**Verify.** Added two tests to `TestVectorIndex` in `test_rag_stack.py`:
`test_refuses_an_index_built_by_a_different_factory` (build under `Flat`, reopen configured for
`OPQ4_32,IVF16,PQ4np`, assert `RuntimeError`) and
`test_an_index_predating_the_recorded_factory_warns_but_still_loads` (strip `index_factory` from
a real sidecar by hand, confirm it still loads rather than refusing). `pytest
tests/test_rag_stack.py -q -k "factory or predating"` → 2 passed. Full suite: `pytest tests/ -q`
→ 151 passed, 9 skipped, 0 failed (up from T5's 149 -- these 2).

---

### - [x] T6. Over-fetch before hydration

**Why.** `Retriever.search` in `backend/rag/app/retrieval/retriever.py` passes the caller's
`top_k` (10) straight to FAISS. PQ distances are approximate, so the true top-10 is reliably
*inside* the top-100 but not reliably at the top of it. Under `Flat` this is harmless; the
moment the index is compressed it silently costs recall, compounding with T5.
`FAISS_ARCHITECTURE.md` §5 specifies over-fetching 100–300 and doing the final ordering on
hydrated rows.

**Files.** `backend/rag/app/retrieval/retriever.py`, `backend/rag/core/config.py`,
`backend/.env.example`.

**Change.** Add `retrieval_overfetch: int` to `RagConfig` (`RETRIEVAL_OVERFETCH`, default
10, meaning "fetch 10× top_k"), clamped to a sensible ceiling. Search FAISS for
`min(top_k * overfetch, ceiling)`, hydrate those rows, re-sort by score, and return the
first `top_k`. Apply it in **both** `search()` and `search_corpus()` — they are separate
code paths.

**Verify.** Add a test that indexes documents with known ideal ranking under a PQ factory
and asserts recall@10 against an exact `Flat` index over the same vectors is materially
better with over-fetch on than off.

**Done when.** Both retrieval paths over-fetch, and the recall test passes.

**Result.** Implemented as specified, plus one finding from building the recall test that
changes what the over-fetch is actually buying you today.

1. **`rag/core/config.py`.** Added `retrieval_overfetch: int` (`RETRIEVAL_OVERFETCH`, default
   10), validated `> 0` in `validate()` alongside the other positive-int fields. Added
   `RagConfig.overfetch_k(top_k)` — `min(top_k * retrieval_overfetch, max(_RETRIEVAL_OVERFETCH_CEILING,
   top_k))`, ceiling `300` (the widest figure in `FAISS_ARCHITECTURE.md` §5's tier table) — as
   the one place the clamp and the multiplier live, rather than duplicating the arithmetic in
   both retrieval paths. `max(ceiling, top_k)` matters: a plain `min(top_k*overfetch, ceiling)`
   would hand back *fewer* than `top_k` candidates for any caller asking for more than the
   ceiling itself, which is the opposite of over-fetching.
2. **`rag/app/retrieval/retriever.py`.** Both `search()` and `search_corpus()` now compute
   `fetch_k = services.config.overfetch_k(top_k)` and pass that to
   `services.indexes.global_index().search(...)` instead of `top_k` directly, then slice the
   hydrated, re-sorted result to `[:top_k]`. `_hydrate()` now sorts its output by score
   descending before returning, with a docstring explaining why: harmless when FAISS's own
   order already holds (the common case), and load-bearing the moment a caller merges hits
   from more than one search — which is exactly what **T7**'s lexical fusion will do.
3. **`.env.example`**: `RETRIEVAL_OVERFETCH=10` added next to `FAISS_NPROBE`, documented.

**The finding.** Before writing the recall test, verified empirically (not just by reading
FAISS's source) what over-fetching-then-truncating actually changes: for a single
`IndexIVFPQ.search` call with fixed `nprobe`, asking for `k=100` and keeping the first 10 by
score returns **exactly** the same ids, in the same order, as asking for `k=10` directly —
confirmed by comparing both against a real `IVF32,PQ8` index, byte-identical top-10 every
time. This isn't a quirk of the test corpus: FAISS selects the top-k by the same
already-scored candidate pool (everything in the `nprobe` probed lists) regardless of `k`, so
truncating a larger request to the same size as a direct request cannot reorder anything —
there is nothing downstream re-scoring the candidates against a more accurate signal, since
hydration here fetches chunk *text*, never a vector. So `FAISS_ARCHITECTURE.md` §5's framing
("PQ distances are approximate... the final ordering is done on hydrated rows") describes a
benefit this codebase does not yet realize for a lone dense search — it requires either a real
re-ranking step against exact vectors (not implemented, and out of this task's file list) or,
more immediately, **T7**'s fusion of two independently-ranked lanes, where a bigger candidate
pool from each lane genuinely does change which ids survive into the fused top-10.

What over-fetching *does* already buy, independent of T7 and verified by the test below: slack
for `_hydrate` to drop candidates whose chunk row is missing (index ahead of SQLite — the
scenario its own docstring names: T2a's pre-fix backup race, a document deleted after being
indexed, an interrupted rebuild) and still return a full `top_k`. A fetch capped at exactly
`top_k` has no room to make up a drop; a fetch of `top_k * overfetch` does.

**Verify.** `cd backend && .venv/bin/python -m pytest tests/test_rag_stack.py -q` → 69 passed
(68 pre-existing plus this task's one new test). New `TestRetrievalOverfetch` builds a real
`IVF16,PQ16x4fs`-factory index (400 synthetic unit vectors, dim 32, over `RagStackTestCase`'s
real SQLite + FAISS stack — chosen over a slower, higher-fidelity PQ factory so this stays a
unit test: confirmed separately, and noted above, that factory choice doesn't change the
mechanism under test), deletes the chunk rows behind half of them (simulating index-ahead-of-
database drift), and for 40 queries compares recall@10 — against the exact ranking restricted
to *surviving* vectors, the best any implementation could return — between a fetch capped at
`top_k` and a fetch of `services.config.overfetch_k(top_k)`. Asserts the over-fetched recall
exceeds the capped recall by more than 0.2 on average; stable across 5 consecutive runs
(observed ~0.45-0.50 capped vs ~0.85-0.90 over-fetched). Full suite: `pytest tests/ -q` → 152
passed, 9 skipped, 0 failed (up from T5a's 151 -- this one test). Stable under `-p no:randomly`;
`test_user_documents.py` alone still 44 passed.

---

### - [x] T7. Add the lexical (BM25/FTS5) retrieval lane

**Why.** Retrieval today is dense-only — `grep -rn 'fts5\|MATCH\|bm25'` across `backend/`
and `app/api/lib/` returns nothing. Dense 1024-dim embeddings are at their worst on exactly
the queries lawyers issue: `"2019 SCC OnLine SC 1234"`, `"Section 138 NI Act"`, a party
name, a case number. Those are lexical lookups, and a nearest-neighbour search over a
semantic space answers them badly and confidently. This is also a hard prerequisite for
**T14** (the two-lane corpus), so it has become load-bearing rather than a nice-to-have.

**Files.** `backend/rag/core/sqlite_store.py`, `backend/rag/app/retrieval/retriever.py`.

**Change.**
1. Add an FTS5 virtual table over `chunk_text`, contentless
   (`content='chunks', content_rowid=...`) so the text is not stored twice, with triggers
   keeping it in sync on insert/update/delete.
2. Add `search_lexical(query, scope, k)` to the retriever, applying the **same** owner
   scoping in SQL — never narrow in Python after an unscoped fetch.
3. Fuse dense and lexical results with reciprocal rank fusion (`1/(60+rank)` is the standard
   constant) before hydration.
4. Backfill the FTS index for existing rows in a migration step, resumably. Once **T16**
   step 2 lands, the backfill reads from the decompressed document blob — FTS5 indexes plain
   text and cannot read a compressed column.

**How far this scales.** FTS5 is the right answer at tiers 1–2 and it costs no new
dependency, no new process and no second thing to back up, which is the whole reason to
start here. It is **unproven at tier 4**: roughly 1 TB of index, one writer, and an
`optimize` merge over that is long and single-threaded. Do not pre-solve it — but do not
paint yourself into it either:

- Keep every caller behind the single `search_lexical(query, scope, k)` interface above.
  That is what makes the engine swappable (Tantivy, Lucene) without touching retrieval,
  fusion or the tenancy scoping.
- At tier 2, record three numbers under **Result**: index size against corpus size, wall
  time for a full `optimize`, and whether ingest ever stalls behind an FTS write. Those are
  the symptoms that would justify moving off FTS5, and measuring them beats guessing now.

**Verify.**
```bash
cd backend && .venv/bin/python -m pytest tests/test_rag_stack.py tests/test_tenant_isolation.py -q
```
Add a test that an exact citation string present in exactly one chunk is returned rank-1 by
the fused search, and that lexical search respects owner scoping (an owner must never see
another owner's chunk via FTS).

**Done when.** Citation and section-number queries return the right document at rank 1,
tenant isolation holds on the lexical path too, and no caller reaches FTS5 except through
`search_lexical`.

**Result.**

1. **`rag/core/sqlite_store.py`**: added `chunks_fts`, a contentless external-content FTS5
   table over `chunks.chunk_text` (`content='chunks', content_rowid='rowid'`, `unicode61`
   tokenizer), to `_SCHEMA_TABLES` (`CREATE VIRTUAL TABLE IF NOT EXISTS`, so both a fresh
   database and an existing v3 one get it, idempotently, on every boot -- consistent with how
   `_SCHEMA_INDEXES`/`_TRIGGERS` already apply unconditionally rather than through a version
   bump). Three sync triggers (`chunks_fts_insert`/`_delete`/`_update`) keep it in step with
   `chunks` going forward, added to `_TRIGGERS` following the file's own
   DROP-then-CREATE-on-every-boot idiom. `initialize()` now also catches
   `sqlite3.OperationalError: no such module: fts5` and raises a clear `RuntimeError` naming
   the fix, matching the existing SQLite-version check's style, rather than a confusing failure
   the first time a chunk is written.
2. **Resumable backfill** (`SqliteStore._backfill_fts`), called at the end of every
   `initialize()`. The sync triggers only cover writes from here on; rows written before this
   feature landed need their text pulled into `chunks_fts` separately. Batched (2000 rows) with
   progress checkpointed to a `meta` key holding the highest chunk `rowid` already indexed --
   deliberately *not* done inside the single-transaction migration pattern the rest of this file
   uses for schema changes, because that pattern is atomic-restart-from-scratch, not resumable
   from a partial batch, and re-scanning a multi-million-row table from zero on every crash near
   the end is a real cost the task's "resumably" is asking to avoid. Cheap once caught up: a
   single indexed `rowid > ?` scan returning nothing. Also handles a race the task doesn't
   mention: the API and the ingest worker both call `initialize()` at their own startup, and on
   a fresh deploy could both start backfilling the same pre-existing corpus at once -- the
   second writer's batch would collide on `chunks_fts`'s rowid uniqueness. Caught as
   `sqlite3.DatabaseError` and retried from a freshly re-read watermark rather than crashing
   that process's boot.
3. **`SqliteStore.search_lexical(query, scope, limit)`** (new): the only method that queries
   `chunks_fts`. Takes the identical `SearchFilter` `Retriever._scope_for` already resolves for
   the dense path and renders it as a `chunks.faiss_id` predicate (`_scope_sql`) in the *same*
   query as the `MATCH`, joined on `chunks_fts.rowid = chunks.rowid` -- one resolved allow-list,
   applied identically by both lanes, never a second independently-written filter that could
   drift from the one FAISS enforces, and never an unscoped fetch narrowed in Python afterwards.
   Returns `(faiss_id, score)` with `score = -bm25()` so "higher is better" holds across both
   lanes, matching the cosine-similarity convention the dense path already documents. Query text
   goes through `_fts_match_expression`, which quotes each whitespace-separated token
   individually (doubling internal `"`) so citation punctuation (`/`, `:`, `(`, `)`, `-`) reads
   as literal text rather than FTS5 query syntax (column filters, `NOT`, unbalanced parens) --
   with a try/except around the query itself as defense in depth, logging and returning `[]` for
   that lane alone on anything that still gets through.
4. **`rag/app/retrieval/retriever.py`**: `Retriever.search()` (and `search_corpus()`, which has
   the same shape) now runs both lanes -- the existing FAISS call, plus
   `services.metadata.search_lexical(query, scope, fetch_k)` on the same `scope` -- and merges
   them with reciprocal rank fusion (`_reciprocal_rank_fusion`, `1/(60+rank)`, summed per id
   across whichever list(s) it appears in) before `_hydrate`, exactly as that method's existing
   docstring already anticipated. This is what makes citation ranking the *default* behaviour of
   `search`/`search_public`/`search_owned`/`search_corpus`, not an opt-in second endpoint nobody
   calls. Also added a standalone `Retriever.search_lexical(...)`, mirroring `search()`'s
   owner_id/top_k/include_public/collection/document_id signature (`scope` itself stays an
   internal concept built by `_scope_for`, as it already was for the dense path) -- useful on its
   own and is what a test can call to check the lexical lane in isolation from fusion.
5. **Backfilling from a compressed blob (Change item 4's second half)**: not done. T16 step 2
   (moving chunk text to a compressed/offset representation) has not landed on this tree --
   `chunks.chunk_text` is still plain text -- so there is nothing to decompress yet. The backfill
   reads `chunk_text` directly, and its docstring flags that this will need revisiting once T16
   lands, as the task anticipates.
6. **"How far this scales" tier-2 measurements**: not recorded. There is no tier-2 (30
   lakh/45M-chunk) corpus in this sandbox to measure index-size-vs-corpus-size, a full
   `optimize` wall time, or ingest-stall-behind-an-FTS-write against -- these need a real
   deployment and are left for whoever runs one.

**Verify.**
```
cd backend && .venv/bin/python -m pytest tests/test_rag_stack.py tests/test_tenant_isolation.py -q
```
→ 109 passed (up from T6's baseline; 14 new: `TestLexicalSearch` (7, `SqliteStore.search_lexical`
and `_backfill_fts` directly -- exact-citation rank-1, owner scoping, empty-allow-list-returns-
nothing, FTS5-operator-character tolerance, backfill-from-scratch, backfill-resumes-from-a-
watermark-without-duplicating, chunk-deletion-removes-it-from-the-index), `TestLexicalFusion` (3,
through `Retriever` -- fused `search()` and standalone `search_lexical()` both rank an exact
citation first, fusion doesn't bypass tenant scoping), `TestLexicalRetrievalIsolation` (4, the
security property stated in "Done when" -- an owner can never reach another owner's chunk via
FTS, an empty allow-list returns nothing rather than widening, public lexical search never
returns private documents, and the fused default `search()` holds the same boundary as the
lexical lane alone). Full suite: `pytest tests/ -q` → 166 passed, 9 skipped, 0 failed (up from
152 at T6 -- 14 new, matching the count above). Stable across 3 consecutive runs and under
`-p no:randomly`; `test_user_documents.py`
run alone still 44 passed. Confirmed separately: this system's `sqlite3` has FTS5 compiled in
(`CREATE VIRTUAL TABLE ... USING fts5` succeeds against `:memory:`), so the missing-module guard
in item 1 above is exercised only by its own code path, not by this environment.

---

# Phase 2 — Make ingestion survive scale

### - [x] T8. Raise `FAISS_FLUSH_EVERY` off 1

**Why.** Every `add()` triggers a full `faiss.write_index`. At tier 2 that is 3.7 GB written
per document; at tier 3, 37 GB per document. Ingesting *n* documents writes O(*n*²) bytes —
loading 30 lakh documents at the current setting is on the order of a petabyte of pointless
writes, and a wear problem on consumer-class NVMe.

**Files.** `backend/.env.example` (line ~101), `backend/rag/core/config.py`,
`backend/rag/core/vector_index.py`.

**Change.** Make the threshold **adaptive**, not a new constant. The counter
(`_unflushed`, `vector_index.py:261`) already counts *vectors*, so it is proportional to new
data — but the flush *cost* is not. `flush()` rewrites the whole file, so it is `O(ntotal)`
regardless of how much is new. A fixed 1000 is therefore right at tier 1 and far too small
at tier 3, where it writes ~37 GB per 4 MB of new vectors — an amplification of roughly
9,000×.

1. Flush when `_unflushed >= max(FAISS_FLUSH_EVERY, ntotal // 100)` — a floor for small
   indexes, and 1% of the index once it is large, so write amplification stays bounded at
   ~100× instead of growing without limit.
2. Keep an explicit ceiling (`FAISS_FLUSH_MAX`, default 100,000) so the crash window stays
   bounded no matter how big the index gets.
3. Default `FAISS_FLUSH_EVERY` to `1000` as the floor, and document the trade in
   `.env.example`: an unclean shutdown loses at most the current threshold's worth of
   vectors from the index file, and the index is reconstructible from SQLite via
   `rebuild_index.py` (which T1 made safe). The ingest worker already calls `flush_all()` at
   the end of each batch, and the API's shutdown hook flushes, so the exposure is only a
   hard kill.

**Verify.**
```bash
cd backend && .venv/bin/python -m pytest tests/test_rag_stack.py -q
```
Add two tests: ingesting N documents writes the index file far fewer than N times (count
`st_mtime` changes or patch `faiss.write_index`); and the effective threshold rises with
`ntotal` while never exceeding `FAISS_FLUSH_MAX`.

**Done when.** Ingest no longer rewrites the whole index per document, and bytes written per
vector ingested does not grow as the corpus grows.

**Result.** Implemented as an adaptive threshold, matching the corrected guidance in the
review-round appendix rather than a new byte-based knob.

1. **`rag/core/vector_index.py`**: `VectorIndex` gained a `flush_max` constructor param
   (default `100_000`), stored as `self._flush_max = max(self._flush_every, flush_max)` — never
   below the floor, so a caller-supplied `flush_every` above the default ceiling is never
   lowered by it. `rebuild_index.py`'s staging index passes `flush_every=10**9` as a "never
   auto-flush, flush once explicitly at the end" sentinel, and that had to keep working
   unchanged. New method `_effective_flush_threshold()` returns
   `max(self._flush_every, min(self._index.ntotal // 100, self._flush_max))` — the cap only
   bounds how far the `ntotal // 100` term can push the threshold *up*; it never pulls the
   floor down. `_maybe_flush()` now compares `_unflushed` against this instead of the raw
   `_flush_every`. `VectorIndexRegistry` gained the matching `flush_max` param and threads it
   into every `VectorIndex` it constructs.
2. **`rag/core/config.py`**: new `faiss_flush_max: int` field, `FAISS_FLUSH_MAX` env var
   (default `100_000`). `FAISS_FLUSH_EVERY`'s default raised from `1` to `1000`, per the Change
   section. `validate()` gained `FAISS_FLUSH_EVERY must be > 0` and
   `FAISS_FLUSH_MAX must be >= FAISS_FLUSH_EVERY`.
3. **`rag/core/services.py`**: `build_services()` threads `flush_max=config.faiss_flush_max`
   into `VectorIndexRegistry` alongside the existing `flush_every`.
4. **`.env.example`**: `FAISS_FLUSH_EVERY` default raised to `1000` with the trade documented
   (unclean shutdown loses at most the effective threshold's worth of vectors; always
   reconstructible via `rebuild_index.py`); new `FAISS_FLUSH_MAX=100000` documented as the
   ceiling.
5. **Test fallout, not in the task's Files list.** Raising the production default off `1`
   broke three existing tests that ingest one or two documents directly through
   `IngestionPipeline` (bypassing `ingest_worker.py`'s explicit `flush_all()`) and then assert
   on-disk state: `TestBackups::test_backup_captures_all_three_stores`,
   `TestBackups::test_a_backup_does_not_rewind_vectors_added_while_it_runs`,
   `TestBackups::test_a_stale_snapshot_is_not_written_even_if_told_to_flush`, plus
   `test_tenant_isolation.py::TestPublicPrivatePartition::test_one_physical_index_holds_every_tenant`
   — a handful of chunks never reaches a threshold of 1000, so no `.faiss` file exists on disk
   at all for these tests to inspect. Both files' `_config()` test helpers now pin
   `FAISS_FLUSH_EVERY=1`, matching the synchronous-flush behavior every other test in these
   files already assumes; `TestVectorIndex`'s new tests below override this per-call to
   exercise the adaptive behavior itself.

**Verify.** Added two tests to `TestVectorIndex` in `test_rag_stack.py`:
`test_bulk_ingest_writes_the_index_file_far_fewer_times_than_it_adds` (a registry with
`flush_every=50, flush_max=1000`; 300 single-vector adds, `faiss.write_index` call-counted via
mock — under 30 writes for 300 adds, and a reopened index still shows `ntotal == 300`, i.e.
nothing was lost between flushes) and
`test_effective_flush_threshold_rises_with_ntotal_but_caps_at_flush_max` (drives
`_effective_flush_threshold()` directly against a fake `.ntotal` at three sizes — floor wins
small, `ntotal // 100` wins mid-range, `flush_max` caps it large — plus the
`rebuild_index.py`-shaped sentinel case, confirming `flush_every=10**9` survives the cap
untouched). `pytest tests/test_rag_stack.py -q` → 81 passed. Full suite:
`pytest tests/ -q` → 168 passed, 9 skipped, 0 failed (up from T4a's 144 — T4b through T7 were
already implemented and ticked off on this tree by the time this task started, accounting for
the rest of the increase; this task's own two new tests are the last +2). Stable under
`-p no:randomly`.

---

### - [x] T9. Build the bulk train-and-add path for compressed indexes

**Why.** No code path can currently train an IVF index, so the compressed factory that all
the sizing in `FAISS_ARCHITECTURE.md` assumes cannot be built at all.

**The bug.** `VectorIndex._train` is called from `add()` with only the current batch and
raises unless that batch alone holds `nlist` vectors. `rebuild_index.py` — whose docstring
names "first build of a compressed (IVF/PQ) index, which must be trained in bulk" as a
reason to run it — calls `staging.add()` once per `batch_size` chunks, defaulting to
`EMBED_BATCH_SIZE` = **8**. So the first `add` hits `_train` with 8 vectors against an
`nlist` of 8,192 and raises. `faiss_train_threshold` exists in `RagConfig` and is read by
nothing.

**Files.** new `backend/rag/scripts/build_index.py`, `backend/rag/core/vector_index.py`,
`backend/rag/scripts/rebuild_index.py`.

**Change.** Implement `FAISS_ARCHITECTURE.md` §9 steps 2–5 as a separate offline script:
1. **embed** every chunk to a memory-mapped float32 file alongside its `faiss_id`. This file
   is the checkpoint — a killed run resumes from it without re-embedding.
2. **train** — sample ~100×`nlist` vectors from the mmap (this is what `faiss_train_threshold`
   should govern), train OPQ + IVF + PQ, and persist the trained-but-empty index before
   adding anything.
3. **add** — stream the mmap in 1 M-vector batches via `add_with_ids`.
4. **flush** once at the end and record the embedding signature.

Also fix `rebuild_index.py`'s pagination while you are here: it uses
`ORDER BY faiss_id LIMIT 512 OFFSET n`, which re-walks *n* rows per page and degrades as the
run proceeds. Use keyset pagination — `WHERE faiss_id > ? ORDER BY faiss_id LIMIT 512`.

**Verify.**
```bash
cd backend && FAISS_INDEX_FACTORY="OPQ8_16,IVF64,PQ8" EMBED_MODEL=deterministic-test \
  .venv/bin/python -m rag.scripts.build_index --collection lexvert --yes
.venv/bin/python rag/scripts/verify_rag.py
```

**Done when.** A compressed index builds end to end on a test corpus, and a killed run
resumes from the mmap without re-embedding.

**Result.** Implemented as a new script plus one small, deliberately narrow addition to
`VectorIndex` rather than reusing its existing (buggy, T9a's job) `add()`-triggered
`_train()` path.

1. **`rag/core/vector_index.py`**: added a public `VectorIndex.train(vectors)`. `add()`'s
   existing implicit train-on-first-batch stays exactly as buggy as the audit found it
   (T9a fixes that guard separately) — this is a distinct, explicit "train on this sample,
   now" entry point for a bulk builder that must train *before* any `add()`, on a sample it
   assembled itself, not on whatever batch happened to arrive first. A no-op if the index is
   already trained, so `build_index.py` can call it unconditionally regardless of factory.
2. **new `rag/scripts/build_index.py`**, implementing FAISS_ARCHITECTURE.md §9 steps 2-5:
   - **`Checkpoint`**: two memory-mapped arrays (`vectors.f32`, `ids.i64`) plus a
     `progress.json` sidecar recording `total`/`dimension`/`signature`/`collections`/`done`.
     `append()` flushes both mmaps *then* rewrites `progress.json`, so a crash between the
     two never has the sidecar claim rows that aren't actually on disk. `open()` resumes
     only when every one of those four fields matches the current run; any mismatch (corpus
     size changed, model/dim changed, different `--collection` set) discards the stale
     checkpoint and starts over rather than resuming into data that no longer means what its
     filename says.
   - **`_embed`**: keyset-paginated (`WHERE faiss_id > ? ORDER BY faiss_id LIMIT ?`) reads
     from SQLite, embeds each page, appends to the checkpoint. This is what makes step 2
     resumable: a kill anywhere in this loop leaves `progress.json` at the last fully-written
     page, and a restart's `open()` continues the SQL cursor from `checkpoint.last_faiss_id`
     instead of re-embedding anything already on disk.
   - **`_train`**: resolves the real IVF sub-index with `faiss.extract_index_ivf` (already
     proven inside this file, in `_build_params`, to see through `IndexIDMap2`/OPQ's
     `IndexPreTransform` wrapping — unlike the `self.index.index` attribute lookup T9a's bug
     report shows is broken) to read the factory's actual `nlist`, then samples
     `min(available, max(FAISS_TRAIN_THRESHOLD, 39*nlist))` vectors — this is what makes
     `FAISS_TRAIN_THRESHOLD` "read by nothing" no longer true, per the bug report. Below
     `nlist` available, refuses with `BuildRefused` naming the shortfall instead of reaching
     FAISS's own `Clustering.cpp` assertion. A factory needing training with no IVF component
     (bare PQ/OPQ) trains on everything embedded, since there's no `nlist` to size a sample
     against.
   - **`_add`**: streams the checkpoint into the now-trained staging index in
     `--add-batch-size` chunks (default 1,000,000, per §9 step 4).
   - **`build_collections`**: orchestrates embed → (train + flush-while-empty, per §9 step 3's
     "persist the trained-but-empty index before adding anything") → add → flush → swap.
     Reuses `rebuild_index.py`'s `_swap`/`_existing_ntotal` and both its data-loss guards
     (an omitted logical collection that still has chunks; a zero-row result against an
     already non-empty live index) under a distinct `BuildRefused` exception — one physical
     index sits behind both logical collections here exactly as it does for
     `rebuild_index.py`, so the same two ways to silently drop live vectors apply.
   - `main()` mirrors `rebuild_index.py`'s CLI shape (`--collection`/`--all`/`--yes`/`--force`,
     signature-adopt-then-`startup()`, confirmation prompt, `indexes.close()` before
     building so shutdown doesn't flush the stale in-memory index back over the built one).
3. **`rag/scripts/rebuild_index.py`**: fixed the OFFSET pagination per the Change list —
   `ORDER BY faiss_id LIMIT ? OFFSET n` re-walks `n` rows every page and was already flagged
   as degrading across a run; replaced with the same keyset form `build_index.py` uses
   (`WHERE faiss_id > ? ORDER BY faiss_id LIMIT ?`). Also corrected the module docstring,
   which named "first build of a compressed (IVF/PQ) index" as a reason to run this script —
   untrue both before and after this task: `rebuild_collections` always builds into a
   *fresh, untrained* staging index and adds in `--batch-size` (default 8) chunks at a time,
   so it hits the exact training-batch-too-small failure T9's bug report describes for *any*
   compressed-factory run, not just a first build. The docstring now says so and points at
   `build_index.py` instead of claiming this script covers that case.

**Verify.** New `TestBuildIndex` (8 tests) in `test_rag_stack.py`: a real `IVF16,PQ16x4fs`
factory trains on 700 chunks and indexes all of them; a simulated kill 3 embed batches in
(`FETCH_SIZE` patched to 50) leaves a partial, valid checkpoint, and a resumed run makes
exactly the number of further `embed_documents()` calls the remaining rows require (not the
whole corpus again) and still lands at the full count, trained; a `Flat` factory (already
"trained" on construction) needs no sample at all; zero chunks builds an empty index cleanly;
zero chunks against an already non-empty live index is refused (`BuildRefused`) without
touching it; omitting a populated logical collection is refused; too few chunks to clear the
configured `nlist` is refused with "training vectors" in the message rather than reaching a
raw FAISS assertion; and `FAISS_TRAIN_THRESHOLD` is confirmed to actually govern the sample
size passed to `VectorIndex.train` (spied via `mock.patch.object`), capped at what's available.
`pytest tests/test_rag_stack.py -q -k TestBuildIndex` → 8 passed. Full suite:
`pytest tests/ -q` → 176 passed, 9 skipped, 0 failed (up from T8's 168 — the 8 new tests).
Stable under `-p no:randomly`; `test_user_documents.py` alone still 44 passed.

Also ran the task's exact Verify commands end to end, against a temp `DATA_ROOT` seeded with
3,000 chunks (a corpus has to already exist for "trains end to end" to mean anything — an
empty one hits T9a's still-open bug on the very next ordinary `add()`, which is a different,
already-documented problem, not this one):
```
FAISS_INDEX_FACTORY="OPQ8_16,IVF64,PQ8" EMBED_MODEL=deterministic-test EMBED_DIM=32 \
  .venv/bin/python -m rag.scripts.build_index --collection lexvert --yes
.venv/bin/python rag/scripts/verify_rag.py
```
First command: `added 3000/3000 vectors`, `built 3000 vector(s)` — FAISS logs its own
"please provide at least 9984 training points" warning (3,000 available vectors is below what
OPQ's internal clustering wants, real production corpora clear this easily), but does **not**
raise, which is the actual regression check: the pre-fix bug is `Clustering.cpp`'s hard
assertion on too few points *relative to `nlist`* (64 here), and 3,000 clears that. Second
command: `[PASS] all checks passed` end to end (ingest, retrieval, dedup, cleanup) against the
now-compressed index. Noticed in passing, not fixed (out of scope, not in this task's Files,
and present identically before this task): `services.py::_report_index_drift` logs a spurious
"Index drift ... SQLite has 0 chunks, FAISS has 3000 vectors" on every startup once the index
is non-empty, because it compares `stats(collection="owllex")` (the *physical* name) against
`indexes.get("owllex").ntotal`, but `chunks.collection` only ever holds the *logical* names
(`lexvert`/`lexvert_user`) — the count is always 0 on the SQLite side regardless of actual
drift. Cosmetic only: `verify_rag.py`'s own numeric check (`faiss=3001, sqlite=3001`) is
computed correctly and passed.

---

### - [x] T9a. Fix the dead `nlist` guard in `VectorIndex._train`

**Why.** A correction to the audit, and it matters because the guard is the thing that was
supposed to make T9's failure mode legible. The audit states that `_train` "raises unless
that batch alone holds `nlist` vectors". It does not. The guard **never fires**, for any
factory, and what an operator actually gets is a FAISS assertion from `Clustering.cpp`.

**The bug.** `backend/rag/core/vector_index.py:278-295`:

```python
needed = max(1, getattr(self.index.index, "nlist", 1))
```

`self.index` is an `IndexIDMap2`; `.index` returns the wrapped index through SWIG as the
**base `faiss::Index` pointer**, which has no `nlist` attribute regardless of what it really
is. Verified against the faiss 1.15.0 in `backend/.venv`:

```
IVF8192,PQ64      | type: Index | has nlist: False | getattr(nlist, 1) = 1
OPQ64,IVF8192,PQ64| type: Index | has nlist: False | getattr(nlist, 1) = 1
IVF8192,Flat      | type: Index | has nlist: False | getattr(nlist, 1) = 1
```

`needed` is always `1`, so `vectors.shape[0] < needed` is never true and the carefully
worded error — "must be trained on at least N vectors ... Build it in bulk with
rag/scripts/rebuild_index.py, or set FAISS_INDEX_FACTORY=Flat" — is unreachable code. The
first `add()` of 8 vectors calls `self.index.train(v)` and FAISS raises instead:

```
RuntimeError: Error in void faiss::Clustering::train_encoded(...) at Clustering.cpp:66:
Error: 'nx >= static_cast<idx_t>(k)' failed: Number of training points (8)
should be at least as large as number of clusters (256)
```

Which names neither the setting that caused it nor the script that fixes it. Worse, FAISS
only *asserts* when `nx < k`; between `nlist` and `39 * nlist` training points it merely
warns and produces a degenerate quantizer — so a batch size that happens to clear `nlist`
trains a bad index without raising at all.

**Files.** `backend/rag/core/vector_index.py`.

**Change.**
1. Resolve the real index before reading `nlist`:
   ```python
   inner = faiss.downcast_index(self.index.index)
   needed = getattr(inner, "nlist", 0)
   ```
   `faiss.downcast_index` returns the concrete `IndexIVFFlat` / `IndexPreTransform`; for a
   pre-transform, downcast again through `.index` to reach the IVF. Confirmed working:
   `downcast_index(idx.index)` → `IndexIVFFlat`, `nlist: 4`.
2. Require FAISS's own recommended minimum, not the bare minimum: raise unless the batch
   holds at least `39 * nlist` vectors, which is the threshold below which FAISS warns.
3. Keep the error message — it is the right message, it just needs to be reachable.

**Verify.**
```bash
cd backend && .venv/bin/python -m pytest tests/test_rag_stack.py -q
```
Add a test asserting that `add()` on an untrained `IVF...` index with a small batch raises
`RuntimeError` **with `rebuild_index.py` in the message**, not a `Clustering.cpp` assertion.

**Done when.** An operator who sets a compressed factory without running the bulk build gets
told exactly that, by us, on the first insert.

**Result.** Used `faiss.extract_index_ivf` rather than the task's suggested
`faiss.downcast_index`, since `_build_params` (a few methods down in the same file, T5's
`nprobe` work) already established that exact helper for the identical problem -- finding the
real IVF index through any wrapping (`IndexIDMap2`, OPQ's `IndexPreTransform`) -- and it also
returns `None`-equivalent (raises `RuntimeError`) for a factory with no IVF component at all,
which `downcast_index` alone would not have handled without extra recursion. Reusing it keeps
one way of doing this in the file instead of two.

1. `rag/core/vector_index.py`: added a module-level `MIN_TRAINING_VECTORS_PER_CENTROID = 39`,
   duplicated (with a cross-referencing comment) from the identical constant already in
   `rag/scripts/build_index.py` rather than imported -- core must not depend on scripts, and
   the two constants enforce the same FAISS fact at two different layers (this one guards the
   implicit per-`add()` path; that one guards the explicit bulk-build path, which permits down
   to bare `nlist` since an operator running it in bulk sees the log line regardless).
2. `_train` now resolves `ivf = faiss.extract_index_ivf(self.index)` (`None` on `RuntimeError`,
   i.e. no IVF component -- plain PQ/OPQ), and sets `needed = 39 * ivf.nlist` when an IVF
   component exists, else `1`. Kept the exact wording of the pre-existing error message (Change
   item 3) -- it already named `rebuild_index.py` and `FAISS_INDEX_FACTORY=Flat`, it just needed
   to be reachable.
3. Confirmed against the tree's live `faiss` build: `extract_index_ivf` on an `IVF16,Flat`
   `IndexIDMap2` returns the wrapped `IndexIVFFlat` with `nlist == 16`; on `PQ4np` (no IVF) it
   raises `RuntimeError`, correctly falling back to `needed = 1` rather than blocking a factory
   the guard has nothing to size itself against.

**Fallout from fixing a guard that used to be dead code.** Two existing tests turned out to
depend on the old bug -- they trained an IVF16 index on batches sized to clear bare `nlist`
(16) or PQ's own unrelated 256-training-point minimum, both now below the corrected 39x16=624
floor:
- `tests/test_tenant_isolation.py::TestTenantIsolationUnderAnIVFIndex.setUp` pre-trained on 300
  synthetic vectors "whichever [of nlist or PQ's 256] is larger" -- raised to 650 and the
  comment corrected to say the 624 figure from this task's fix is now the larger, binding one.
- `tests/test_rag_stack.py::TestRetrievalOverfetch::test_overfetch_recovers_recall_lost_to_missing_chunk_rows`
  seeded `n=400` against the same `IVF16,PQ16x4fs` factory -- raised to 650, with the comment
  updated from "the factory needs >= nlist vectors" to the corrected 39x figure. Not a change in
  what either test asserts, only in how large a batch it needs to reach that untrained-add path
  without hitting this task's now-live guard.

**Verify.** Added four tests to `TestVectorIndex` in `test_rag_stack.py` against a real
`IVF16,Flat` factory: a 5-vector batch is refused with `rebuild_index.py` in the message and
**not** a raw `Clustering.cpp` assertion (the literal pre-fix failure mode, reproduced first to
confirm, then fixed); a 20-vector batch (clears `nlist`=16, not 39x16=624) is still refused,
which is the corrected part of the guard the audit got wrong; a 700-vector batch trains and
indexes successfully; and (removed from the final diff, kept here as a note since it's a real
FAISS fact worth recording) a plain non-IVF `PQ4np` factory does **not** fall back to training
on a 5-vector batch the way this task's Change item implies it should be allowed to -- FAISS's
own PQ sub-quantizer clustering hard-errors below 256 training points independently of `nlist`,
so `extract_index_ivf` returning `None` correctly skips *this* guard but does not make every
batch size safe for *every* non-IVF factory; that is a separate, pre-existing FAISS constraint
this task was never scoped to add a guard for, so the test asserting a 5-vector PQ4np batch
should succeed was deleted rather than weakened to expect failure, since asserting failure
there would be testing FAISS's behavior, not this codebase's.

`.venv/bin/python -m pytest tests/test_rag_stack.py -q -k TestVectorIndex` → 14 passed.
`tests/test_tenant_isolation.py -q -k TestTenantIsolationUnderAnIVFIndex` → 4 passed. Full
suite: `pytest tests/ -q` → 179 passed, 9 skipped, 0 failed, net +3 over this task's own diff (4
new `TestVectorIndex` tests, one written and then deleted per the note above) -- the tree had
already accumulated tests from T5 through T9 landing between T4a's Result and this one, so 179
is not comparable to T4a's 144 one-for-one. Stable under `-p no:randomly`.

---

### - [ ] T9b. Retrain the quantizer when the corpus composition drifts

**Why.** A compressed index is trained **once**, on the corpus as it existed that day. The
coarse quantizer's centroids and the PQ codebooks both encode that distribution. Owllex's
corpus does not arrive all at once — it grows *court by court*: SCI first, then 25 High
Courts, then the district layer. Each new source is a new region of embedding space that the
existing centroids do not cover, and nothing currently notices.

**What actually goes wrong.** Not fragmentation. FAISS's `remove_ids` genuinely compacts an
IVF index — verified on faiss 1.15.0: deleting half of 4,000 vectors took `sum(list_size)`
from 4,000 to 2,000 and shrank the written file from 578,360 to 290,360 bytes. There are no
tombstones to reclaim and the file does not bloat.

The real failure is **list imbalance from drift**. Training on one distribution and then
adding another collapses the newcomers into whichever handful of lists happen to be nearest:

```
after initial train+add            max/mean= 1.08  empty=0  max=674
after adding a new distribution    max/mean=11.55  empty=0  max=14440
```

14,440 of 40,000 vectors in a single list. That is two-sided and both sides are silent:

- A query landing on the overfull list scans a large fraction of the corpus — latency blows
  past the 25 ms budget in `FAISS_ARCHITECTURE.md` §6 at a fixed `nprobe`.
- A query landing anywhere else misses the new court's documents entirely, because they are
  all in a list `nprobe` never probes. Recall for the newest, most relevant material is
  worst.

**Depends on.** T9 (there must be a bulk train path to retrain *with*).

**Files.** `backend/rag/core/vector_index.py`, `backend/app/health_routes.py`,
`backend/rag/scripts/build_index.py`.

**Change.**
1. Record `trained_at_ntotal` and the training sample's date range in the `.meta.json`
   sidecar at build time.
2. Expose two drift signals, computed from `invlists.list_size(i)` across `nlist`:
   **`max/mean` list-size ratio** and **vectors added since training**, as a fraction of
   `trained_at_ntotal`. Trigger on *these*, not on a deleted-vector percentage — deletion is
   not the mechanism.
3. Surface both in `/health/rag` (T20) with thresholds: warn at `max/mean > 3` or +50%
   vectors since training; degraded at `max/mean > 10` or +200%.
4. Document the response in the runbook (T21): a retrain is the T9 bulk path re-run from the
   existing mmap vector file, so it costs **no re-embedding** — with T14's dense lane at
   ~80 lakh documents that is ~167 GPU-hours on the T10 offline box. Budget it as an
   occasional line item, not an emergency.

**Verify.**
```bash
cd backend && .venv/bin/python -m pytest tests/test_rag_stack.py -q
```
Add a test that builds an IVF index on one distribution, adds a shifted one, and asserts the
health check reports drift. Record the observed `max/mean` under **Result** after the first
real High Court ingest — that is the first time this can be measured on live data.

**Done when.** Quantizer drift is a number on the health endpoint with a documented
threshold and a documented response, rather than a slow silent decline in recall.

**Result.**

---

### - [ ] T10. Move bulk embedding off the serving box

**Why.** `EMBED_DEVICE=auto` resolves to `cpu` on a GPU-less VPS. A 0.6B model over a
500-token chunk is ~600 GFLOPs; fifteen chunks is ~9 TFLOPs; a 16-core VPS sustains maybe
200 GFLOPS on this workload — about 45 seconds of embedding per document, before Docling's
layout models and OCR (seconds to minutes per page) are counted. At roughly one document per
minute, 10 lakh documents is about two years. `FAISS_ARCHITECTURE.md` §9 says it plainly:
*"CPU-only indexing is not viable at any tier past the first."*

**Files.** `backend/rag/scripts/build_index.py` (from T9), `backend/deploy/README.md`.

**Change.**
1. Make `build_index.py` runnable on a rented GPU box against a copy of the SQLite database,
   producing the mmap vector file and the built index as artifacts to copy back.
2. Document the round trip in `backend/deploy/README.md`: which files to ship out
   (`chunks.db`), which to ship back (`owllex.faiss`, `owllex.meta.json`), and the
   signature check that refuses a mismatched index at boot.
3. Keep query embedding on the VPS — that is 80 ms with the 0.6B model and is fine.

**Verify.** Document and run a dry run end to end on a small corpus, timing it. Record
observed chunks/second under **Result** so the tier-3 estimate can be re-derived from real
numbers rather than the planning assumption.

**Done when.** Bulk embedding runs off-box and the resulting index loads and serves on the
VPS.

**Result.**

---

### - [ ] T11. Decouple the scraper from the serving API

**Why.** `ingestIntoKnowledgeBase` in `sci-judgments/download.ts` POSTs each PDF to
`/api/v1/rag/ingest` and awaits it. With one gunicorn worker and a 300-second timeout, a
single slow OCR blocks every user query for the duration — while a human sits at a CAPTCHA
window waiting on it.

**Files.** `backend/rag/scrapping/sources/sci-judgments/download.ts`.

**Change.** Replace the HTTP ingest call with a write into `$INBOX_ROOT` (under a
court-named subdirectory, e.g. `inbox/sci/`, which `ingest_worker.py` already reads as a
court hint). `owllex-ingest.service` drains it asynchronously. This also completes the
single-writer model from **T2**.

**Verify.** Run the scraper against a fixture, confirm files land in `$INBOX_ROOT/sci/`, and
confirm `owllex-ingest.service` picks them up and the documents become searchable.

**Done when.** A scrape run never calls the serving API, and query latency is unaffected by
an ingest in progress.

**Result.**

---

### - [ ] T11a. Stop the ingest worker rescanning the whole inbox every pass

**Why.** T11 makes the inbox the only way documents enter the corpus, which makes the inbox
scan a hot path. It is currently O(everything in the tree), every 30 seconds.

**The bug.** `_pending_files()` in `backend/rag/scripts/ingest_worker.py` does
`inbox.rglob("*")` and materialises every entry into a list, then sorts it by mtime — on
every pass. At the tier-2 target that is a full recursive walk plus a `stat` per file, every
`--interval` seconds. Once the inbox holds a large drop, the worker spends most of its wall
clock enumerating files rather than ingesting them, and the cost grows with the backlog —
so the queue drains slowest exactly when it is fullest.

Two smaller things in the same function's neighbourhood:

- `_drain` flushes FAISS only at the **end of a pass**, and the default `--batch 0` means a
  pass is unbounded. Combined with T8 raising `FAISS_FLUSH_EVERY` off 1, a worker killed
  during a multi-day pass loses every vector since the last flush. Recoverable by rebuild,
  but it should not be a rebuild.
- `SUPPORTED_SUFFIXES` includes `.txt` and `.md`, and the docstring warns that operator notes
  dropped in the inbox will be indexed as documents. That is a footgun in a directory whose
  whole purpose is "copy things here".

**Files.** `backend/rag/scripts/ingest_worker.py`.

**Change.**
1. Bound the scan: stop enumerating once `batch` candidates are found (make `--batch`
   default to something finite, e.g. 500), and iterate `os.scandir` lazily instead of
   building the full list. Oldest-first ordering can be kept per-directory rather than
   globally — the point was fairness, not a total order.
2. Flush every N documents inside `_drain`, not only at the end of the pass. N in the same
   config as `FAISS_FLUSH_EVERY`.
3. Skip a top-level `notes/` (or any directory named in a `.ingestignore`) so operator files
   have somewhere safe to live.

**Verify.**
```bash
cd backend && .venv/bin/python -m rag.scripts.ingest_worker --once --inbox /tmp/inbox-bench
```
Populate `/tmp/inbox-bench` with 100k empty files and time a single pass before and after.
The time to *start* ingesting the first document must not grow with the size of the backlog.

**Done when.** Pass startup cost is independent of how many files are waiting, and a killed
worker loses at most N documents' vectors.

**Result.**

---

# Phase 3 — Make acquisition work from the VPS

### - [ ] T12. Let the scraper run headless-with-a-display on the VPS

**Why.** `sci-judgments/download.ts:75` calls `chromium.launch({ headless: false })`, which
throws on a VPS with no X display — so the scraper cannot run on the server at all today.
Paired with `waitForSelector(..., { timeout: 0 })` on the next line, a variant that did get a
window would wait forever holding a Chromium process, and that path is reachable from the
admin panel where there is no terminal attached.

**Files.** `backend/deploy/README.md`, new `backend/deploy/scrape-session.sh`,
`backend/rag/scrapping/sources/sci-judgments/download.ts`, root `package.json`.

**Change.**
1. Add a documented Xvfb + noVNC session script:
   ```bash
   Xvfb :99 -screen 0 1920x1080x24 &
   DISPLAY=:99 x11vnc -rfbport 5900 -localhost -forever &
   websockify --web=/usr/share/novnc 127.0.0.1:6080 127.0.0.1:5900 &
   DISPLAY=:99 npx tsx rag/scrapping/sources/sci-judgments/download.ts "$@"
   ```
   Both listeners bind `127.0.0.1` only; the operator reaches them over
   `ssh -L 6080:127.0.0.1:6080`. **Never expose 5900 or 6080 publicly** — that is a remote
   desktop on the corpus server.
2. Replace `timeout: 0` with a bounded wait (default 15 minutes, `SCRAPE_SOLVE_TIMEOUT_MS`)
   that exits cleanly and closes the browser.
3. Add the missing npm scripts — `README.md` and `download.ts`'s own header both reference
   `npm run scrape:sci:download`, and no `scrape:*` script exists in `package.json`.

**Verify.** On the VPS: start the session script, tunnel in, confirm the SCI page renders in
the browser, solve the CAPTCHA, and confirm PDFs download to `$INBOX_ROOT/sci/`.

**Done when.** A full scrape session runs on the VPS, driven from a laptop over an SSH
tunnel, with no code changes needed per run.

**Result.**

---

### - [ ] T13. Measure documents-per-CAPTCHA before planning any backfill

**Why.** This single number decides whether the corpus target is reachable. At ~300
documents per solved session and ~60 seconds per session, 10 crore documents is **5,550
human hours** — 3.8 years at four hours every single day. Human-in-the-loop acquisition
realistically reaches two to three crore. If a session can be stretched to 2,000 documents by
widening the date range before submitting, the human cost drops 6× and 3 crore becomes a
couple of months. Everything about the acquisition roadmap depends on which of those is
true, and it is currently a guess.

**Files.** none — this is measurement. Record the result in this file.

**Change.** Run three real SCI sessions via T12. For each, record: documents retrieved
before the session expired or the result set was exhausted, wall-clock human time, and
whether widening the date range increased the yield.

**Verify.** Three data points recorded below, with the implied hours for 1 crore and 3 crore
computed from the median.

**Done when.** The numbers are written under **Result** and the corpus target has been
re-confirmed or revised against them.

**Result.**

---

### - [ ] T14. Split the corpus into a dense lane and a lexical lane

**Why.** Embedding all 1.5 B chunks is 2,080 GPU-hours (~€2,100–3,100) and 120 GB of index
carried forever. Value is not uniformly distributed: SC and HC substantive judgments are
~80 lakh documents, while the district-court layer that takes the corpus from 3 crore to 10
is overwhelmingly procedural daily orders ("List on 12.03.2026"). Those have **lookup**
value, not **semantic** value — nobody asks a vector index a conceptual question hoping to
retrieve an adjournment slip. Routing them to the lexical lane cuts the one-time embedding
bill to ~€150–250 and the index from 120 GB to 10 GB.

**Depends on.** T7 (the lexical lane must exist first).

**Files.** `backend/rag/app/ingest/pipeline.py`, `backend/rag/core/sqlite_store.py`,
`backend/rag/core/config.py`.

**Route on court first, length last.** A single length threshold is the obvious design and
it is wrong in the expensive direction: a 1,800-character constitutional order and a
2,800-character three-page High Court judgment both fall under any sensible cut-off, and
both belong in the dense lane. Length correlates with value only *within* a court.

Everything needed is already available for free at `pipeline.py:208`, where
`extract_metadata` runs before the embed step at :232 — `metadata.court`, `len(pages)` and
the full `document_text`. Apply in order, first match wins:

| # | Signal | Rule |
|---|---|---|
| 1 | `metadata.court` | Supreme Court or any High Court → **dense**, whatever the length |
| 2 | `len(pages)` | more than `DENSE_LANE_MIN_PAGES` (start at 3) → **dense** |
| 3 | phrases | contains `Held`, `Coram`, `Reasoning`, `It is ordered` → **dense** |
| 4 | length | `len(document_text)` ≥ `DENSE_LANE_MIN_CHARS` (start at 4,000) → **dense** |
| 5 | default | → **lexical** |

Keep it rules-based and in config. It is deliberately **not** a trained classifier: step 4
of the change list makes a wrong call recoverable by promoting the document later, and a
model would add a training set, a versioning problem and an explainability problem to a
decision that a lookup table already gets right.

**Change.**
1. Add a `lane` column to `documents` (`dense` | `lexical`), defaulting to `dense`, plus a
   `lane_reason` column recording which rule above fired — without it, a mis-routed corpus
   is undiagnosable after the fact.
2. Route at ingest by the table above. Lexical-lane documents are **not** embedded.
3. Both lanes are indexed in FTS5; only the dense lane gets vectors.
4. Make promotion possible: a script that moves a document from lexical to dense by
   embedding it, so a wrong rule is recoverable without re-ingesting.

**Verify.** Ingest a mixed fixture set and assert short procedural orders get no vectors,
are still returned by citation search, and that promotion works. Include the three cases the
length-only rule gets wrong — a 1,800-char constitutional order, a 2,800-char three-page HC
judgment, and a 900-char procedural order — and assert the first two land dense.

**Done when.** Lane routing works, is configurable, records why it decided, and is
reversible. Report the dense/lexical split and the `lane_reason` histogram over the first
real batch under **Result** — a split far from the ~80 lakh dense estimate means the rules
need tuning before the GPU spend in T10.

**Result.**

---

# Phase 4 — Storage and cost

### - [ ] T15. Confirm the hardware decision before the corpus grows

**Why.** This is the largest number in the system and it is a procurement decision, not an
engineering one. A Hetzner Cloud Volume is **€0.044/GB/month = €44/TB**. The 10-crore corpus
needs ~29 TB, so €1,276/month — on a platform where a dedicated SX65 (64 GB RAM, 2×1 TB
NVMe, 4×22 TB HDD) is about €184/month, carrying the same corpus with room to spare. That is
roughly €13,000/year. It bites well before tier 4: at 30 lakh documents (0.9 TB) the volume
costs €40/month, about the price of a whole AX41-NVMe dedicated server.

**Files.** `backend/deploy/README.md`.

**Change.** Decide and record. If moving to dedicated hardware:
- SQLite, LMDB and **the FAISS index** on the NVMe pair in RAID1. FAISS on NVMe (not HDD as
  the current layout says) is what makes T17 possible.
- PDFs on the HDDs in **RAID6, not RAID5** — a 22 TB drive rebuild across a 66 TB array is
  long enough that a second failure during it is a real risk.
- Check the Hetzner auction market first; SX-class hardware routinely lists 30–50% below
  list price.

Verify current prices before committing — the figures above are list prices from September
2026 and they move.

**Verify.** The decision, the chosen SKU, and the actual monthly figure are recorded in
`backend/deploy/README.md`.

**Done when.** The target hardware is written down and, if it is changing, a migration date
is set.

**Result.**

---

### - [ ] T16. Stop storing chunk text: compress, then move to offsets

**Why.** `chunk_text` is stored uncompressed and is ~3.3 TB at tier 4 — about 90% of the
NVMe requirement. Two things are wrong with it, and they are worth fixing in that order.

First, it is uncompressed. Legal English in 2 KB blocks compresses 4–6× under zstd with a
trained dictionary: ~3.3 TB down to roughly 600 GB, for a decompress on the ten rows
hydrated per query — microseconds against a 25 ms scan.

Second, and this is what compression alone cannot fix, **the text is stored twice over**.
`CHUNK_SIZE=2000` with `CHUNK_OVERLAP=200` means every chunk repeats 10% of its neighbour,
so the overlap alone is ~330 GB of pure duplication at tier 4, and each chunk row carries
~2.2 KB of text it does not uniquely own. Storing one blob per document and addressing
chunks into it removes the duplication instead of compressing it.

The third argument is the one that decides it, and it is not about disk at all: **offsets
make re-chunking free.** Today, changing `CHUNK_SIZE` means re-running Docling over the
whole corpus — at tier 3 that is weeks of OCR. With the extracted text kept per document,
re-chunking is a pass over blobs you already have: a config change and an embed, with no
re-extraction. `FAISS_ARCHITECTURE.md` §11 step 3 proposes moving chunk text to a second
SQLite file on the HDD instead; that keeps both problems and moves the hydration read off
NVMe.

**Files.** `backend/rag/core/sqlite_store.py`, `backend/rag/app/ingest/pipeline.py`,
new migration script.

**Change — two steps, and stopping after step 1 is a legitimate outcome.**

*Step 1 — compress in place (interim).* Store `chunk_text` as a zstd-compressed blob with a
dictionary trained on a corpus sample. Persist the dictionary in the `meta` table — without
it the data is unreadable, so it must also be in the backup set (T2a). Decompress in
`chunks_by_faiss_ids`. Resumable migration for existing rows. This is cheap, reversible, and
gets ~80% of the disk win.

*Step 2 — offsets (target).* Add a `document_text` table holding one zstd-compressed
extracted-text blob per document. Chunk rows become `(document_id, start_offset, length)` —
~2.2 KB down to ~40 bytes each — and hydration decompresses the document blob (cached; the
ten hits of a query are usually few documents) and slices. Net at tier 4: **~3.3 TB to under
700 GB**, which is what makes the SX65's two 1 TB NVMe drives in T15 sufficient.

Either way, keep the FTS5 index (T7) over the *uncompressed* text — FTS5 indexes plain text
and cannot read a compressed column, so its backfill must read through the decompression
path. It is contentless, so it does not duplicate storage.

**Verify.** Migrate a test database, assert round-trip fidelity on **every** row (byte-exact
`chunk_text` before and after, including the overlap regions), measure the size reduction,
and re-run `tests/test_rag_stack.py tests/test_tenant_isolation.py`. After step 2, also
assert that re-chunking at a different `CHUNK_SIZE` reproduces the same text without calling
the loader.

**Done when.** Chunk text round-trips exactly and the database is materially smaller. Record
the observed ratio, and which step you stopped at, under **Result**.

**Result.**

---

### - [ ] T17. Memory-map the FAISS index

**Why.** `FAISS_ARCHITECTURE.md` §6 budgets 124 GB resident at tier 4 and provisions a
256 GB machine, on an unstated assumption that PQ codes must live in RAM. They need not.
With `faiss.read_index(path, faiss.IO_FLAG_MMAP)` and `OnDiskInvertedLists`, only probed
lists are touched: at tier 4, `nlist` 262,144 gives ~5,700 vectors per list ≈ 410 KB, so
`nprobe` 96 reads ~39 MB per query — about 25 ms on NVMe, inside a query already spending
80 ms on the embedding model. Resident memory falls to the coarse quantizer (2.3 GB), the
OPQ matrix and the model (1.2 GB): **16–32 GB instead of 124**, and hot lists stay in page
cache anyway.

**The hazard: T2 and T17 are each correct and fatal together.** T2 makes the ingest worker
the sole writer. T17 makes the API read the index by mmap. Both are right. Combined, the API
**never sees another document again**.

`flush()` writes a temp file and `os.replace`s it over `owllex.faiss`. Rename swaps the
inode; it does not touch a mapping already established against the old one. So the API's
mmap keeps serving the file as it was at open. Reproduced on faiss 1.15.0:

```
reader ntotal at open:        2000
on-disk ntotal now:           3000
reader ntotal after replace:  2000   <- stale
reader can it see new id 5001?  False
```

Silent, permanent until restart, and invisible to every check in T20 that reads through the
same handle. It gets worse with T2 rather than better: before T2 the API wrote its own
vectors and saw them; after T2 it only reads. Do not land T17 without the reload path below.

**Depends on.** T9 (a compressed index must exist), T15 (the index must be on NVMe — 96
random 410 KB reads on a spinning disk is about a second per query), T2 (which creates the
hazard above).

**Files.** `backend/rag/core/vector_index.py`, `backend/rag/core/config.py`,
`backend/.env.example`.

**Change.**
1. Add `FAISS_MMAP` (default off until tier 2). When on, pass `IO_FLAG_MMAP` to
   `read_index`.
2. **Add a reload path.** `flush()` already writes the `.meta.json` sidecar; add a
   monotonic `generation` field and bump it on every flush. Readers `stat` the sidecar on a
   short interval (or before a search, if the `stat` proves cheap enough), and when the
   generation changes, open the new index and swap the handle in under the existing
   `self._lock`. Keep the old handle alive until in-flight searches finish — dropping a
   mapping out from under a running search reads freed memory.
3. Keep the writer guard, and say why in the comment: it is **per-process, not a global
   ban**. The worker writes and does not mmap; the API mmaps and does not write; the backup
   (T2a) opens read-only. That split is the design, and the guard is what enforces it.
4. Note in `.env.example` that the writer must run with it off, and that a reader without
   the reload path will silently freeze.

**Verify.** Load a compressed index both ways, assert identical top-10 results for a fixed
query set, and compare RSS. Then the regression that matters:

```bash
cd backend && .venv/bin/python - <<'PY'
# open a reader with IO_FLAG_MMAP, flush new vectors from a writer,
# assert the reader returns the new ids within one reload interval
PY
```

**Done when.** Search results are identical under mmap, resident memory drops, and a vector
flushed by the worker is visible to the mmapped API without a restart. Record the RSS
before/after and the observed reload latency under **Result**.

**Result.**

---

### - [ ] T18. Tune SQLite for the target size

**Why.** Only `journal_mode=WAL` and `synchronous=NORMAL` are set
(`backend/rag/core/sqlite_store.py:459–460`). The default 4 KB page against 2 KB chunk rows
is close to worst case for the hydration read, and `page_size` **cannot be changed after
tables are created** without a full `VACUUM` — so this must land before the database grows.

**Files.** `backend/rag/core/sqlite_store.py`.

**Change.** Set `PRAGMA page_size = 8192` **before** the first `CREATE TABLE` (and only
then), plus `mmap_size` (a few GB) and a `cache_size` in the gigabytes, both configurable.
For an existing database, ship a `VACUUM`-based migration and document the downtime.

**Verify.**
```bash
cd backend && .venv/bin/python -c "
from rag.core.services import build_services
s=build_services(); s.metadata.initialize()
for p in ('page_size','mmap_size','cache_size','journal_mode'):
    print(p, s.metadata.connection.execute(f'PRAGMA {p}').fetchone()[0])"
```

**Done when.** A freshly created database reports the intended pragmas.

**Result.**

---

# Phase 5 — Deploy without reading the code

Everything above is a fix. This phase is what makes deployment *reliable*.

### - [ ] T19. Align config defaults with the architecture

**Why.** `backend/rag/core/config.py` defaults `EMBED_MODEL` to `qwen3-embedding-8b`, which
`FAISS_ARCHITECTURE.md` §1 explains is a ~2.5-second-per-query choice, while `.env.example`
correctly sets `qwen3-embedding-0.6b`. So a host with an incomplete `.env`, a test run, or a
container built without one silently gets the wrong model. The systemd unit's 16 GB RAM
comment describes that same model the deployment should not be running. `FAISS_INDEX_FACTORY`
defaults to `Flat`, which is right for tier 1 but wrong to inherit silently at tier 2+.

Separately, `backend/app/config.py` and `backend/rag/core/config.py` are two config systems:
`compress.py` reads `UPLOAD_DIR` from the former (derived from `DATA_ROOT`) while everything
around it derives from the two tiers. And the systemd units hardcode `HF_HOME=/data/models`,
which does not exist on the split host `.env.example` describes — model weights would land on
the system disk.

**Files.** `backend/rag/core/config.py`, `backend/app/config.py`,
`backend/deploy/systemd/*.service`.

**Change.**
1. Default `EMBED_MODEL` to `qwen3-embedding-0.6b`, matching `.env.example` and the design.
2. Make `app/config.py::UPLOAD_DIR` derive from `rag/core/config.py`'s HDD tier.
3. Set `HF_HOME` from `$HDD_DATA_ROOT/models` in the units rather than hardcoding `/data`.
4. Log the resolved model, factory, `nprobe`, both tier roots and `storage_is_split` at
   startup, at INFO.

**Verify.** Boot with a minimal `.env` (only the four required variables) and confirm the
startup log reports the intended defaults.

**Done when.** A host with a minimal `.env` runs the intended configuration.

**Result.**

---

### - [ ] T19a. Bound the rate limiter, and stop returning raw exceptions to callers

**Why.** Two small defects in the request path that only show up after the service has been
up for a while, which is to say in production and not in testing.

**Bug A — the rate limiter never forgets an IP.** `backend/app/main.py:43`:

```python
_request_buckets = defaultdict(deque)
```

Entries are trimmed *within* a bucket, but the outer dict is never swept: every distinct
client IP that has ever reached the process keeps a `deque` forever. In a `Restart=always`
unit that is expected to run for months behind a public nginx, that is an unbounded, purely
adversary-controlled allocation — a few million probing source addresses is a few hundred MB
of dead entries on a box already sized to the gigabyte in T17/T20.

Two related notes while you are in there: the limiter is per-process, so it means something
different the moment `--workers` is ever raised above 1; and it duplicates nginx's
`limit_req zone=owllex_api` (`deploy/nginx/owllex.conf:148`), which is the layer that can
actually see the connection. Decide which one is authoritative and say so in a comment.

**Bug B — raw exception text in HTTP responses.** `app/rag_routes.py:157-168` returns
`detail=f"Search failed: {exc}"`, and `_services()` returns
`f"RAG storage is unavailable: {exc}"`. Those carry filesystem paths, SQLite messages naming
columns, and FAISS assertions naming source files, out to any caller. The same shape appears
in the ingest and object routes. The log already has the full traceback via
`logger.exception`; the response does not need it.

**Files.** `backend/app/main.py`, `backend/app/rag_routes.py`, `backend/deploy/nginx/owllex.conf`.

**Change.**
1. Sweep `_request_buckets` — evict any bucket whose newest entry is older than the window,
   on a counter (every N requests) or a cap on the dict size with LRU eviction. Cap it
   explicitly rather than relying on the sweep keeping up.
2. Replace the interpolated `detail` strings with a fixed message plus a correlation id that
   also goes into the log line, so an operator can join the two without the client seeing
   internals. Keep the 503 `_MISSING_DEPENDENCIES` text — that one is actionable and names
   no internals.
3. Note in the nginx config which limiter is authoritative.

**Verify.**
```bash
cd backend && .venv/bin/python -m pytest tests/ -q
```
Add a test that drives 10,000 distinct `X-Forwarded-For` values through the middleware and
asserts `len(_request_buckets)` stays bounded, and one asserting a forced 500 body contains
no filesystem path.

**Done when.** Memory does not grow with the number of distinct client IPs seen, and no
500 body carries an internal path or exception string.

**Result.**

---

### - [ ] T20. Make `/health` fail loudly on every condition found in this audit

**Why.** Most failures in this list are silent. Health checks are what convert them into
something an operator sees before a user does.

**Files.** `backend/app/health_routes.py`.

**Change.** `/health/rag` must report, and mark degraded or down on:
- FAISS `ntotal` vs SQLite `chunk_count` drift beyond a threshold (index behind database).
- `index_factory` is IVF but `nprobe` is 1 (T5's silent-recall failure).
- Embedding signature in SQLite vs the configured model (already refused at boot — surface it).
- `storage_is_split` true but a bulk path resolving onto the SSD.
- Free disk on **both** tiers, with a warning threshold.
- Whether the FTS5 index row count matches `chunks` (T7 drift).
- `collection` values present in `chunks` that no code path expects (the T1 class of bug).
- The **loaded** `index_factory` vs the configured one (T5a) — report what is running, not
  what is set.
- Vectors in FAISS with no `chunks` row, and rows with no vector (the T21a orphan count).
  `Retriever._hydrate` already logs "Vector %d has no chunk row"; a count belongs here.
- Whether more than one process currently holds the index write lock (T2/T2a).
- The resolved writability of each configured storage root (T4b), not just its free space.
- `next_public_faiss_id` / `next_private_faiss_id` against `MAX(faiss_id)` in `chunks` — a
  counter behind the table is the T2b double-allocation, visible after the fact.

Fix the existing bug in the same file while you are there: `_collection_health` iterates
`COLLECTIONS` (`"owllex"`), so its chunk counts read zero — the same physical-vs-logical
mix-up as T1.

**Verify.**
```bash
curl -s localhost:8000/health/rag | jq
```
Confirm each condition can be forced into a non-OK status in a test.

**Done when.** Every audit finding that could be silent has a health signal.

**Result.**

---

### - [ ] T21. Write the deploy and recovery runbook

**Why.** This is the task that delivers "deploy without reading the code". Everything else
is a precondition.

**Files.** `backend/deploy/README.md`.

**Change.** Write, and actually execute once, a runbook covering:
1. **First deploy** — mount volumes, `findmnt`/`df` checks, `.env` from `.env.example`,
   `uv sync`, systemd units, nginx, `harden.sh`, first boot, health check.
2. **Routine deploy** — pull, `uv sync`, `systemctl stop owllex-ingest`, restart the API,
   health check, restart ingest. Note the cold start: loading the index and the model takes
   minutes, `TimeoutStartSec=900` exists for that reason, and an orchestrator must not
   restart-loop during it.
3. **Bulk import** — copy into `$INBOX_ROOT/<court>/`, watch it drain, check
   `SELECT status, COUNT(*) FROM documents GROUP BY status`.
4. **Index rebuild** — stop ingest, run the T9 build path, swap, restart, verify. State
   explicitly that only one process may write the index.
5. **Restore from backup** — from `$BACKUP_ROOT/<date>/`, and what to do when only the
   derived state was backed up (re-ingest from `legal_corpus/`).
6. **Scrape session** — the T12 procedure, start to finish.
7. **Rollback** — previous release, and what is safe to roll back (code) versus what is not
   (an index built by a different embedding model).

**Verify.** Execute the first-deploy runbook end to end on a fresh machine or a VM, changing
nothing but what the runbook says. Any step that required reading source is a runbook bug —
fix the runbook.

**Done when.** Someone who has never seen the code can deploy from this document alone.

**Result.**

---

### - [ ] T21a. Serialise schema migration across processes, and reclaim orphaned vectors

**Why.** Two loose ends in the SQLite/FAISS relationship that only bite on a real deployment
with two processes and a history.

**Bug A — concurrent migration on deploy.** `SqliteStore.initialize()` in
`backend/rag/core/sqlite_store.py:488-521` reads `schema_version` **outside** any
transaction, then calls `_migrate(stored)` if it is behind. `owllex-rag` and `owllex-ingest`
both call `startup()`, and a restart after a schema bump starts both at once. Both read the
old version, both run the same migration step. Whichever loses gets whatever the step raises
— `duplicate column name` for an `ALTER TABLE ... ADD COLUMN` — which `initialize()` does not
catch, so the unit fails to start. `Restart=always` then retries it against a database that
is now already migrated, so it usually recovers on the second attempt; on a step that is not
idempotent it will not. This is the same read-then-write shape as T2b, in the same file.

**Bug B — orphaned vectors are never reclaimed.** `delete_corpus_documents` in
`backend/rag/app/retrieval/retriever.py` deletes the SQLite rows first, commits, then calls
`index.remove(freed)`. A crash between the two leaves vectors in FAISS with no row.
`Retriever._hydrate` handles this correctly and safely — it drops them and logs — but they
still occupy slots in the `top_k` FAISS returns, so a search after a partial delete silently
returns **fewer** results than asked for, and nothing reclaims them. Deleting an id twice is
harmless, so a reconciliation pass is straightforward; there just isn't one. This compounds
with T6: until over-fetch lands, one orphan is one lost result.

**Files.** `backend/rag/core/sqlite_store.py`, `backend/rag/app/retrieval/retriever.py`,
new `backend/rag/scripts/reconcile_index.py`.

**Change.**
1. Wrap the version read and the migration in a single `BEGIN IMMEDIATE` transaction so the
   second process blocks on the write lock and then re-reads a current version. Fold this
   into the T2b transaction-discipline pass rather than doing it twice.
2. Make each migration step idempotent anyway (`ADD COLUMN` guarded by a `PRAGMA table_info`
   check), because belt and braces is cheap here and a failed boot is not.
3. Add `rag/scripts/reconcile_index.py`: walk the index ids, diff against
   `SELECT faiss_id FROM chunks`, report both directions, and remove the orphans behind
   `--fix`. This is also the audit script T3 asks for, one level down — same shape.
4. Report the counts in `/health/rag` (T20).

**Verify.**
```bash
cd backend && .venv/bin/python -m rag.scripts.reconcile_index --dry-run
cd backend && .venv/bin/python -m pytest tests/test_rag_stack.py -q
```
Add a test that deletes chunk rows without removing the vectors and asserts the reconciler
finds exactly those ids.

**Done when.** Two processes can start simultaneously against an un-migrated database, and
`reconcile_index --dry-run` reports zero orphans on a healthy corpus.

**Result.**

---

### - [ ] T21b. Stop taking `clerk_uid` from the request body

**Why.** `backend/app/main.py:124-131` states the principle this task applies:

> Both routers authenticate per request rather than inheriting the internal token the RAG
> router uses ... Mounting them under the internal-token dependency instead would make every
> private document readable by anything holding that one shared secret, which is precisely
> the property this split exists to remove.

`/api/v1/rag/corpus/search` and `/api/v1/rag/corpus/delete` still have exactly that property.
They are mounted under `require_internal_token`, and the tenant is a **field in the JSON
body** (`CorpusSearchRequest.clerk_uid`). Anything holding `RAVENSLAW_INTERNAL_TOKEN` can
read or delete any advocate's private corpus by changing one string.

This is not exploitable from a browser today — the token lives only in Next.js route
handlers (`app/api/lib/backendInternalAuth.ts`), and the callers do pass the authenticated
subject (`app/api/ai/draft/route.ts:140` passes `userContext.clerkUid`). So the boundary
holds *because every caller happens to be correct*, across a network hop, in a different
language, with no enforcement. That is the property T21's runbook has to describe honestly,
and it is one forgotten `clerkUid` in a new route handler away from a cross-tenant read.

**Files.** `backend/app/rag_routes.py`, `backend/app/security.py`,
`app/api/lib/corpusBackend.ts`.

**Change.** Pick one, and write down which:
1. *Preferred.* Move the corpus routes onto `require_authenticated_user`, deriving
   `clerk_uid` from the verified Clerk subject exactly as `/api/user-documents` does, and
   have the Next.js layer forward the user's token instead of the internal one. This makes
   the backend enforce the boundary itself, which is what the comment above says the design
   is for. Depends on T4a.
2. *Minimum.* Keep the internal token, but have the Next.js caller sign
   `(clerk_uid, corpus_id, expiry)` and have the backend verify that signature — so the
   tenant is asserted by something the caller cannot vary freely.

Either way, add a regression test that the routes refuse a `clerk_uid` other than the
authenticated one.

**Verify.**
```bash
cd backend && .venv/bin/python -m pytest tests/test_tenant_isolation.py -q
```
Add: authenticate as user A, request corpus search with `clerk_uid` = B, assert 403 and that
zero of B's chunks appear in the response.

**Done when.** The tenant for a corpus search is decided by the backend from a verified
credential, not read out of the request body.

**Result.**

---

### - [ ] T22. Fix the stale scraper docs and the broken test

**Why.** `backend/rag/scrapping/README.md` documents `core/http.ts` (a polite client with
rate limiting and backoff), `core/manifest.ts`, `core/paths.ts`, `core/prompt.ts` and
`sources/hc-judgments/` — **none of which exist**. It also documents `backupToR2()` and R2
snapshots that `MIGRATION.md` declares removed, and tells you to add an
`npm run scrape:<name>` script to a `package.json` that has none (T12 adds them).

The `PoliteClient` absence is substantive, not cosmetic: there is no shared rate limiting or
backoff anywhere, and `download.ts` fetches PDFs in a tight loop against a government site.

`backend/tests/test_scrapping.py` is a spec for a recipe-driven Python scraper
(`curl_import.py`, `models.py`, `store.py`) that was never built; it fails at import with
`ModuleNotFoundError`, so it neither passes nor tests anything that exists.

**Files.** `backend/rag/scrapping/README.md`, `backend/tests/test_scrapping.py`, new
`backend/rag/scrapping/core/http.ts`.

**Change.**
1. Rewrite the README to describe what is actually there, after T4/T11/T12 have landed.
2. Build the missing `PoliteClient`: serialised requests, a configurable delay, exponential
   backoff on 5xx, and a real contact string in the User-Agent so an operator can email
   rather than block. Route the SCI PDF fetches through it.
3. Either delete `test_scrapping.py` or rename it to something that does not look like a
   live test (e.g. `docs/scraper-recipe-spec.md`) — it is currently neither.

**Verify.**
```bash
cd backend && .venv/bin/python -m pytest tests/ -q
```
The whole suite must collect and pass with no import errors.

**Done when.** The full backend test suite is green and the scraper README matches reality.

**Result.**

---

## Appendix — review round, September 2026

A review of this document proposed five modifications and one new task. Each was checked
against the tree at `4b40e0f` and against the faiss 1.15.0 in `backend/.venv` before being
adopted. Four changed the document. Two rested on premises the code contradicts — both are
recorded here rather than in the task blocks, so the corrected guidance reads cleanly and
nobody re-proposes the original.

| Proposed | Verdict | What the check showed | Outcome |
|---|---|---|---|
| **T16** — compress documents, not chunks | Accepted | `CHUNK_SIZE=2000` / `CHUNK_OVERLAP=200` → 10% of all text stored twice; ~330 GB of pure duplication at tier 4 | T16 restructured: compress in place, then move to per-document blobs + offsets |
| **T14** — one 4,000-char threshold is too crude | Accepted | `court` and `len(pages)` are already available at `pipeline.py:208`, before the embed step at :232 — routing on them is free | T14 routes on court first, length last, and records `lane_reason` |
| **T7** — FTS5 will not reach tier 4 | Accepted as a caveat | Unproven either way; migration cost is bounded because the lane sits behind one interface | Scaling note added; no speculative Tantivy/Lucene task |
| **T23** — FAISS needs compaction after deletions | Accepted, mechanism corrected | `remove_ids` **does** compact: `sum(list_size)` 4000→2000 and the file shrank 578,360→290,360 bytes. No tombstones. But drift is real — adding a shifted distribution took list `max/mean` from 1.08 to **11.55**, one list holding 14,440 of 40,000 vectors | Added as **T9b**, triggered on quantizer drift rather than deleted-vector percentage |
| **T8** — flush by bytes, since a document may hold 5 or 200 chunks | Premise incorrect | `_unflushed` (`vector_index.py:261`) already counts **vectors**, not documents. The proposed `min(1000, 128 MB)` reduces to 1000. The real defect is the opposite: 1000 is too *small* at scale, because flush cost is `O(ntotal)` | T8 made adaptive — `max(FAISS_FLUSH_EVERY, ntotal // 100)` with a ceiling |
| **T17** — do not ban mmap in writers; split per process | Misreading | The existing guard is per-process, not a global ban, and already produces the proposed split | **But it surfaced the worst bug of the round:** after `os.replace`, an mmapped reader is permanently stale — reproduced at 2000 vs 3000 vectors. T17 rewritten around a reload path |

The T17 line is the argument for doing review rounds at all: the objection was wrong, and
following it to the code found a silent, permanent failure that neither the original audit
nor this document had caught.

---

## Appendix — documentation map

Removed in this cleanup (all recoverable via `git show HEAD~1:<path>`): superseded
integration and deployment guides (`BACKEND_INTEGRATION.md`, `INTEGRATION_MAP.md`,
`DEPLOYMENT_READINESS.md`, `README_DEPLOYMENT_CHECKLIST.md`, `README_DEPLOYMENT_TODO.md`),
a completed security checklist with zero open items (`README_SECURITY_TODO.md`), a stale
alpha-stage feature list (`MISSING_FEATURES.md`), two completed-work changelogs
(`INVOICE_INTEGRATION.md`, `PERFORMANCE_OPTIMIZATION.md`), two pre-implementation specs for
the now-built cause-list scraper whose file paths no longer match the code
(`PDF_SCRAPER_WORKFLOW.md`, `ADMIN_CAUSELIST_PARSER.md`), and a duplicate of the
subscription roadmap (`ROADMAP_SUBSCRIPTION_QUICK.md`).

What remains, and what each is for:

| File | Status | Purpose |
|---|---|---|
| `PRODUCTION_TODO.md` | **this file** | The implementation list |
| `ENVIRONMENT_SETUP.md` | needs a fix | Env var reference. Still says the backend deploys to Render — correct that in **T21** |
| `ADMIN_ACCESS_SETUP.md` | current | Admin panel access control |
| `MONGO_INDEX_STRATEGY.md` | current | Mongo index maintenance (`npm run audit:indexes`, `db:doctor`) |
| `SECURITY_INCIDENT_PLAYBOOK.md` | current | Incident response |
| `ROADMAP_SUBSCRIPTION_SYSTEM.md` | business | Subscription/pricing plan, not an engineering doc |
| `backend/README.md` | current, **untracked** | Backend overview |
| `backend/MIGRATION.md` | current, **untracked** | What changed in the move off Chroma/R2/OpenAI |
| `backend/deploy/README.md` | current, **untracked** | Deployment — expanded by **T21** |
| `backend/rag/README.md` | current, **untracked** | The deployed RAG stack |
| `backend/rag/FAISS_ARCHITECTURE.md` | current, **untracked** | Design of record for retrieval and sizing |
| `backend/rag/ARCHITECTURE.md` | partly superseded | Metadata schema and chunking rationale still stand; ignore its infrastructure sections |
| `backend/rag/TODO.md` | separate track | Citation resolution, lineage, hybrid metadata — not this list |
| `backend/rag/scrapping/README.md` | stale | Rewritten by **T22** |
| `features/README.md` | minor fix | References a `RESTRUCTURE.md` that does not exist |
