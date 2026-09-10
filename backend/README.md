# Ravenslaw backend

Two services behind one FastAPI app:

- **Cause-list parser** turns Delhi High Court cause list PDFs into structured JSON.
- **RAG stack** ingests and retrieves legal documents, fully self-hosted:
  Docling, a local Qwen3 embedding model, FAISS, SQLite and LMDB on a mounted
  volume. See [`rag/README.md`](rag/README.md) for its architecture and
  [`MIGRATION.md`](MIGRATION.md) for the move off Chroma Cloud / OpenAI / R2.

For running this on a real server -- storage layout, systemd units, nginx,
backups, restore, monitoring and hardening -- see
[`deploy/README.md`](deploy/README.md). A fresh Ubuntu 24.04 box becomes
production-ready with `sudo deploy/deploy.sh`.

## Quick Start

```bash
cd backend

# Parser and API only (creates .venv automatically, pinned to Python 3.11)
uv sync

# ...or with the RAG stack. `embeddings` pulls in torch and is the heavy half;
# omit it on a host that only parses and stores documents.
uv sync --extra rag --extra embeddings

# Copy env config
copy .env.example .env       # Windows
# cp .env.example .env       # Linux/Mac

# Run server
uv run python run.py
```

Requires [uv](https://docs.astral.sh/uv/getting-started/installation/). No manual venv setup needed `uv sync` creates `.venv` and installs the exact locked versions from `uv.lock`.

Server starts at **http://localhost:8000**

- API Docs: http://localhost:8000/docs
- Health Check: http://localhost:8000/health

## API Endpoints

### `POST /api/v1/parse` Parse uploaded PDF

Upload a cause list PDF file and get structured data back.

```bash
curl -X POST http://localhost:8000/api/v1/parse \
  -F "file=@combined_adv_04.02.2026.pdf"
```

**Response:**
```json
{
  "success": true,
  "filename": "combined_adv_04.02.2026.pdf",
  "total_cases": 2016,
  "cases": [
    {
      "list_type": "COMBINED CAUSE LIST",
      "list_date": "04.02.2026",
      "court_no": "01",
      "bench": "DIVISION BENCH",
      "judge": "HON'BLE MR.JUSTICE VIBHU BAKHRU; HON'BLE MR.JUSTICE TUSHAR RAO GEDELA",
      "section": "FOR ADMISSION",
      "item_no": "1",
      "main_case_no": "W.P.(C) 16325/2024",
      "linked_cases": ["CM APPL. 79765/2025"],
      "petitioner": "DR SATENDRA SINGH & ANR.",
      "respondent": "UNION OF INDIA & ORS.",
      "advocate_petitioner": "MAYANK SAPRA",
      "advocate_respondent": "HARISH VAIDYANATHAN SHANKAR",
      "raw_parties": "DR SATENDRA SINGH & ANR. V/s UNION OF INDIA & ORS.",
      "source_pdf": "combined_adv_04.02.2026.pdf"
    }
  ]
}
```

### `GET /health` Health check

```json
{"status": "ok", "version": "1.0.0", "mongodb": "not configured"}
```

## Frontend Integration (JavaScript)

```javascript
// Upload and parse a PDF
async function parseCauseList(file) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("http://localhost:8000/api/v1/parse", {
    method: "POST",
    body: formData,
  });

  const data = await res.json();
  console.log(`Parsed ${data.total_cases} cases`);
  return data.cases;
}
```

## Configuration

All settings via environment variables (see `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `RAVENSLAW_HOST` | `0.0.0.0` | Server bind host |
| `RAVENSLAW_PORT` | `8000` | Server port |
| `PORT` | *(empty)* | Platform-injected runtime port |
| `RAVENSLAW_DEBUG` | `false` | Enable debug mode + auto-reload |
| `ENABLE_SCRAPER_SCHEDULER` | `false` | Enable scheduler only on one dedicated instance |
| `RAVENSLAW_UPLOAD_DIR` | `./uploads` | Temp PDF upload directory |
| `RAVENSLAW_MAX_PDF_SIZE_MB` | `50` | Max upload file size |
| `MONGODB_URI` | *(empty)* | MongoDB connection string (optional) |
| `MONGODB_DB` | `cause_list_db` | MongoDB database name |
| `RAVENSLAW_CORS_ORIGINS` | *(required in production)* | Allowed CORS origins (comma-separated, no wildcard in production) |
| `RAVENSLAW_TRUSTED_HOSTS` | `localhost,127.0.0.1,*.workers.dev` | Trusted host header values |
| `RAVENSLAW_RATE_LIMIT_WINDOW_SECONDS` | `60` | Rate limit time window in seconds |
| `RAVENSLAW_RATE_LIMIT_MAX_REQUESTS` | `120` | Max requests per IP per window |
| `RAVENSLAW_MAX_CONCURRENT_BULK_IMPORTS` | `1` | Maximum parallel bulk import sessions |
| `RAVENSLAW_IMPORT_PROGRESS_TTL_SECONDS` | `86400` | Retention for completed import progress data |
| `RAVENSLAW_INTERNAL_TOKEN` | *(required)* | Shared internal token expected in `x-internal-token` header |

### RAG stack

Full reference in `.env.example`; these are the ones that matter on a new host.

| Variable | Default | Description |
|----------|---------|-------------|
| `DATA_ROOT` | `/data` | **Must be the mounted volume.** All persistent state lives below it |
| `LEGAL_CORPUS_ROOT` | `$DATA_ROOT/legal_corpus` | Public corpus, laid out by court and year. `PDF_ROOT` is still read as an alias |
| `USERS_ROOT` | `$DATA_ROOT/users` | Private per-user documents, `0700`, owner-scoped |
| `FAISS_ROOT` | `$DATA_ROOT/faiss` | Vector indexes |
| `SQLITE_PATH` | `$DATA_ROOT/sqlite/chunks.db` | Document and chunk metadata |
| `LMDB_PATH` | `$DATA_ROOT/lmdb/hashdb` | Content-hash duplicate index |
| `BACKUP_ROOT` | `$DATA_ROOT/backups` | Nightly FAISS/SQLite/LMDB snapshots |
| `EMBED_MODEL` | `qwen3-embedding-8b` | Local embedding model. Also accepts `-4b`, `-0.6b`, or any HF id |
| `EMBED_DIM` | `1024` | Matryoshka truncation; sets the index's RAM footprint |
| `EMBED_BATCH_SIZE` | `8` | Chunks per forward pass |
| `PARSER_BACKEND` | `docling` | `docling` or `pypdfium` (lighter, no layout model) |
| `FAISS_INDEX_FACTORY` | `Flat` | Exact search. Use `IVF4096,PQ64` past a few million chunks |
| `BACKUP_ENABLED` | `true` | Nightly snapshot at `BACKUP_HOUR:BACKUP_MINUTE` |
| `BACKUP_RETENTION_DAYS` | `14` | Snapshots kept. The newest document mirror is always kept, even past this |
| `BACKUP_WEEKLY_WEEKDAY` | `6` (Sun) | Day the document trees are mirrored; the stores are nightly |
| `MAX_USER_DOCUMENT_MB` | `50` | Per-upload ceiling for a private document |
| `USER_QUOTA_MB` | `5120` | Per-owner storage ceiling; `0` disables it |

Changing `EMBED_MODEL` or `EMBED_DIM` invalidates every stored vector. The
signature is recorded in SQLite and checked at startup, so a mismatch refuses to
boot rather than returning wrong neighbours; `rag/scripts/rebuild_index.py`
re-embeds the corpus.

## Docker

```bash
# Full image (parser + RAG). /data must be the mounted volume.
docker compose up -d

# Parser and API only, no RAG dependencies
docker build --target api -t ravenslaw-api .
docker run -p 8000:8000 ravenslaw-api
```

The backend is stateful: without a real volume mounted at `/data` the corpus is
discarded on every restart. `docker-compose.yml` bind-mounts it.

## Supported PDF Formats

- Combined Cause List (`combined_adv_DD.MM.YYYY.pdf`)
- Advance Cause List (`adv_DD.MM.YYYY.pdf`)
- Supplementary Cause List (`supp_DD.MM.YYYY.pdf`)
- Daily Cause List (`c_DDMMYYYY.pdf`)
- Regular Cause List (`regular_DD.MM.YYYY.pdf`)
- Pronouncement List

## Accuracy

Tested across 11 real DHC PDFs (11,854 cases):

| Metric | Score |
|--------|-------|
| Core Perfect (all fields except adv_respondent) | **99.3%** |
| Full Perfect (all fields) | **80.8%** |
| Valid case numbers | **100%** |
| Petitioner extracted | **100%** |
| Respondent extracted | **100%** |

## Project Structure

```
backend/
├── app/                     FastAPI layer
│   ├── main.py              app, middleware, startup/shutdown, schedulers
│   ├── config.py            server/security settings
│   ├── parser.py            cause-list parsing engine
│   ├── routes.py            parser endpoints
│   ├── rag_routes.py        /api/v1/rag/* ingest, search, extract, serve
│   ├── scraper_routes.py    scraper control endpoints
│   ├── userdetails_routes.py
│   ├── models.py            Pydantic models
│   ├── security.py          internal-token + Clerk JWT auth
│   └── db.py                MongoDB (optional)
├── rag/                     the RAG stack -- see rag/README.md
│   ├── core/                config, storage, embeddings, FAISS, backups
│   ├── app/ingest/          the ingest pipeline
│   ├── app/retrieval/       query -> FAISS -> SQLite
│   ├── scripts/             verify, rebuild, backup, migrate
│   └── scrapping/           document acquisition (TypeScript)
├── tests/
│   ├── test_parser.py       cause-list accuracy
│   ├── test_rag_stack.py    RAG storage, isolation, resume, backups (offline)
│   └── test_scrapping.py
├── docker-compose.yml       single-host deployment, /data bind-mounted
├── Dockerfile               targets: api (light), ingest (full)
├── MIGRATION.md             move off Chroma/OpenAI/R2 + breaking changes
├── .env.example
├── pyproject.toml
└── run.py
```
