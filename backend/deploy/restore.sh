#!/usr/bin/env bash
#
# Restore Owllex from a backup snapshot.
#
#   sudo ./restore.sh                      # newest complete snapshot
#   sudo ./restore.sh 2026-09-09           # a specific one
#   sudo ./restore.sh --list               # what is available
#   sudo ./restore.sh --dry-run 2026-09-09 # what it would do
#   sudo ./restore.sh --components faiss,sqlite 2026-09-09
#
# Restores FAISS, SQLite, LMDB and the document archive, then fixes ownership so
# the service account can actually read what was just written -- the step most
# hand-run restores forget, producing a stack that starts and then fails on
# every query with a permission error.
#
# ── Safety ──────────────────────────────────────────────────────────────────
# This overwrites live data. Before touching anything it stops the services,
# and it moves the current state aside into a rollback directory rather than
# deleting it, so a restore from the wrong snapshot is itself recoverable.
#
set -euo pipefail

DATA_ROOT="${DATA_ROOT:-/data}"
BACKUP_ROOT="${BACKUP_ROOT:-${DATA_ROOT}/backups}"
OWLLEX_USER="${OWLLEX_USER:-owllex}"
SERVICES=(owllex-rag.service owllex-ingest.service)

DRY_RUN=no
COMPONENTS="faiss,sqlite,lmdb,documents"
SNAPSHOT=""
FORCE=no

if [[ -t 1 ]]; then
    BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RESET=$'\033[0m'
else
    BOLD=""; RED=""; GREEN=""; YELLOW=""; RESET=""
fi
step() { printf '\n%s==> %s%s\n' "$BOLD" "$*" "$RESET"; }
info() { printf '    %s\n' "$*"; }
ok()   { printf '    %s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '    %s!%s %s\n' "$YELLOW" "$RESET" "$*"; }
die()  { printf '\n%sERROR:%s %s\n\n' "$RED" "$RESET" "$*" >&2; exit 1; }

run() {
    if [[ "$DRY_RUN" == "yes" ]]; then
        printf '    [dry-run] %s\n' "$*"
    else
        "$@"
    fi
}

usage() {
    # Everything between the shebang and the first non-comment line is the help
    # text, so the usage message can never drift from the header.
    sed -n '2,/^$/p' "${BASH_SOURCE[0]}" | sed 's/^#\{1,\} \{0,1\}//'
    exit "${1:-0}"
}

list_snapshots() {
    [[ -d "$BACKUP_ROOT" ]] || die "no backup directory at ${BACKUP_ROOT}"
    printf '%-14s %-10s %-12s %s\n' "SNAPSHOT" "STATE" "SIZE" "CONTENTS"
    local found=no
    for dir in "$BACKUP_ROOT"/*/; do
        [[ -d "$dir" ]] || continue
        found=yes
        local name state size contents
        name="$(basename "$dir")"
        # A snapshot without MANIFEST.json is one an interrupted run left behind.
        if [[ -f "${dir}MANIFEST.json" ]]; then state="complete"; else state="PARTIAL"; fi
        size="$(du -sh "$dir" 2>/dev/null | cut -f1)"
        contents="$(find "$dir" -maxdepth 1 -mindepth 1 -type d -printf '%f ' 2>/dev/null)"
        printf '%-14s %-10s %-12s %s\n' "$name" "$state" "$size" "$contents"
    done
    [[ "$found" == "yes" ]] || info "(none)"
    echo
    info "Sizes are apparent: unchanged PDFs are hard links shared between"
    info "snapshots, so the total on disk is far less than the sum of these."
}

# ─── Arguments ───────────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
    case "$1" in
        --list|-l)       list_snapshots; exit 0 ;;
        --dry-run|-n)    DRY_RUN=yes; shift ;;
        --force|-f)      FORCE=yes; shift ;;
        --components|-c) COMPONENTS="$2"; shift 2 ;;
        --help|-h)       usage 0 ;;
        -*)              die "unknown option: $1  (--help)" ;;
        *)               SNAPSHOT="$1"; shift ;;
    esac
done

[[ $EUID -eq 0 || "$DRY_RUN" == "yes" ]] || die "must run as root (sudo ./restore.sh)"

# ─── Resolve the snapshot ────────────────────────────────────────────────────

step "Selecting a snapshot"
[[ -d "$BACKUP_ROOT" ]] || die "no backup directory at ${BACKUP_ROOT}"

if [[ -z "$SNAPSHOT" ]]; then
    # Newest *complete* one. Restoring from a partial snapshot by default would
    # turn a bad night into a bad corpus.
    SNAPSHOT="$(find "$BACKUP_ROOT" -maxdepth 1 -mindepth 1 -type d \
                    -exec test -f '{}/MANIFEST.json' \; -printf '%f\n' \
                | sort | tail -n1)"
    [[ -n "$SNAPSHOT" ]] || die "no complete snapshot in ${BACKUP_ROOT} (see --list)"
    info "newest complete snapshot: ${SNAPSHOT}"
fi

SNAPSHOT_DIR="${BACKUP_ROOT}/${SNAPSHOT}"
[[ -d "$SNAPSHOT_DIR" ]] || die "no such snapshot: ${SNAPSHOT_DIR}  (--list)"

if [[ ! -f "${SNAPSHOT_DIR}/MANIFEST.json" ]]; then
    if [[ "$FORCE" == "yes" ]]; then
        warn "${SNAPSHOT} has no MANIFEST.json -- it is incomplete. Continuing (--force)."
    else
        die "${SNAPSHOT} has no MANIFEST.json, so the backup that wrote it did not finish.
    Restoring it will produce a corpus with silent gaps. Pick another (--list),
    or re-run with --force if you have decided a partial restore is what you want."
    fi
fi

if [[ -f "${SNAPSHOT_DIR}/MANIFEST.json" ]] && command -v jq >/dev/null 2>&1; then
    info "created:   $(jq -r '.created_at // "?"' "${SNAPSHOT_DIR}/MANIFEST.json")"
    info "embedding: $(jq -r '.embedding_signature // "?"' "${SNAPSHOT_DIR}/MANIFEST.json")"
    info "documents: $(jq -r '.documents_copied // 0' "${SNAPSHOT_DIR}/MANIFEST.json") copied, $(jq -r '.documents_linked // 0' "${SNAPSHOT_DIR}/MANIFEST.json") linked"

    # A snapshot built with a different embedding model restores fine and then
    # fails at startup -- services.py refuses to serve vectors it did not build.
    # Far better to say so now than to have it discovered by a user's query.
    backup_sig="$(jq -r '.embedding_signature // ""' "${SNAPSHOT_DIR}/MANIFEST.json")"
    env_file="${APP_ROOT:-/opt/owllex}/backend/.env"
    if [[ -n "$backup_sig" && -f "$env_file" ]]; then
        model="$(grep -E '^EMBED_MODEL=' "$env_file" | cut -d= -f2- | tr -d '"' || true)"
        if [[ -n "$model" && "$backup_sig" != *"$model"* ]]; then
            warn "MANIFEST says '${backup_sig}' but .env has EMBED_MODEL=${model}."
            warn "The stack will refuse to start on a mismatch. Align them, or plan"
            warn "to re-embed with rag/scripts/rebuild_index.py after this restore."
        fi
    fi
fi

IFS=',' read -ra WANTED <<< "$COMPONENTS"
info "restoring: ${WANTED[*]}"
[[ "$DRY_RUN" == "yes" ]] && warn "DRY RUN -- nothing will be written"

# ─── Confirm ─────────────────────────────────────────────────────────────────

if [[ "$DRY_RUN" != "yes" && "$FORCE" != "yes" ]]; then
    echo
    warn "This overwrites live data under ${DATA_ROOT}."
    warn "The current state is moved aside first, not deleted."
    read -r -p "    Restore ${SNAPSHOT}? [y/N] " reply
    [[ "$reply" =~ ^[Yy]$ ]] || die "aborted"
fi

# ─── Stop services ───────────────────────────────────────────────────────────

step "Stopping services"
STOPPED=()
for service in "${SERVICES[@]}"; do
    if systemctl is-active --quiet "$service" 2>/dev/null; then
        run systemctl stop "$service"
        STOPPED+=("$service")
        ok "stopped ${service}"
    else
        info "${service} was not running"
    fi
done
# Restarting whatever we stopped, even if the restore fails partway, so a failed
# restore does not also leave the service down.
restart_services() {
    if (( ${#STOPPED[@]} )); then
        step "Restarting services"
        for service in "${STOPPED[@]}"; do
            run systemctl start "$service" && ok "started ${service}" || warn "could not start ${service}"
        done
    fi
}
trap restart_services EXIT

# ─── Roll back directory ─────────────────────────────────────────────────────

ROLLBACK="${DATA_ROOT}/.rollback-$(date -u +%Y%m%dT%H%M%SZ)"
step "Preserving current state in ${ROLLBACK}"
run mkdir -p "$ROLLBACK"

preserve() {
    local source="$1" name="$2"
    if [[ -e "$source" ]]; then
        run mv "$source" "${ROLLBACK}/${name}"
        ok "moved current ${name} aside"
    fi
}

wants() {
    local needle="$1"
    for item in "${WANTED[@]}"; do [[ "$item" == "$needle" ]] && return 0; done
    return 1
}

# ─── FAISS ───────────────────────────────────────────────────────────────────

if wants faiss; then
    step "Restoring FAISS indexes"
    if [[ -d "${SNAPSHOT_DIR}/faiss" ]]; then
        preserve "${DATA_ROOT}/faiss" faiss
        run mkdir -p "${DATA_ROOT}/faiss"
        run cp -a "${SNAPSHOT_DIR}/faiss/." "${DATA_ROOT}/faiss/"
        ok "restored $(find "${SNAPSHOT_DIR}/faiss" -type f | wc -l) index file(s)"
    else
        warn "snapshot has no faiss/ -- skipping"
    fi
fi

# ─── SQLite ──────────────────────────────────────────────────────────────────

if wants sqlite; then
    step "Restoring the SQLite metadata database"
    if [[ -d "${SNAPSHOT_DIR}/sqlite" ]]; then
        preserve "${DATA_ROOT}/sqlite" sqlite
        run mkdir -p "${DATA_ROOT}/sqlite"
        run cp -a "${SNAPSHOT_DIR}/sqlite/." "${DATA_ROOT}/sqlite/"

        # The backup was written with VACUUM INTO, so there is no WAL to replay
        # and this check is fast and conclusive.
        db="${DATA_ROOT}/sqlite/chunks.db"
        if [[ "$DRY_RUN" != "yes" && -f "$db" ]] && command -v sqlite3 >/dev/null 2>&1; then
            result="$(sqlite3 "$db" 'PRAGMA integrity_check;' 2>&1 | head -n1)"
            [[ "$result" == "ok" ]] || die "restored database fails integrity_check: ${result}
    The original is preserved in ${ROLLBACK}/sqlite -- nothing is lost. Try an older snapshot."
            ok "integrity_check: ok"
        fi
    else
        warn "snapshot has no sqlite/ -- skipping"
    fi
fi

# ─── LMDB ────────────────────────────────────────────────────────────────────

if wants lmdb; then
    step "Restoring the LMDB hash index"
    if [[ -d "${SNAPSHOT_DIR}/lmdb" ]]; then
        preserve "${DATA_ROOT}/lmdb" lmdb
        run mkdir -p "${DATA_ROOT}/lmdb/hashdb"
        run cp -a "${SNAPSHOT_DIR}/lmdb/." "${DATA_ROOT}/lmdb/hashdb/"
        # A stale lock file from the source host is meaningless here and LMDB
        # recreates it on open.
        run rm -f "${DATA_ROOT}/lmdb/hashdb/lock.mdb"
        ok "restored the hash index"
    else
        warn "snapshot has no lmdb/ -- skipping"
    fi
fi

# ─── Documents ───────────────────────────────────────────────────────────────

if wants documents; then
    step "Restoring the document trees"

    # Two trees, plus the name the corpus used before the rename so an older
    # snapshot still restores. Each maps to where it belongs today.
    restored_any=no
    for pair in "legal_corpus:legal_corpus" "documents:legal_corpus" "users:users"; do
        snapshot_name="${pair%%:*}"
        target_name="${pair##*:}"
        source_dir="${SNAPSHOT_DIR}/${snapshot_name}"
        target_dir="${DATA_ROOT}/${target_name}"

        [[ -d "$source_dir" ]] || continue

        run mkdir -p "$target_dir"
        # rsync rather than cp, and WITHOUT --delete: this is additive by
        # design. A restore is usually recovering lost files, and a document
        # written after the snapshot is one you want to keep, not one the
        # restore should quietly remove. Both trees name files after a content
        # hash or a UUID, so the merge is safe -- a path either exists with the
        # right bytes or does not exist. --partial makes a multi-hour restore
        # resumable: re-run and it continues rather than starting again.
        if [[ "$DRY_RUN" == "yes" ]]; then
            rsync -a --partial --stats --dry-run \
                  "${source_dir}/" "${target_dir}/" | tail -n 20
        else
            rsync -a --partial --info=progress2 "${source_dir}/" "${target_dir}/"
            ok "${snapshot_name}/ restored into ${target_name}/ (additive; nothing removed)"
        fi
        restored_any=yes
    done

    if [[ "$restored_any" == "no" ]]; then
        warn "snapshot holds no document trees -- skipping"
        warn "documents are mirrored weekly; an older snapshot will have them"
    fi
fi

# ─── Permissions ─────────────────────────────────────────────────────────────

step "Rebuilding permissions"
# The step a hand-run restore forgets. Files copied by root are owned by root,
# the service starts fine, and then every read fails with EACCES -- which looks
# like corruption rather than a chown.
if id -u "$OWLLEX_USER" >/dev/null 2>&1; then
    shared=()
    for dir in faiss sqlite lmdb legal_corpus documents; do
        [[ -d "${DATA_ROOT}/${dir}" ]] && shared+=("${DATA_ROOT}/${dir}")
    done
    if (( ${#shared[@]} )); then
        run chown -R "${OWLLEX_USER}:${OWLLEX_USER}" "${shared[@]}"
        run chmod -R u=rwX,g=rX,o= "${shared[@]}"
    fi

    # The private trees get u=rwX,go= -- not group-readable like the corpus.
    # rsync -a preserves the modes in the snapshot, but a snapshot taken before
    # this rule existed, or one copied through a filesystem that does not carry
    # them, would restore a client's documents as group-readable. Setting them
    # here means a restore cannot be the thing that loosens them.
    private=()
    for dir in users private; do
        [[ -d "${DATA_ROOT}/${dir}" ]] && private+=("${DATA_ROOT}/${dir}")
    done
    if (( ${#private[@]} )); then
        run chown -R "${OWLLEX_USER}:${OWLLEX_USER}" "${private[@]}"
        run chmod -R u=rwX,go= "${private[@]}"
    fi

    ok "owned by ${OWLLEX_USER}; user documents readable only by that account"
else
    warn "user ${OWLLEX_USER} does not exist -- ownership NOT set"
fi

# ─── Done ────────────────────────────────────────────────────────────────────

if (( $(ls -A "$ROLLBACK" 2>/dev/null | wc -l) == 0 )); then
    run rmdir "$ROLLBACK" 2>/dev/null || true
fi

cat <<SUMMARY

${BOLD}Restore complete.${RESET}  snapshot: ${SNAPSHOT}

  Previous state: ${ROLLBACK}
                  (delete once you have confirmed the restore is good)

${BOLD}Verify before trusting it:${RESET}

  curl -s localhost:8000/health/sqlite  | jq .
  curl -s localhost:8000/health/vector  | jq .
  curl -s localhost:8000/health/storage | jq .

If /health/vector reports drift between SQLite and FAISS, reconcile with:

  sudo -u ${OWLLEX_USER} ${APP_ROOT:-/opt/owllex}/backend/.venv/bin/python \\
       -m rag.scripts.rebuild_index

SUMMARY
