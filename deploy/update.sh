#!/usr/bin/env bash
# Manual "pull latest and redeploy" script for the VPS. GitHub Actions
# (.github/workflows/deploy.yml) already does the build+restart part of this
# automatically on every push to main — use this script when you want to:
#   - trigger an update by hand instead of waiting on/without CI, or
#   - (re-)register the PTZ Telegram webhook, e.g. after first setting
#     PTZ_BOT_TOKEN / PTZ_BOT_WEBHOOK_SECRET, or after rotating the secret.
#
# Run on the VPS as a user that can sudo, e.g.:
#   cd /var/www/hazorasp-textil && sudo bash deploy/update.sh
set -euo pipefail

APP_DIR=/var/www/hazorasp-textil
BRANCH="${BRANCH:-main}"

cd "$APP_DIR"

echo "==> Checking Node version (node:sqlite needs >= 22.5)..."
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
NODE_MINOR=$(node -p 'process.versions.node.split(".")[1]')
if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 5 ]; }; then
  echo "!! Node $(node -v) is too old for the PTZ Analytics module (needs >= 22.5)."
  echo "!! Upgrade it first, e.g.:"
  echo "!!   curl -fsSL https://deb.nodesource.com/setup_24.x | sudo bash -"
  echo "!!   sudo apt-get install -y nodejs"
  exit 1
fi

echo "==> Fetching latest $BRANCH..."
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "==> Installing dependencies..."
SHARP_FORCE_GLOBAL_LIBVIPS=1 npm ci --include=optional --ignore-scripts
MAKEFLAGS=-j1 SHARP_FORCE_GLOBAL_LIBVIPS=1 npm rebuild sharp --build-from-source

echo "==> Building..."
NODE_OPTIONS=--max-old-space-size=768 npm run build

echo "==> Restarting service..."
chown -R www-data:www-data "$APP_DIR"
systemctl restart hazorasp-textil

echo "==> Registering the PTZ Telegram webhook (no-op if PTZ_BOT_TOKEN isn't set)..."
if grep -q '^PTZ_BOT_TOKEN=' "$APP_DIR/.env.local" 2>/dev/null; then
  set -a
  # shellcheck disable=SC1091
  source "$APP_DIR/.env.local"
  set +a
  npm run ptz:set-webhook
else
  echo "   PTZ_BOT_TOKEN not found in .env.local — skipping."
fi

echo "==> Done. Tailing recent logs (Ctrl+C to stop):"
journalctl -u hazorasp-textil -n 30 --no-pager
