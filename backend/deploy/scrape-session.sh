#!/usr/bin/env bash
#
# Gives the SCI scraper a display on a VPS that has none attached.
#
# `sci-judgments/download.ts` launches Chromium with `headless: false` -- headless
# Chromium fails scr.sci.gov.in's bot defence, so a real (if virtual) window is not
# optional. This script starts one with Xvfb, serves it over VNC with x11vnc, and
# bridges that to a plain browser tab with websockify + noVNC, so the operator needs
# nothing on their laptop but an SSH client and a browser -- no VNC client software.
#
# One-time setup, on the VPS:
#     sudo apt-get install -y xvfb x11vnc websockify novnc
#     cd /opt/owllex && npx playwright install --with-deps chromium
#
# Usage, on the VPS:
#     sudo -u owllex ./scrape-session.sh sci:download -- 25
#     sudo -u owllex ./scrape-session.sh sci:inspect
#
# Then from a laptop, in a separate terminal:
#     ssh -L 6080:127.0.0.1:6080 <user>@<this-host>
#     open http://127.0.0.1:6080/vnc.html
#
# Both the VNC and noVNC listeners bind 127.0.0.1 only -- reachable exclusively
# through the SSH tunnel above. NEVER expose 5900 or 6080 publicly: that is an
# unauthenticated remote desktop onto the corpus server.
#
# A CAPTCHA nobody solves does not hang this forever -- download.ts gives up after
# SCRAPE_SOLVE_TIMEOUT_MS (default 15 minutes) and closes its own browser, at which
# point this script's job is done and it exits too.
#
set -euo pipefail

DISPLAY_NUM="${SCRAPE_DISPLAY:-99}"
VNC_PORT="${SCRAPE_VNC_PORT:-5900}"
NOVNC_PORT="${SCRAPE_NOVNC_PORT:-6080}"
NOVNC_WEB="${SCRAPE_NOVNC_WEB:-/usr/share/novnc}"
APP_ROOT="${APP_ROOT:-/opt/owllex}"

if [[ $# -lt 1 || "$1" != sci:* ]]; then
    echo "usage: $0 <sci:download|sci:inspect> [-- args...]" >&2
    exit 1
fi
NPM_SCRIPT="scrape:${1}"
shift

for bin in Xvfb x11vnc websockify; do
    command -v "$bin" >/dev/null 2>&1 || {
        echo "missing '${bin}' -- one-time setup: sudo apt-get install -y xvfb x11vnc websockify novnc" >&2
        exit 1
    }
done
[[ -d "$NOVNC_WEB" ]] || {
    echo "noVNC assets not found at ${NOVNC_WEB} -- one-time setup: sudo apt-get install -y novnc" >&2
    exit 1
}

pids=()
cleanup() {
    for pid in "${pids[@]}"; do
        kill "$pid" >/dev/null 2>&1 || true
    done
}
trap cleanup EXIT

Xvfb ":${DISPLAY_NUM}" -screen 0 1920x1080x24 -nolisten tcp &
pids+=("$!")
sleep 1 # give Xvfb a moment to bind before anything tries to connect to it

x11vnc -display ":${DISPLAY_NUM}" -rfbport "${VNC_PORT}" -localhost -forever -shared -noxdamage -quiet &
pids+=("$!")

websockify --web="${NOVNC_WEB}" "127.0.0.1:${NOVNC_PORT}" "127.0.0.1:${VNC_PORT}" &
pids+=("$!")

echo "==> Session ready."
echo "    From your laptop, in a separate terminal:"
echo "      ssh -L ${NOVNC_PORT}:127.0.0.1:${NOVNC_PORT} \$(whoami)@<this-host>"
echo "      open http://127.0.0.1:${NOVNC_PORT}/vnc.html"
echo

cd "${APP_ROOT}"
DISPLAY=":${DISPLAY_NUM}" npm run "${NPM_SCRIPT}" -- "$@"
