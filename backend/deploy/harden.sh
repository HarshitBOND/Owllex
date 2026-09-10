#!/usr/bin/env bash
#
# Security hardening for the Owllex VPS: UFW, SSH, Fail2Ban, file permissions.
#
#   sudo ./harden.sh
#   sudo SSH_PORT=2222 ./harden.sh
#   sudo ./harden.sh --check          # report only, change nothing
#
# Run this AFTER deploy.sh and after confirming you can log in with a key.
#
# ── Read this before running ────────────────────────────────────────────────
# This disables SSH password authentication. If your only way in is a password,
# you will be locked out of the machine permanently -- Hetzner's rescue console
# is the only way back. The script refuses to proceed unless it can find an
# authorized_keys file with at least one key in it, but verify yourself:
#
#   ssh -o PasswordAuthentication=no you@this-host    # must succeed first
#
set -euo pipefail

SSH_PORT="${SSH_PORT:-22}"
OWLLEX_USER="${OWLLEX_USER:-owllex}"
DATA_ROOT="${DATA_ROOT:-/data}"
APP_ROOT="${APP_ROOT:-/opt/owllex}"
CHECK_ONLY=no

[[ "${1:-}" == "--check" ]] && CHECK_ONLY=yes

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

[[ $EUID -eq 0 ]] || die "must run as root"

# ─── 1. SSH keys must exist before we disable passwords ──────────────────────

step "1/5 Checking for SSH keys"
key_count=0
while IFS= read -r keyfile; do
    [[ -s "$keyfile" ]] || continue
    count=$(grep -cE '^(ssh-|ecdsa-|sk-)' "$keyfile" 2>/dev/null || echo 0)
    (( count > 0 )) && info "$(printf '%d key(s) in %s' "$count" "$keyfile")"
    key_count=$(( key_count + count ))
done < <(find /root/.ssh /home/*/.ssh -maxdepth 1 -name authorized_keys 2>/dev/null)

if (( key_count == 0 )); then
    die "No SSH public keys found in any authorized_keys file.
    Disabling password authentication now would lock you out of this machine.
    Add your key first:
        ssh-copy-id root@this-host
    then re-run."
fi
ok "${key_count} authorised key(s) found -- safe to disable passwords"

# ─── 2. UFW ──────────────────────────────────────────────────────────────────

step "2/5 Configuring the firewall (UFW)"
if [[ "$CHECK_ONLY" == "yes" ]]; then
    ufw status verbose || true
else
    # Order matters: allow SSH *before* enabling, or `ufw enable` cuts the
    # session that is running this script.
    ufw --force reset > /dev/null
    ufw default deny incoming > /dev/null
    ufw default allow outgoing > /dev/null

    ufw allow "${SSH_PORT}/tcp" comment 'SSH' > /dev/null
    ok "allowed ${SSH_PORT}/tcp (SSH)"

    ufw allow 80/tcp  comment 'HTTP (ACME challenge + redirect)' > /dev/null
    ufw allow 443/tcp comment 'HTTPS' > /dev/null
    ok "allowed 80/tcp and 443/tcp"

    # Port 8000 is deliberately absent. gunicorn binds 127.0.0.1 only, so the
    # API is reachable exclusively through nginx and its TLS, rate limits and
    # /health/* restrictions. Opening 8000 would route around all of that.
    info "8000 (gunicorn) intentionally NOT opened -- it is localhost-only behind nginx"

    ufw --force enable > /dev/null
    ok "UFW enabled, default-deny inbound"
fi

# ─── 3. SSH hardening ────────────────────────────────────────────────────────

step "3/5 Hardening SSH"
SSHD_DROPIN=/etc/ssh/sshd_config.d/99-owllex-hardening.conf
if [[ "$CHECK_ONLY" == "yes" ]]; then
    sshd -T 2>/dev/null | grep -E '^(permitrootlogin|passwordauthentication|port|x11forwarding)' || true
else
    # A drop-in rather than edits to sshd_config: package upgrades rewrite the
    # main file and would silently revert hardening done in place.
    mkdir -p /etc/ssh/sshd_config.d
    cat > "$SSHD_DROPIN" <<SSHEOF
# Owllex SSH hardening. Installed by deploy/harden.sh.
Port ${SSH_PORT}

# Key-only. Password auth on a public-IP box is a brute-force target from the
# moment it boots; the logs on any Hetzner IP show that within minutes.
PasswordAuthentication no
PermitEmptyPasswords no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes

# prohibit-password rather than "no": automation and the rescue path may still
# need root over a key, and a locked-out box is a worse outcome than a
# key-authenticated root login.
PermitRootLogin prohibit-password

# Nothing here needs a display or a tunnel.
X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding no

# Drop idle and half-open sessions.
ClientAliveInterval 300
ClientAliveCountMax 2
LoginGraceTime 30
MaxAuthTries 3
MaxSessions 10

UsePAM yes
SSHEOF
    chmod 644 "$SSHD_DROPIN"

    # Validate before reloading. An invalid config plus a reload is a machine
    # that cannot be logged into.
    if sshd -t; then
        systemctl reload ssh 2>/dev/null || systemctl reload sshd
        ok "SSH hardened (key-only, port ${SSH_PORT}) and reloaded"
        warn "Do NOT close this session until you have opened a second one and"
        warn "confirmed you can still log in."
    else
        rm -f "$SSHD_DROPIN"
        die "sshd rejected the configuration; reverted, nothing changed"
    fi
fi

# ─── 4. Fail2Ban ─────────────────────────────────────────────────────────────

step "4/5 Configuring Fail2Ban"
if [[ "$CHECK_ONLY" == "yes" ]]; then
    fail2ban-client status 2>/dev/null || warn "fail2ban not running"
else
    # jail.local, not jail.conf: jail.conf is package-owned and replaced on
    # upgrade.
    cat > /etc/fail2ban/jail.local <<'F2BEOF'
# Owllex Fail2Ban jails. Installed by deploy/harden.sh.

[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
# Ban at the firewall rather than in iptables directly, so bans survive a UFW
# reload and are visible in `ufw status`.
banaction = ufw
backend = systemd
# Never lock yourself out from the box itself.
ignoreip = 127.0.0.1/8 ::1

[sshd]
enabled = true
mode = aggressive
# SSH is the account-takeover path. A day is not punitive for an IP that has
# already failed three key-only logins.
bantime = 24h
maxretry = 3

[nginx-http-auth]
enabled = true
logpath = /var/log/owllex/nginx/error.log

[nginx-bad-request]
enabled = true
logpath = /var/log/owllex/nginx/access.log

# Backs up nginx's own limit_req: rate limiting returns 503s, this bans the
# client that keeps triggering them so the box stops spending CPU on it.
[nginx-limit-req]
enabled = true
logpath = /var/log/owllex/nginx/error.log
maxretry = 20
findtime = 5m
bantime = 2h
F2BEOF
    systemctl enable fail2ban > /dev/null 2>&1 || true
    systemctl restart fail2ban
    sleep 2
    ok "Fail2Ban active: $(fail2ban-client status 2>/dev/null | grep 'Jail list' | cut -d: -f2- | xargs || echo 'starting')"
fi

# ─── 5. File permissions ─────────────────────────────────────────────────────

step "5/5 Verifying file permissions"

check_perm() {
    local path="$1" expect_owner="$2" expect_mode="$3"
    [[ -e "$path" ]] || { warn "$path does not exist"; return; }
    local owner mode
    owner="$(stat -c '%U:%G' "$path")"
    mode="$(stat -c '%a' "$path")"
    if [[ "$owner" == "$expect_owner" && "$mode" == "$expect_mode" ]]; then
        ok "$(printf '%-34s %s %s' "$path" "$owner" "$mode")"
    else
        warn "$(printf '%-34s %s %s  (expected %s %s)' "$path" "$owner" "$mode" "$expect_owner" "$expect_mode")"
        if [[ "$CHECK_ONLY" != "yes" ]]; then
            chown "$expect_owner" "$path"
            chmod "$expect_mode" "$path"
            info "  fixed"
        fi
    fi
}

# .env holds RAVENSLAW_INTERNAL_TOKEN and the Mongo URI. Root-owned so the
# application cannot rewrite its own credentials; group-readable so it can read
# them. 0640 is the whole point.
check_perm "${APP_ROOT}/backend/.env" "root:${OWLLEX_USER}" 640
check_perm "${DATA_ROOT}"             "${OWLLEX_USER}:${OWLLEX_USER}" 750
check_perm "${DATA_ROOT}/documents"   "${OWLLEX_USER}:${OWLLEX_USER}" 750
check_perm "${DATA_ROOT}/sqlite"      "${OWLLEX_USER}:${OWLLEX_USER}" 750
check_perm "${DATA_ROOT}/private"     "${OWLLEX_USER}:${OWLLEX_USER}" 750

step "Confirming nothing runs as root"
for unit in owllex-rag owllex-ingest owllex-backup; do
    user="$(systemctl show -p User --value "${unit}.service" 2>/dev/null || true)"
    if [[ -z "$user" ]]; then
        warn "${unit}.service not installed"
    elif [[ "$user" == "root" || "$user" == "" ]]; then
        die "${unit}.service runs as root. Fix the unit before going live."
    else
        ok "${unit}.service runs as ${user}"
    fi
done

cat <<SUMMARY

${BOLD}Hardening complete.${RESET}

  Firewall   deny inbound except ${SSH_PORT}/tcp, 80/tcp, 443/tcp
  SSH        key-only, root login by key only
  Fail2Ban   sshd + nginx jails, banning via UFW
  Services   run as ${OWLLEX_USER}, never root

${BOLD}${YELLOW}Before you close this session:${RESET}
  Open a NEW terminal and confirm you can still SSH in.
  If you cannot, this session is your only way to run:
      rm /etc/ssh/sshd_config.d/99-owllex-hardening.conf && systemctl reload ssh

${BOLD}Audit later with:${RESET}
  ufw status verbose
  fail2ban-client status sshd
  ${APP_ROOT}/backend/deploy/harden.sh --check

SUMMARY
