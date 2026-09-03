#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/var/www/hazorasp-textil
REPO_URL="${REPO_URL:?Set REPO_URL before running this script}"
BRANCH="${BRANCH:-main}"

apt-get update
apt-get install -y git curl nginx

if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

mkdir -p /var/www
if [ ! -d "$APP_DIR/.git" ]; then
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
fi

cd "$APP_DIR"
npm ci
npm run build

chown -R www-data:www-data "$APP_DIR"
install -m 0644 deploy/hazorasp-textil.service /etc/systemd/system/hazorasp-textil.service
install -m 0644 deploy/hazorasp-textil.nginx /etc/nginx/sites-available/hazorasp-textil
ln -sfn /etc/nginx/sites-available/hazorasp-textil /etc/nginx/sites-enabled/hazorasp-textil
rm -f /etc/nginx/sites-enabled/default

systemctl daemon-reload
systemctl enable --now hazorasp-textil
nginx -t
systemctl reload nginx

echo "Setup complete. Create $APP_DIR/.env.local with production secrets before using the admin panel."
