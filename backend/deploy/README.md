# Owllex production deployment — Hetzner Ubuntu 24.04

Everything needed to take a bare VPS to a running, backed-up, monitored Owllex
backend. The frontend API contract is unchanged; this directory is purely
infrastructure.

---

## Architecture

```
React Native / Web
        │
        ▼
Cloudflare Worker            VPS_ORIGIN → https://api.owllex.example
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│ Hetzner VPS (32 GB RAM, Ubuntu 24.04)                         │
│                                                               │
│  nginx :443 ──── TLS, gzip, PDF streaming, rate limits        │
│      │                                                        │
│      ▼                                                        │
│  gunicorn/uvicorn :8000 (localhost only)                      │
│      │                                                        │
│  ┌───┴──────────────────┐         ┌──────────────────────┐    │
│  │ SSD  /opt/owllex     │         │ HDD  /data           │    │
│  │  • git checkout      │         │  • legal_corpus/     │    │
│  │  • .venv             │  never  │  • users/            │    │
│  │  • nginx config      │ ◄─────► │  • faiss/  • sqlite/ │    │
│  │  • systemd units     │  mixed  │  • lmdb/             │    │
│  │                      │         │  • backups/          │    │
│  │  /var/log/owllex     │         │  • inbox/            │    │
│  └──────────────────────┘         └──────────────────────┘    │
└───────────────────────────────────────────────────────────────┘
```

**The split is the point.** Code is disposable — it is rebuilt from git in
minutes. The volume is not: lose it and the corpus is gone. Nothing about the
application may assume they are the same disk, which is why every persistent
path comes from configuration (`rag/core/config.py`) and never from `__file__`.

---

## Quick start

```bash
git clone https://github.com/your-org/owllex.git /opt/owllex
cd /opt/owllex/backend/deploy

sudo OWLLEX_DOMAIN=api.owllex.example DATA_DEVICE=/dev/sdb ./deploy.sh
sudo certbot --nginx -d api.owllex.example
sudo ./harden.sh
```

Then finish `/opt/owllex/backend/.env` (`RAVENSLAW_CORS_ORIGINS` and
`CLERK_JWT_ISSUER` are required — the app refuses to boot in production without
them) and `systemctl restart owllex-rag`.

`deploy.sh` is idempotent. Re-run it after a code update or a partial failure.

### deploy.sh environment

| Variable | Default | Purpose |
|---|---|---|
| `OWLLEX_DOMAIN` | `api.owllex.example` | nginx `server_name`, trusted host |
| `DATA_DEVICE` | autodetected | block device to mount at `/data` |
| `FORMAT_DATA_DEVICE` | `no` | `yes` to `mkfs` an **empty** device |
| `APP_ROOT` | `/opt/owllex` | checkout location |
| `DATA_ROOT` | `/data` | volume mount point |
| `OWLLEX_USER` | `owllex` | service account |
| `PYTHON_EXTRAS` | `rag,embeddings` | uv extras to install |
| `SKIP_NODE` | `no` | skip the scraper toolchain |

`deploy.sh` will **never** format a disk that already has a filesystem, and
refuses to format an empty one unless you pass `FORMAT_DATA_DEVICE=yes`.

---

## Storage layout

```
/data                          ← mounted volume, owllex:owllex, 0750
├── legal_corpus/              LEGAL_CORPUS_ROOT — public, content-addressed
│   ├── sci/2026/<sha256>.pdf
│   ├── hc/{delhi,bombay,madras}/2026/<sha256>.pdf
│   └── tribunal/
├── users/                     USERS_ROOT — private, 0700 all the way down
│   └── <user id>/{contracts,affidavits,evidence,drafts,miscellaneous}/
│       └── <document id>.pdf
├── faiss/                     FAISS_ROOT — vector indexes + .meta.json
├── sqlite/chunks.db           SQLITE_PATH — chunk text and metadata
├── lmdb/hashdb/               LMDB_PATH — content-hash dedup index
├── backups/YYYY-MM-DD/        BACKUP_ROOT — see "Backups"
├── inbox/                     INBOX_ROOT — drop zone for bulk ingest
├── private/                   PRIVATE_ROOT — caller-keyed objects, 0700
├── models/                    HF_HOME — embedding model weights (~16 GB)
└── tmp/uploads/               transient upload staging

/opt/owllex                    ← system SSD, root:owllex
/var/log/owllex                ← rag.log, ingest.log, backup.log, nginx/
```

Paths are read from the environment, never hardcoded. To move storage, change
`DATA_ROOT` in `.env` and restart — SQLite stores document paths *relative* to
whichever root owns them, so either tree can be remounted anywhere without
rewriting the database.

**The two document trees are separate on purpose.** `legal_corpus/` is served to
any authenticated user; `users/` is served only to the owner of the row, and only
through `/api/user-documents/{id}`, which compares the document's `owner_id`
against a verified Clerk subject before it opens the file. No filesystem path
ever reaches a client, and nginx has no `root` inside `/data` and denies `/data`
outright, so there is no request that reads a stored document without passing
that check. `users/` and `private/` are `0700`: the application re-applies that
on every boot and `/health/storage` reports `degraded` if it ever finds them
loosened.

---

## Services

| Unit | Type | Role |
|---|---|---|
| `owllex-rag.service` | long-running | FastAPI + RAG stack on `127.0.0.1:8000` |
| `owllex-ingest.service` | long-running | drains `/data/inbox` into the corpus |
| `owllex-backup.service` | oneshot | one backup run |
| `owllex-backup.timer` | timer | fires the above nightly at 03:30 |

```bash
systemctl status owllex-rag owllex-ingest
systemctl list-timers owllex-backup.timer
journalctl -u owllex-rag -f
```

Three details worth knowing:

- **`RequiresMountsFor=/data`** — the API will not start before the volume
  mounts. Without it, an unmounted volume leaves `/data` as an empty directory
  on the boot SSD and the stack comes up "healthy" and empty, filling the root
  filesystem with a corpus that dies with the instance.
- **One worker, deliberately.** Each gunicorn worker holds its own copy of the
  embedding model (~16 GB for the 8B). A second worker exhausts a 32 GB box.
  Scale with a bigger machine or a smaller `EMBED_MODEL`, never with `--workers`.
- **The ingest worker is nice'd** (`Nice=10`, `IOSchedulingClass=idle`) so a bulk
  import runs at full speed on an idle box and yields the moment a query arrives.

---

## Health monitoring

| Endpoint | Verifies | Status codes |
|---|---|---|
| `/health` | process is serving | always 200 while up |
| `/health/sqlite` | opens the DB, `PRAGMA quick_check`, real row counts | 200 / 503 |
| `/health/lmdb` | reads entry count and map utilisation | 200 / 503 |
| `/health/vector` | index loaded, signature match, drift vs SQLite | 200 / 503 |
| `/health/storage` | mount, writability (by writing), free space | 200 / 503 |

```bash
curl -s localhost:8000/health/storage | jq .
```

`/health` is a **liveness** probe and stays 200 whenever the process can serve —
the Cloudflare container uses it as its `pingEndpoint` and only reads the status
code, so returning 503 for a degraded-but-serving RAG stack would restart-loop a
backend that is answering the parser routes correctly. Its `dependencies` field
carries the per-store summary. The four granular endpoints are **readiness**
probes and are what monitoring should page on. nginx restricts `/health/*` to
localhost; add your monitor's IP to that block.

Every check touches its dependency for real. The one most likely to save the
deployment is `/health/storage`'s `separate_device`: if `/data` and
`/opt/owllex` report the same block device, **the volume is not mounted**.

---

## Backups

Nightly at 03:30 into `/data/backups/YYYY-MM-DD/`:

```
2026-09-09/
├── faiss/          index files, as last flushed by the ingest worker  nightly
├── sqlite/         VACUUM INTO — a real online backup                 nightly
├── lmdb/           compacting environment copy                        nightly
├── legal_corpus/   incremental rsync mirror                           weekly
├── users/          incremental rsync mirror, 0700                     weekly
└── MANIFEST.json   written last; its presence means "complete"
```

**The FAISS snapshot is a plain copy, not a fresh flush.** `backup_now.py` opens
the stack read-only and never loads the index into RAM; the index file is
already a consistent point-in-time snapshot (writes replace it atomically), so
copying it is enough, and flushing from a process that does not own it is
exactly the bug PRODUCTION_TODO.md T2a fixed — it silently rewound the live
index to whatever it was when the backup process started, discarding every
vector the ingest worker added during the run. If `/health/vector` reports
drift between what's in SQLite and what's in the last snapshot, that is what
`rag/scripts/rebuild_index.py` is for, not a flush.

**Two cadences.** The three metadata stores are snapshotted every night: they
are seconds of work, they are what a restore needs first, and they change on
every ingest. The two document trees are mirrored weekly (`BACKUP_WEEKLY_WEEKDAY`,
default Sunday), because their contents are immutable once written — a corpus PDF
is content-addressed and a user document is never rewritten in place — so a
nightly walk of millions of files would spend hours proving nothing changed. The
first run on a fresh backup root always mirrors, whatever day it is, so a new
deployment is never a week away from having a copy of its documents.

**Documents are mirrored, not re-copied.** Each mirror rsyncs with `--link-dest`
pointing at the newest *complete* snapshot that holds the same tree, so an
unchanged PDF becomes a *hard link* rather than a second copy on disk. Every
dated directory reads as a complete, restore-from-anything tree, while a run
costs only the documents actually added since the last one. This is safe
precisely because both trees are immutable — a path's bytes never change, so a
hard link can never make an old snapshot observe a new edit.

Retention counts snapshots, but the newest snapshot holding each document tree is
kept past `BACKUP_RETENTION_DAYS` whatever the count says. Without that, a
retention shorter than a week would delete the only copy of the documents while
dutifully keeping seven copies of the database that indexes them.

Runs are resumable: `--partial` resumes an interrupted transfer, and re-running
a stamp reuses its directory rather than re-walking the archive.

```bash
sudo systemctl start owllex-backup           # tonight's, on the normal cadence
.venv/bin/python -m rag.scripts.backup_now --documents      # force a full mirror
.venv/bin/python -m rag.scripts.backup_now --no-documents   # metadata only
sudo ./restore.sh --list                     # what is available
du -sh --exclude=legal_corpus --exclude=users /data/backups/*   # marginal cost
```

Run `backup_now --documents` before anything that deletes files. The nightly
timer is for the steady state; a pre-deploy snapshot wants the trees too.

`BACKUP_ENABLED=false` in `.env` is correct on a systemd deployment: the timer
owns the schedule, and it still fires when the API is down — which is exactly
when you most want a backup to have happened. Leaving both on means two
processes writing the same snapshot directory.

Snapshots are on the same volume as the data, so they protect against deletion
and corruption, **not** against losing the volume. Mirror `/data/backups`
off-host (restic or rsync to a Hetzner Storage Box) for that.

---

## Restore

```bash
sudo ./restore.sh                        # newest complete snapshot
sudo ./restore.sh 2026-09-09             # a specific one
sudo ./restore.sh --dry-run 2026-09-09   # show what would happen
sudo ./restore.sh --components faiss,sqlite 2026-09-09
```

It stops the services, moves the current state into `/data/.rollback-<stamp>`
rather than deleting it, restores each component, runs `integrity_check` on the
restored database, **rebuilds ownership**, and restarts what it stopped — even
if the restore fails partway.

- Snapshots without `MANIFEST.json` are refused (use `--force` to override):
  the run that wrote them did not finish, so restoring one produces silent gaps.
- Documents are restored **additively**, without `--delete`. A document ingested
  after the snapshot is one you want to keep, not one the restore should quietly
  remove. Content addressing makes the merge safe.
- If the manifest's embedding signature does not match `EMBED_MODEL` in `.env`,
  it warns — the stack refuses to serve vectors it did not build.

Verify afterwards with `/health/sqlite` and `/health/vector`. If the latter
reports drift, reconcile with `rag/scripts/rebuild_index.py`.

---

## Bulk ingest

```bash
sudo -u owllex cp -r ~/judgments/. /data/inbox/sci/
journalctl -u owllex-ingest -f
```

The worker picks files up within 30 seconds. A top-level directory naming a
court becomes the court hint (`/data/inbox/sci/…`, `/data/inbox/hc/delhi/…`).
Successfully ingested files are removed from the inbox — the content-addressed
archive copy is the durable one. Failures move to `/data/inbox/.failed/` with
their path preserved, so a fix plus `mv` back is a clean retry.

Files modified in the last five seconds are skipped, so a large PDF still
copying in is not ingested half-written.

`.pdf`, `.txt`, `.md`, `.zip` and common image formats are ingested; **keep
operator notes out of the inbox** or they will be indexed as documents.

`owllex-ingest` is also what `POST /api/v1/rag/ingest` and `/corpus/ingest`
feed: the API only spools the upload into `/data/inbox/api/<job_id>/` and
returns `job_id` — it never runs the pipeline itself. A caller polls
`GET /api/v1/rag/jobs/<job_id>` for the result. If `owllex-ingest` is stopped,
those jobs simply sit at `queued` until it starts again; nothing is lost.

### The ingest worker is the only FAISS writer

`owllex-rag` (the API) never writes FAISS — it only reads the index to serve
search. `owllex-ingest` is the sole writer, and `VectorIndex` backs that with
an exclusive, non-blocking `fcntl` lock on `<index>.lock`: a second process
that tries to write the same index fails immediately on its first write
instead of silently clobbering whichever one flushes last.

That means **`rag/scripts/rebuild_index.py` requires `owllex-ingest` to be
stopped first** — it writes the live index directly through `VectorIndex`, so
while the worker is running it fails fast on the lock (the intended outcome)
rather than racing it:

```bash
sudo systemctl stop owllex-ingest
sudo -u owllex .venv/bin/python -m rag.scripts.rebuild_index --all --yes
sudo systemctl start owllex-ingest
```

**`rag/scripts/migrate_storage_split.py` also requires it stopped**, for a
different reason the lock does not cover: it moves the `.faiss` file itself
between storage roots at the filesystem level rather than going through
`VectorIndex`, so it never touches the lock. If the worker is still running
during the move, its next flush recreates a file at the *old* path — orphaned
from the one the migration just moved — rather than raising anything.

---

## Logs

```
/var/log/owllex/
├── rag.log        API + RAG stack
├── ingest.log     ingest worker
├── backup.log     backup runs
└── nginx/{access,error}.log
```

Everything also goes to journald (`journalctl -u owllex-rag`). Rotated daily,
14 days for application logs and 30 for nginx, with a 50 MB in-process size cap
as a hard ceiling between logrotate runs.

Application logs use `copytruncate` on purpose: Python's `RotatingFileHandler`
holds the file open, so renaming it would leave every service writing into an
unlinked inode — disk fills, `tail` shows nothing, and nothing reports an error.

---

## Security

`harden.sh` configures UFW (deny inbound except 22/80/443), key-only SSH via a
`sshd_config.d` drop-in, and Fail2Ban jails for sshd and nginx banning through
UFW. Run `./harden.sh --check` to audit without changing anything.

- The application runs as **`owllex`**, never root. `harden.sh` fails loudly if
  any unit is configured otherwise.
- Port 8000 is never opened. gunicorn binds `127.0.0.1`, so all traffic goes
  through nginx's TLS, rate limits and `/health/*` restrictions.
- `/data` is `0750 owllex:owllex` — court documents and user uploads are not
  world-readable.
- `.env` is `0640 root:owllex`: the application reads its credentials but cannot
  rewrite them, and neither can it rewrite its own code (`/opt/owllex` is
  root-owned).
- systemd units run with `ProtectSystem=strict` and `ReadWritePaths=/data
  /var/log/owllex` — the process cannot write anywhere else on the filesystem.

> `harden.sh` disables SSH password authentication. It refuses to run without
> at least one key in an `authorized_keys` file, but confirm you can log in with
> a key **in a second terminal** before closing your session.

---

## Troubleshooting

| Symptom | Check |
|---|---|
| API will not start | `journalctl -u owllex-rag -n 50` — usually a missing `RAVENSLAW_CORS_ORIGINS` |
| `/health/storage` warns about `separate_device` | `findmnt /data` — the volume is not mounted |
| `/health/vector` reports drift | `rag/scripts/rebuild_index.py --collection <name>` |
| Startup fails on embedding signature | `EMBED_MODEL`/`EMBED_DIM` changed; re-embed or restore the matching config |
| Service OOM-killed | more than one worker, or `EMBED_MODEL` too large for the box |
| Ingest worker idle with files present | files under `.failed/`, unsupported suffix, or modified <5s ago |
| 413 on upload | raise `client_max_body_size` in the nginx vhost |
| 504 on extraction | raise `proxy_read_timeout`; the default 60s is far too short for OCR |

```bash
# Where did the disk go?
du -sh /data/*
du -sh --exclude=documents /data/backups/*   # snapshots minus hard links

# Is the volume really mounted?
findmnt /data && curl -s localhost:8000/health/storage | jq '.separate_device'
```

---

## Updating

```bash
cd /opt/owllex && sudo git pull
sudo systemctl start owllex-backup            # snapshot before changing anything
sudo ./backend/deploy/deploy.sh               # idempotent: re-syncs deps and units
sudo systemctl restart owllex-rag owllex-ingest
curl -s localhost:8000/health | jq .
```

Stop `owllex-ingest` before any index rebuild or migration — it and the rebuild
script both write FAISS, and only one writer at a time is safe.
