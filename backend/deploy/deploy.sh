#!/usr/bin/env bash
#
# Owllex production deployment for Ubuntu 24.04 (Hetzner).
#
# Turns a fresh box into a running deployment:
#
#   sudo OWLLEX_DOMAIN=api.owllex.example DATA_DEVICE=/dev/sdb ./deploy.sh
#
# Idempotent: safe to re-run after a config change, a code update, or a partial
# failure. Every step checks the state it intends to create before creating it,
# so a second run reports "already done" rather than clobbering anything.
#
# ── What it will NOT do ─────────────────────────────────────────────────────
# It never formats a disk unless you pass FORMAT_DATA_DEVICE=yes, and even then
# only after confirming the device has no filesystem. Losing a corpus volume to
# a deploy script is not a recoverable mistake, so the default is to refuse and
# tell you what to run.
#
# It does not set up a two-volume, HDD+SSD split host on its own -- it mounts
# and provisions exactly one volume, at DATA_ROOT. For that layout: run this
# once as usual, mount the second volume yourself, then set HDD_DATA_ROOT and
# SSD_DATA_ROOT in .env (rag/core/config.py resolves them, both falling back
# to DATA_ROOT) and re-run this script -- idempotent, so it only re-renders
# the systemd units (step 9) against the roots now in .env, moving nothing.
#
# ── Environment ─────────────────────────────────────────────────────────────
#   OWLLEX_DOMAIN         hostname for the nginx vhost      (default: api.owllex.example)
#   DATA_DEVICE           block device to mount at /data    (default: autodetect, else skip)
#   FORMAT_DATA_DEVICE    "yes" to mkfs an EMPTY device     (default: no)
#   APP_ROOT              application checkout              (default: /opt/owllex)
#   DATA_ROOT             persistent storage mount point    (default: /data)
#   OWLLEX_USER           service account                   (default: owllex)
#   REPO_URL / REPO_REF   git source, if APP_ROOT is empty
#   PYTHON_EXTRAS         uv extras to install              (default: rag,embeddings)
#   SKIP_NODE             "yes" to skip the scraper toolchain
#
# HDD_DATA_ROOT / SSD_DATA_ROOT are not accepted as deploy.sh environment
# variables -- set them in .env directly (see above) once the second volume is
# mounted by hand; this script only reads them back out of .env to render the
# systemd units correctly (PRODUCTION_TODO.md T4b).
#
set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────

OWLLEX_USER="${OWLLEX_USER:-owllex}"
APP_ROOT="${APP_ROOT:-/opt/owllex}"
DATA_ROOT="${DATA_ROOT:-/data}"
LOG_ROOT="${LOG_ROOT:-/var/log/owllex}"
OWLLEX_DOMAIN="${OWLLEX_DOMAIN:-api.owllex.example}"
BACKEND_DIR="${APP_ROOT}/backend"
DEPLOY_DIR="${BACKEND_DIR}/deploy"
PYTHON_EXTRAS="${PYTHON_EXTRAS:-rag,embeddings}"
REPO_URL="${REPO_URL:-}"
REPO_REF="${REPO_REF:-main}"
FORMAT_DATA_DEVICE="${FORMAT_DATA_DEVICE:-no}"
SKIP_NODE="${SKIP_NODE:-no}"

# Where the script itself lives, so it can be run from a checkout that is not
# yet at APP_ROOT (the bootstrap case).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─── Output helpers ──────────────────────────────────────────────────────────

if [[ -t 1 ]]; then
    BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RESET=$'\033[0m'
else
    BOLD=""; RED=""; GREEN=""; YELLOW=""; RESET=""
fi

step()  { printf '\n%s==> %s%s\n' "$BOLD" "$*" "$RESET"; }
info()  { printf '    %s\n' "$*"; }
ok()    { printf '    %s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
warn()  { printf '    %s!%s %s\n' "$YELLOW" "$RESET" "$*"; }
die()   { printf '\n%sERROR:%s %s\n\n' "$RED" "$RESET" "$*" >&2; exit 1; }

trap 'die "failed at line $LINENO. The script is idempotent -- fix the cause and re-run."' ERR

# ─── 0. Preflight ────────────────────────────────────────────────────────────

[[ $EUID -eq 0 ]] || die "must run as root (sudo ./deploy.sh)"

step "Preflight"
if [[ -r /etc/os-release ]]; then
    . /etc/os-release
    info "OS: ${PRETTY_NAME:-unknown}"
    [[ "${ID:-}" == "ubuntu" ]] || warn "written for Ubuntu; ${ID:-unknown} may differ"
fi
info "Domain:    ${OWLLEX_DOMAIN}"
info "App root:  ${APP_ROOT}   (system SSD: code, venv, nginx)"
info "Data root: ${DATA_ROOT}  (mounted volume: legal_corpus, users, faiss, sqlite, lmdb, backups)"

total_ram_gb=$(( $(awk '/MemTotal/ {print $2}' /proc/meminfo) / 1024 / 1024 ))
info "RAM:       ${total_ram_gb}GB"
if (( total_ram_gb < 16 )); then
    warn "Under 16GB. The default EMBED_MODEL (qwen3-embedding-8b) needs ~16GB resident."
    warn "Set EMBED_MODEL=qwen3-embedding-0.6b in .env, or the service will be OOM-killed."
fi

# ─── 1. System packages ──────────────────────────────────────────────────────

step "1/10 Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends \
    build-essential ca-certificates curl git \
    python3 python3-venv python3-dev \
    nginx \
    rsync \
    sqlite3 \
    ghostscript \
    logrotate \
    ufw fail2ban \
    jq unzip \
    > /dev/null
ok "packages installed (nginx, rsync, ghostscript, sqlite3, ufw, fail2ban)"
info "ghostscript backs the PDF recompression in rag/app/ingest/compress.py"
info "rsync is what makes the document backup incremental -- see rag/core/backup.py"

# ─── 2. Service account ──────────────────────────────────────────────────────

step "2/10 Creating the ${OWLLEX_USER} service account"
if id -u "$OWLLEX_USER" >/dev/null 2>&1; then
    ok "user ${OWLLEX_USER} already exists"
else
    # System account, no login shell, no home on the SSD it does not need.
    # The application must never run as root: a parser bug in a file downloaded
    # from a court website should not be a root compromise.
    useradd --system --create-home --home-dir "/var/lib/${OWLLEX_USER}" \
            --shell /usr/sbin/nologin "$OWLLEX_USER"
    ok "created system user ${OWLLEX_USER} (no shell, no login)"
fi

# ─── 3. Application root on the SSD ──────────────────────────────────────────

step "3/10 Preparing ${APP_ROOT}"
mkdir -p "$APP_ROOT"
if [[ -d "${BACKEND_DIR}/.git" || -d "${APP_ROOT}/.git" ]]; then
    ok "existing checkout at ${APP_ROOT}"
    if [[ -n "$REPO_URL" ]]; then
        info "updating to ${REPO_REF}"
        git -C "$APP_ROOT" fetch --quiet origin "$REPO_REF"
        git -C "$APP_ROOT" checkout --quiet "$REPO_REF"
        git -C "$APP_ROOT" reset --hard --quiet "origin/${REPO_REF}"
    fi
elif [[ -n "$REPO_URL" ]]; then
    info "cloning ${REPO_URL} (${REPO_REF})"
    git clone --quiet --branch "$REPO_REF" "$REPO_URL" "$APP_ROOT"
    ok "cloned into ${APP_ROOT}"
elif [[ "$SCRIPT_DIR" != "$DEPLOY_DIR" ]]; then
    # Running from a checkout somewhere else (e.g. /root/Owllex/backend/deploy).
    # Copy it into place rather than demanding a git remote.
    info "copying this checkout into ${APP_ROOT}"
    rsync -a --exclude '.venv' --exclude 'node_modules' --exclude '.next' \
          "$(cd "${SCRIPT_DIR}/../.." && pwd)/" "${APP_ROOT}/"
    ok "copied to ${APP_ROOT}"
else
    ok "already running from ${APP_ROOT}"
fi
[[ -f "${BACKEND_DIR}/pyproject.toml" ]] || die "${BACKEND_DIR}/pyproject.toml not found -- set REPO_URL or run this from a checkout"

# ─── 4. Data volume ──────────────────────────────────────────────────────────

step "4/10 Mounting the data volume at ${DATA_ROOT}"
mkdir -p "$DATA_ROOT"

mount_device() {
    local device="$1"
    local fstype
    fstype="$(blkid -o value -s TYPE "$device" 2>/dev/null || true)"

    if [[ -z "$fstype" ]]; then
        if [[ "$FORMAT_DATA_DEVICE" == "yes" ]]; then
            warn "formatting ${device} as ext4 (FORMAT_DATA_DEVICE=yes)"
            # ext4 over xfs for the ability to shrink, and -m 1 because the
            # default 5% reserve on a multi-TB volume is tens of gigabytes held
            # back for a root user that never writes here.
            mkfs.ext4 -q -m 1 -L owllex-data "$device"
            fstype="ext4"
            ok "formatted ${device}"
        else
            die "${device} has no filesystem. Refusing to format it.
    If this device is genuinely empty and yours to erase, re-run with:
        sudo FORMAT_DATA_DEVICE=yes DATA_DEVICE=${device} ./deploy.sh
    If it already holds the corpus, mount it manually and re-run without DATA_DEVICE."
        fi
    fi

    local uuid
    uuid="$(blkid -o value -s UUID "$device")"
    [[ -n "$uuid" ]] || die "could not read a UUID from ${device}"

    # By UUID, never by /dev/sdb: device names are assigned in discovery order
    # and can change across a reboot or an added volume. A corpus volume that
    # silently swaps places with a scratch disk is a very bad morning.
    if ! grep -q "UUID=${uuid}" /etc/fstab; then
        printf 'UUID=%s  %s  %s  defaults,noatime,nofail  0  2\n' \
            "$uuid" "$DATA_ROOT" "$fstype" >> /etc/fstab
        ok "added ${DATA_ROOT} to /etc/fstab by UUID"
        info "noatime: no metadata write per PDF read. nofail: a missing volume"
        info "does not drop the box to an emergency shell you cannot SSH into --"
        info "the systemd units' RequiresMountsFor catches it instead."
    fi

    mountpoint -q "$DATA_ROOT" || mount "$DATA_ROOT"
}

if mountpoint -q "$DATA_ROOT"; then
    ok "${DATA_ROOT} is already a mount point"
else
    device="${DATA_DEVICE:-}"
    if [[ -z "$device" ]]; then
        # Hetzner attaches volumes with a stable by-id path. Pick one only if it
        # is unambiguous; guessing between two disks is not acceptable here.
        mapfile -t candidates < <(ls /dev/disk/by-id/scsi-0HC_Volume_* 2>/dev/null || true)
        if (( ${#candidates[@]} == 1 )); then
            device="${candidates[0]}"
            info "autodetected Hetzner volume: ${device}"
        fi
    fi

    if [[ -n "$device" ]]; then
        [[ -b "$device" || -L "$device" ]] || die "${device} is not a block device"
        mount_device "$device"
        ok "mounted ${DATA_ROOT}"
    else
        warn "No separate volume mounted at ${DATA_ROOT}."
        warn "The deployment will work, but documents, FAISS and SQLite will live"
        warn "on the system disk -- which is the one thing this layout exists to"
        warn "prevent. Re-run with DATA_DEVICE=/dev/… once the volume is attached."
        warn "/health/storage will report this as a warning until it is fixed."
    fi
fi

# ─── 5. Storage layout ───────────────────────────────────────────────────────

step "5/10 Creating the storage layout"
# These mirror RagConfig.managed_dirs in rag/core/config.py. Creating them here
# too means correct ownership from the first boot rather than whatever the first
# process to touch them happened to have.
for dir in \
    "${DATA_ROOT}" \
    "${DATA_ROOT}/legal_corpus" \
    "${DATA_ROOT}/legal_corpus/sci" \
    "${DATA_ROOT}/legal_corpus/hc" \
    "${DATA_ROOT}/legal_corpus/hc/delhi" \
    "${DATA_ROOT}/legal_corpus/hc/bombay" \
    "${DATA_ROOT}/legal_corpus/hc/madras" \
    "${DATA_ROOT}/legal_corpus/tribunal" \
    "${DATA_ROOT}/users" \
    "${DATA_ROOT}/faiss" \
    "${DATA_ROOT}/sqlite" \
    "${DATA_ROOT}/lmdb" \
    "${DATA_ROOT}/backups" \
    "${DATA_ROOT}/private" \
    "${DATA_ROOT}/inbox" \
    "${DATA_ROOT}/models" \
    "${DATA_ROOT}/tmp/uploads" \
    "${LOG_ROOT}" \
    "${LOG_ROOT}/nginx"
do
    mkdir -p "$dir"
done

chown -R "${OWLLEX_USER}:${OWLLEX_USER}" "$DATA_ROOT"
# 0750: the service account reads and writes, nobody else on the box can read
# the corpus. These are court documents and user uploads, not public files.
chmod 750 "$DATA_ROOT"
find "$DATA_ROOT" -maxdepth 1 -mindepth 1 -type d -exec chmod 750 {} +

# The two trees holding user files are 0700, not 0750: nothing else on this box,
# including anything running as the service account's group, has any reason to
# read a client's affidavit. The application re-applies this on every boot (see
# ensure_directories in rag/core/config.py) and /health/storage reports DEGRADED
# if it ever finds them loosened, so a restore that drops permissions is visible
# rather than silent.
chmod 700 "${DATA_ROOT}/users" "${DATA_ROOT}/private"

chown -R "${OWLLEX_USER}:${OWLLEX_USER}" "$LOG_ROOT"
chmod 755 "$LOG_ROOT"
# nginx runs as www-data and needs to write its own logs into the subdirectory.
chown -R www-data:adm "${LOG_ROOT}/nginx"
chmod 755 "${LOG_ROOT}/nginx"

# The code is owned by root and only read by the service account: a compromised
# application process cannot rewrite its own code or its systemd unit.
chown -R root:"${OWLLEX_USER}" "$APP_ROOT"
chmod -R g+rX,o-rwx "$APP_ROOT"
ok "layout created under ${DATA_ROOT}, owned by ${OWLLEX_USER}"
ok "logs at ${LOG_ROOT}, code at ${APP_ROOT} (root-owned, group-readable)"

# ─── 6. Python environment ───────────────────────────────────────────────────

step "6/10 Installing Python packages"
UV_BIN="/usr/local/bin/uv"
if [[ ! -x "$UV_BIN" ]]; then
    info "installing uv"
    curl -LsSf https://astral.sh/uv/install.sh | UV_INSTALL_DIR=/usr/local/bin sh > /dev/null
fi
ok "uv $("$UV_BIN" --version | awk '{print $2}')"

cd "$BACKEND_DIR"
extras_args=()
IFS=',' read -ra extras <<< "$PYTHON_EXTRAS"
for extra in "${extras[@]}"; do
    [[ -n "$extra" ]] && extras_args+=(--extra "$extra")
done

info "uv sync ${extras_args[*]} (torch and the Docling models are multi-GB; this is slow)"
"$UV_BIN" sync --frozen "${extras_args[@]}"
chown -R root:"${OWLLEX_USER}" "${BACKEND_DIR}/.venv"
chmod -R g+rX "${BACKEND_DIR}/.venv"
ok "virtualenv ready at ${BACKEND_DIR}/.venv"

# ─── 7. Node toolchain (scrapers) ────────────────────────────────────────────

step "7/10 Installing Node packages"
if [[ "$SKIP_NODE" == "yes" ]]; then
    warn "skipped (SKIP_NODE=yes)"
elif [[ -f "${APP_ROOT}/package.json" ]]; then
    if ! command -v node >/dev/null 2>&1; then
        info "installing Node.js 22 LTS"
        curl -fsSL https://deb.nodesource.com/setup_22.x | bash - > /dev/null 2>&1
        apt-get install -y -qq nodejs > /dev/null
    fi
    ok "node $(node --version)"
    info "npm ci (scraper toolchain: tsx, the India Code and SCI downloaders)"
    ( cd "$APP_ROOT" && npm ci --omit=dev --silent ) || warn "npm ci failed; scrapers unavailable"
    chown -R root:"${OWLLEX_USER}" "${APP_ROOT}/node_modules" 2>/dev/null || true
else
    warn "no package.json at ${APP_ROOT}; skipping"
fi

# ─── 8. Environment file ─────────────────────────────────────────────────────

step "8/10 Configuring ${BACKEND_DIR}/.env"
ENV_FILE="${BACKEND_DIR}/.env"
if [[ -f "$ENV_FILE" ]]; then
    ok ".env already exists (left untouched)"
else
    cp "${BACKEND_DIR}/.env.example" "$ENV_FILE"
    # Generate the internal token rather than shipping a placeholder someone
    # forgets to replace.
    token="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
    sed -i "s|^RAVENSLAW_INTERNAL_TOKEN=.*|RAVENSLAW_INTERNAL_TOKEN=${token}|" "$ENV_FILE"
    sed -i "s|^RAVENSLAW_TRUSTED_HOSTS=.*|RAVENSLAW_TRUSTED_HOSTS=${OWLLEX_DOMAIN},localhost,127.0.0.1|" "$ENV_FILE"
    sed -i "s|^DATA_ROOT=.*|DATA_ROOT=${DATA_ROOT}|" "$ENV_FILE"
    ok "created .env with a generated RAVENSLAW_INTERNAL_TOKEN"
    warn "STILL REQUIRED before the API will start:"
    warn "  RAVENSLAW_CORS_ORIGINS=https://your-frontend  (HTTPS, no wildcard)"
    warn "  CLERK_JWT_ISSUER=…"
fi

# The nightly backup runs as a systemd timer, so the in-process APScheduler job
# must be off -- otherwise two processes write the same snapshot directory.
if grep -q '^BACKUP_ENABLED=true' "$ENV_FILE"; then
    sed -i 's|^BACKUP_ENABLED=true|BACKUP_ENABLED=false|' "$ENV_FILE"
    info "set BACKUP_ENABLED=false (owllex-backup.timer owns the schedule now)"
fi

# .env holds the internal token and database credentials.
chown root:"${OWLLEX_USER}" "$ENV_FILE"
chmod 640 "$ENV_FILE"
ok ".env is 0640 root:${OWLLEX_USER}"

# ─── 9. nginx, logrotate, systemd ────────────────────────────────────────────

step "9/10 Installing nginx, logrotate and systemd units"

install -d /var/www/certbot

# Bootstrap TLS certificate. nginx will not load a `listen 443 ssl` server
# without one, and without the vhost loaded there is no port-80 ACME challenge
# location -- so certbot could never issue the real certificate. This
# placeholder breaks that circular dependency; certbot replaces it in step 2.
install -d -m 700 /etc/ssl/owllex
if [[ ! -f /etc/ssl/owllex/bootstrap.crt ]]; then
    openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
        -keyout /etc/ssl/owllex/bootstrap.key \
        -out /etc/ssl/owllex/bootstrap.crt \
        -subj "/CN=${OWLLEX_DOMAIN}" >/dev/null 2>&1
    chmod 600 /etc/ssl/owllex/bootstrap.key
    chmod 644 /etc/ssl/owllex/bootstrap.crt
    ok "generated a bootstrap self-signed certificate"
    warn "It is NOT trusted by browsers. Run certbot (step 2 below) before going live."
else
    ok "bootstrap certificate already present"
fi

cat > /etc/nginx/conf.d/owllex-limits.conf <<'LIMITS'
# Rate-limit zones for the Owllex vhost. These must live at http scope, which is
# why they are here rather than in sites-available/owllex.
limit_req_zone $binary_remote_addr zone=owllex_api:10m rate=20r/s;
limit_conn_zone $binary_remote_addr zone=owllex_conn:10m;
LIMITS

sed "s/api\.owllex\.example/${OWLLEX_DOMAIN}/g" \
    "${DEPLOY_DIR}/nginx/owllex.conf" > /etc/nginx/sites-available/owllex
ln -sf /etc/nginx/sites-available/owllex /etc/nginx/sites-enabled/owllex
rm -f /etc/nginx/sites-enabled/default
ok "nginx vhost installed for ${OWLLEX_DOMAIN}"

if nginx -t 2>/dev/null; then
    systemctl reload nginx
    ok "nginx configuration valid and reloaded"
else
    nginx -t || true
    warn "nginx config test failed -- the vhost is installed but NOT loaded. Fix and: systemctl reload nginx"
fi

cp "${DEPLOY_DIR}/logrotate/owllex" /etc/logrotate.d/owllex
chmod 644 /etc/logrotate.d/owllex
ok "logrotate installed"

# Read a KEY=value straight out of .env, honouring the last assignment (same
# as systemd's own EnvironmentFile= parsing and python-dotenv's) and falling
# back to $2 when unset or blank there. PRODUCTION_TODO.md T4b: an operator
# who splits storage across two volumes does it by editing .env, and the
# rendered units below have to reflect *that*, not this script's own
# single-DATA_ROOT variable -- which reflects only what deploy.sh itself was
# invoked with, and goes stale the moment .env is hand-edited afterward. This
# script is meant to be re-run after such an edit (see its own header), which
# is exactly when this needs to read the file rather than its memory of it.
env_file_value() {
    local key="$1" default="$2" value
    value="$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -n1 | cut -d= -f2-)"
    printf '%s' "${value:-$default}"
}

data_root_in_env="$(env_file_value DATA_ROOT "$DATA_ROOT")"
hdd_root_for_units="$(env_file_value HDD_DATA_ROOT "$data_root_in_env")"
ssd_root_for_units="$(env_file_value SSD_DATA_ROOT "$data_root_in_env")"

# Both tiers on one line each, deduplicated -- on the common, unsplit host
# this collapses to one path (unchanged from before this task), and on a
# split host it lists both, which is what makes a host that starts with only
# one of the two mounted still refuse to start (rather than come up "healthy"
# against an empty directory on the boot SSD for whichever tier is missing).
unit_data_roots="$hdd_root_for_units"
[[ "$ssd_root_for_units" != "$hdd_root_for_units" ]] && unit_data_roots="${unit_data_roots} ${ssd_root_for_units}"

if [[ "$hdd_root_for_units" != "$ssd_root_for_units" ]]; then
    info "split storage detected in .env: HDD_DATA_ROOT=${hdd_root_for_units} SSD_DATA_ROOT=${ssd_root_for_units}"
    info "rendering systemd units with both roots in RequiresMountsFor=/ReadWritePaths="
fi

for unit in owllex-rag.service owllex-ingest.service owllex-backup.service owllex-backup.timer; do
    # Rewrite the paths so a non-default APP_ROOT, or HDD_DATA_ROOT/
    # SSD_DATA_ROOT split in .env, still produces correct units, rather than
    # files that silently point at /opt/owllex or a single /data.
    sed -e "s|/opt/owllex|${APP_ROOT}|g" \
        -e "s|RequiresMountsFor=/data|RequiresMountsFor=${unit_data_roots}|" \
        -e "s|ReadWritePaths=/data |ReadWritePaths=${unit_data_roots} |" \
        -e "s|HF_HOME=/data/models|HF_HOME=${hdd_root_for_units}/models|" \
        -e "s|^User=owllex$|User=${OWLLEX_USER}|" \
        -e "s|^Group=owllex$|Group=${OWLLEX_USER}|" \
        "${DEPLOY_DIR}/systemd/${unit}" > "/etc/systemd/system/${unit}"
    chmod 644 "/etc/systemd/system/${unit}"
done
systemctl daemon-reload
ok "systemd units installed"

# ─── 10. Enable and start ────────────────────────────────────────────────────

step "10/10 Enabling and starting services"
systemctl enable --now owllex-rag.service
ok "owllex-rag enabled and started"

systemctl enable --now owllex-backup.timer
ok "owllex-backup.timer enabled (next run: $(systemctl show -p NextElapseUSecRealtime --value owllex-backup.timer 2>/dev/null || echo '03:30'))"

# The ingest worker is enabled but only does anything when files appear in the
# inbox, so starting it here costs nothing and means a corpus drop just works.
systemctl enable --now owllex-ingest.service
ok "owllex-ingest enabled and watching ${DATA_ROOT}/inbox"

# ─── Verification ────────────────────────────────────────────────────────────

step "Verifying"
info "waiting for the API to answer (cold start loads the embedding model)…"
for _ in $(seq 1 60); do
    if curl -fsS --max-time 5 http://127.0.0.1:8000/health >/dev/null 2>&1; then
        ok "API is answering on 127.0.0.1:8000"
        break
    fi
    sleep 5
done

if curl -fsS --max-time 5 http://127.0.0.1:8000/health >/dev/null 2>&1; then
    curl -fsS http://127.0.0.1:8000/health | jq . 2>/dev/null || true
    echo
    for endpoint in storage sqlite lmdb vector; do
        code=$(curl -o /dev/null -s -w '%{http_code}' "http://127.0.0.1:8000/health/${endpoint}")
        if [[ "$code" == "200" ]]; then
            ok "/health/${endpoint} -> ${code}"
        else
            warn "/health/${endpoint} -> ${code}  (curl -s http://127.0.0.1:8000/health/${endpoint} | jq .)"
        fi
    done
else
    warn "API did not answer within 5 minutes."
    warn "This is often a missing RAVENSLAW_CORS_ORIGINS in .env -- config.py refuses"
    warn "to boot in production without it. Check: journalctl -u owllex-rag -n 50"
fi

cat <<SUMMARY

${BOLD}Deployment complete.${RESET}

  Code       ${APP_ROOT}                (system SSD)
  Data       ${DATA_ROOT}               (mounted volume)
  Logs       ${LOG_ROOT}
  Config     ${ENV_FILE}

${BOLD}Remaining steps:${RESET}

  1. Finish ${ENV_FILE} -- RAVENSLAW_CORS_ORIGINS and CLERK_JWT_ISSUER are
     required, then:  systemctl restart owllex-rag

  2. Issue the TLS certificate:
       certbot --nginx -d ${OWLLEX_DOMAIN}

  3. Harden the box (UFW, SSH, Fail2Ban):
       ${DEPLOY_DIR}/harden.sh

  4. Point the Cloudflare Worker at this host:
       wrangler secret put VPS_ORIGIN     # https://${OWLLEX_DOMAIN}

${BOLD}Everyday commands:${RESET}

  systemctl status owllex-rag owllex-ingest
  journalctl -u owllex-rag -f
  curl -s localhost:8000/health/storage | jq .
  cp -r judgments/. ${DATA_ROOT}/inbox/sci/     # bulk ingest
  systemctl start owllex-backup                 # backup now

SUMMARY
