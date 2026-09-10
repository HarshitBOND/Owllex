# Migration: managed services → self-hosted RAG

Replaces Chroma Cloud, OpenAI embeddings and Cloudflare R2 with FAISS, a local
Qwen3 embedding model and a mounted Hetzner volume, on one 32 GB Ubuntu VPS.

**The frontend API surface is unchanged.** Every `/api/v1/rag/*` request and
response shape is preserved except `/status`, which reported Chroma-specific
fields that no longer exist. Breaking changes are listed at the end.

---

## 1. What changed

| Was | Is | Notes |
|---|---|---|
| Chroma Cloud | FAISS, `/data/faiss/*.faiss` | `IndexIDMap2`, incremental insert, ids allocated by SQLite |
| OpenAI `text-embedding-3-small` (1536d) | Qwen3-Embedding-8B, local (1024d default) | No API calls. Every vector must be regenerated |
| Chroma chunk metadata | SQLite `documents` + `chunks` | Adds `court`, `citation`, `page_number`, `status` |
| R2 `raw/<source>/<hash>.pdf` | `/data/documents/<court>/<year>/<hash>.pdf` | SQLite stores the relative path |
| R2 backup of the LMDB index | `/data/backups/<date>/lmdb/` | Nightly, dated, with retention |
| LMDB value = `document_id` | `{document_id, file_path, court}` | Old values still read; migration is a backfill |
| pypdfium + RapidOCR | Docling (fallback retained) | Gives real page boundaries |
| LLM metadata extraction, always | Deterministic parse; LLM opt-in | Court and citation are never model-generated |
| Worker hosts the backend in a container | Worker proxies to the VPS | Container storage is ephemeral — see step 7 |

## 2. Prepare the VPS

```bash
# Mount the Hetzner volume at /data BEFORE anything else.
sudo mkfs.ext4 /dev/disk/by-id/scsi-0HC_Volume_XXXXXXX      # first time only
sudo mkdir -p /data
echo '/dev/disk/by-id/scsi-0HC_Volume_XXXXXXX /data ext4 discard,nofail,defaults 0 0' \
  | sudo tee -a /etc/fstab
sudo mount /data

# Verify it is the volume and not the boot disk. If this says the root
# filesystem, stop -- the corpus would fill the system disk and die with it.
findmnt /data
df -h /data
```

Directories are created by the application on startup; no manual `mkdir` needed.

## 3. Configure

```bash
cd backend
cp .env.example .env
```

Set at minimum `DATA_ROOT=/data`, `RAVENSLAW_INTERNAL_TOKEN`,
`RAVENSLAW_CORS_ORIGINS`, `RAVENSLAW_TRUSTED_HOSTS`. Remove the now-unused
`CHROMA_*` and `R2_*` variables.

On a host with less than ~24 GB free RAM, set `EMBED_MODEL=qwen3-embedding-4b`
(or `-0.6b`) before the first ingest. Changing it later means re-embedding the
whole corpus.

## 4. Install

```bash
uv sync --extra rag --extra embeddings
```

Or `docker compose up -d`, which builds the `ingest` target and bind-mounts
`/data`.

## 5. Move the existing hash index

The LMDB index used to live in the code tree. Copy it onto the volume so the
"already ingested" knowledge survives:

```bash
sudo mkdir -p /data/lmdb/hashdb
sudo cp backend/rag/data/hash_index.lmdb/data.mdb /data/lmdb/hashdb/
```

Then backfill the new value fields (safe to skip; old values still read):

```bash
.venv/bin/python -m rag.scripts.migrate_hash_values --dry-run
.venv/bin/python -m rag.scripts.migrate_hash_values
```

## 6. Re-ingest the corpus

**There is no vector migration path, and there cannot be one.** OpenAI's 1536-d
vectors and Qwen3's are different spaces; a copied vector would return
confidently wrong neighbours. Chroma also stored only chunk text, not the
originals, so `court`, `citation` and `page_number` have to come from the source
documents anyway.

Re-ingest from the PDFs. If they are still in R2, pull them down first:

```bash
rclone copy r2:<bucket>/raw /data/incoming/raw --progress
```

Then feed them through the ingest API (`POST /api/v1/rag/ingest`, one document
per request, `court=` set when the source is known). The pipeline is resumable:
a run that dies mid-corpus re-processes only what never committed, because the
LMDB write is the last step. Progress:

```sql
SELECT status, COUNT(*) FROM documents GROUP BY status;
```

Per-user corpora (`lexvert_user`) re-ingest through
`POST /api/v1/rag/corpus/ingest` from the copies the Next app already stores.

Verify:

```bash
.venv/bin/python rag/scripts/verify_rag.py
.venv/bin/python rag/scripts/verify_rag.py --http
```

## 7. Point the Worker at the VPS

The Worker used to run the backend as a Cloudflare container. That is no longer
viable: container filesystems are ephemeral, so every restart would silently
discard the corpus and come back up healthy and empty.

```bash
cd cloudflare/api-backend
npx wrangler secret put VPS_ORIGIN      # https://api.your-domain.com
npx wrangler deploy
```

With `VPS_ORIGIN` set the Worker becomes a streaming proxy (auth and routing
only). Without it, it keeps the old container behaviour with `DATA_ROOT` pinned
to `/tmp`, so the stateless routes still work and no one mistakes it for durable
storage. Delete the `CHROMA_*` and `R2_*` Worker secrets once the cutover holds.

## 8. Turn on off-host PDF backups

The nightly job covers FAISS, SQLite and LMDB. PDFs are excluded by design —
they are immutable and far too large to duplicate nightly — so they need their
own mirror. **The corpus is not protected until this exists:**

```bash
restic -r sftp:u123456@u123456.your-storagebox.de:/backup backup /data/documents
```

---

## Breaking changes

### 1. `GET /api/v1/rag/status` payload

The only changed response shape. Removed: `openai_key_configured`,
`chroma_configured`, `chroma_database`. Added: `vector_store`, `embed_model`,
`embed_dim`, `storage_ready`, `collections`, `data_root`, `disk_free_bytes`.
`ready`, `dependencies_installed`, `chunk_count`, `document_count`,
`indexed_hashes` and `error` are unchanged. `features/admin/types.ts` and
`RagIngestTab.tsx` are updated to match; any other consumer of these fields
needs the same treatment.

### 2. Similarity scores are inverted

Chroma returned a **distance** (lower is better). FAISS with normalised vectors
returns **cosine similarity** (higher is better, 1.0 is identical). The field is
still `score` and the results are still ordered best-first, so ranking-only
consumers are unaffected — but any absolute threshold or "distance below X"
comparison is now backwards.

### 3. Deleted modules

`rag/hash_db.py`, `rag/app/ingest/vector_db.py`, `rag/app/ingest/storage.py`,
`rag/app/ingest/embedder.py`, `rag/scripts/migrate_hash_lookup.py`.
Replacements: `rag/core/hash_index.py`, `rag/core/vector_index.py`,
`rag/core/document_store.py`, `rag/core/embeddings.py`,
`rag/scripts/migrate_hash_values.py`. `ingest_document()` keeps its signature
and gains an optional `court_hint`.

### 4. `/documents/compress` and `/documents/extract` storage

Files now land under `PRIVATE_ROOT` on the volume instead of the R2 private
bucket. The response still contains `r2_key` (now an alias of the new
`storage_key`) so the wire format is unchanged, and the form field `r2_key` is
still accepted alongside `storage_key`. One status code moved: a
`/documents/compress` call with no key was a FastAPI validation `422` and is now
an explicit `400`, because the field is optional at the schema level so that
either name satisfies it.

### 5. Document serving

`GET /api/documents/view?token=` is unchanged for callers, but now streams from
the backend rather than redirecting to a presigned R2 URL, passing `Range`
through so a PDF viewer can still seek. The presigned fallback for
pre-migration documents is gone along with the bucket: a document with no
archived file is a 404, and an unreachable backend is a 503 rather than a
silently different answer.

### 6. Metadata extraction no longer calls an LLM by default

`title`, `document_type` and `date` come from a deterministic front-matter parse.
Set `METADATA_LLM_ENABLED=true` (and install `--extra metadata-llm`) to restore
the model pass for prose documents where the parse comes back empty. `court` and
`citation` are never model-generated in either mode: they are lookup keys, and a
hallucinated one is worse than an empty one.

### 7. Deployment now requires a mounted volume

The backend is stateful. Any deployment target with an ephemeral filesystem
(Cloudflare containers, Vercel, a plain `docker run` with no volume) will lose
the corpus on restart. `docker-compose.yml` bind-mounts `/data`; the Dockerfile
declares `VOLUME ["/data"]` so an unconfigured `docker run` at least gets a named
volume rather than the container layer.

---

## R2 is gone

**Cloudflare R2 no longer stores anything.** The bucket is out of the request
path entirely; the Worker stays as the authenticated API gateway and nothing
else. `app/api/lib/storage/r2.ts` was replaced by
`app/api/lib/storage/hddStorage.ts`, which keeps the same exported signatures
(`putPrivateObject`, `getPrivateObject`, `headPrivateObject`,
`deletePrivateObject`, `getPrivateSignedUrl`, `putPublicObject`) and backs each
of them with an authenticated call to the backend. That is why removing the
bucket was a change to one module rather than to the fourteen routes that store
and read documents. The `aws4fetch` dependency is dropped.

### Private user documents

New, and the reason for the split in the storage layout:

```
/data/users/<user id>/<category>/<document id>.pdf
```

Categories are a closed set (`contracts`, `affidavits`, `evidence`, `drafts`,
`miscellaneous`). Metadata lives in the SQLite `documents` table, which gained
`owner_id`, `visibility`, `category`, `storage_path`, `original_filename`,
`mime_type` and `file_size` (schema v1 → v2, migrated in place on first boot;
every pre-existing row is public corpus and is backfilled as such).

| Route | Auth | Notes |
|---|---|---|
| `POST /api/user-documents` | Clerk JWT | PDF/DOCX, content-sniffed, quota-checked |
| `GET /api/user-documents` | Clerk JWT | The caller's own documents only |
| `GET /api/user-documents/{id}` | Clerk JWT | 403 unless `owner_id` matches; streams with `Range` |
| `DELETE /api/user-documents/{id}` | Clerk JWT | 403 unless `owner_id` matches |
| `GET /api/documents/{id}` | Clerk JWT **or** internal token | Public corpus only |

These routers authenticate per request rather than inheriting the internal-token
dependency the RAG router uses. Mounting them behind that token instead would
make every private document readable by anything holding one shared secret,
which is exactly what the split exists to prevent.

`storage_path` is never returned by any route. The API's vocabulary is document
ids; a client that could see a path could start guessing at the shape of the
volume.

### Signed URLs are no longer bearer capabilities

R2's presigned URLs worked for whoever held the string, so a link pasted into a
shared chat leaked the document. `getPrivateSignedUrl(key, ttl, boundTo)` now
mints an HMAC that only this app can produce and only `/api/storage/object` can
redeem — and that route re-checks the session on every request, then refuses to
serve a bound URL to any other user. Every call site passes the requesting
user's Clerk uid.

### Migrating the existing objects

`rag/scripts/migrate_r2_documents.py` reads the Mongo rows (or a JSON/JSONL
export), fetches each object over the S3 API or from an `rclone sync` tree,
verifies it against the SHA-256 already on record, and writes it into
`USERS_ROOT` with its SQLite row. Document ids, owners and categories are
preserved. Every run is idempotent — an already-migrated document is counted as
a duplicate and skipped — so an interrupted run is restarted by running it again,
and nothing is ever deleted from R2, which keeps rollback to a redeploy.

```bash
.venv/bin/python -m rag.scripts.migrate_r2_documents --source-dir /mnt/r2-sync --dry-run
.venv/bin/python -m rag.scripts.migrate_r2_documents --source-dir /mnt/r2-sync --report out.json
```

It reports `migrated`, `failed`, `duplicates` and `missing`, and lists every
non-migrated document with its reason. It exits non-zero if anything failed or
went missing, so a deploy script cannot sail past a partial migration.

The vault accepts images and plain text that predate the PDF/DOCX upload rule, so
the migration stores a wider set of types than a new upload may introduce
(`ARCHIVE_TYPES` vs `ALLOWED_UPLOAD_TYPES`). Losing every exhibit photograph to a
policy that arrived after them would be a data loss, not a policy.
