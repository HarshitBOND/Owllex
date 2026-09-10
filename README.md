# Owllex

A legal research and practice platform for Indian advocates: retrieval over a self-hosted
corpus of judgments, orders and bare acts, plus case tracking, drafting, vault and billing.

## Layout

```
app/            Next.js App Router — pages and API routes
features/       One folder per business domain (see features/README.md)
components/     Shared UI
lib/            Shared client and server helpers
backend/        Python FastAPI service — the corpus, RAG and scrapers
cloudflare/     Workers: authenticated API gateway, public docs gateway
```

## Running it

```bash
npm install && npm run dev          # frontend, needs .env.local
cd backend && uv sync && .venv/bin/python -m app.main   # backend, needs backend/.env
```

Environment variables are documented in [ENVIRONMENT_SETUP.md](ENVIRONMENT_SETUP.md)
(frontend) and [backend/.env.example](backend/.env.example) (backend). Those two files are
the source of truth — there are no others.

## Documentation

**Start here:** [PRODUCTION_TODO.md](PRODUCTION_TODO.md) — the current implementation list.
It carries the full system context and works through every open issue from the September
2026 architecture audit, in dependency order, to a reliably deployable state.

| Topic | Document |
|---|---|
| The deployed RAG stack | [backend/rag/README.md](backend/rag/README.md) |
| Retrieval design and sizing | [backend/rag/FAISS_ARCHITECTURE.md](backend/rag/FAISS_ARCHITECTURE.md) |
| The move off Chroma / R2 / OpenAI | [backend/MIGRATION.md](backend/MIGRATION.md) |
| Deploying and operating the backend | [backend/deploy/README.md](backend/deploy/README.md) |
| Metadata schema and chunking | [backend/rag/ARCHITECTURE.md](backend/rag/ARCHITECTURE.md) |
| Corpus acquisition | [backend/rag/scrapping/README.md](backend/rag/scrapping/README.md) |
| Admin panel access | [ADMIN_ACCESS_SETUP.md](ADMIN_ACCESS_SETUP.md) |
| Mongo index maintenance | [MONGO_INDEX_STRATEGY.md](MONGO_INDEX_STRATEGY.md) |
| Incident response | [SECURITY_INCIDENT_PLAYBOOK.md](SECURITY_INCIDENT_PLAYBOOK.md) |

`backend/rag/ARCHITECTURE.md` predates the self-hosted migration: its metadata and chunking
sections still stand, but read `MIGRATION.md` for the infrastructure.
