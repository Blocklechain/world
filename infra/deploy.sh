#!/usr/bin/env bash
# Deploy WORLD to world.blockle.org (144.126.133.21).
# Usage: infra/deploy.sh [--setup]   (--setup: first-time nginx/certbot/systemd)
set -euo pipefail

HOST=root@144.126.133.21
REPO="$(cd "$(dirname "$0")/.." && pwd)"

echo "== building client =="
(cd "$REPO" && pnpm --filter @world/client build)

echo "== syncing files =="
ssh $HOST 'mkdir -p /opt/world/client /opt/world/app'
rsync -az --delete "$REPO/apps/client/dist/" $HOST:/opt/world/client/
rsync -az --delete \
  --exclude node_modules --exclude dist \
  "$REPO/package.json" "$REPO/pnpm-workspace.yaml" "$REPO/pnpm-lock.yaml" "$REPO/tsconfig.base.json" \
  $HOST:/opt/world/app/
rsync -az --delete --exclude node_modules --exclude dist "$REPO/apps/server" $HOST:/opt/world/app/apps/
rsync -az --delete --exclude node_modules "$REPO/packages/" $HOST:/opt/world/app/packages/

echo "== installing server deps =="
ssh $HOST 'cd /opt/world/app && corepack enable >/dev/null 2>&1 || true; corepack pnpm install --filter @world/server --filter @world/shared --prod=false --silent'

if [ "${1:-}" = "--setup" ]; then
  echo "== first-time setup: nginx + certbot + systemd =="
  scp "$REPO/infra/nginx-world.blockle.org.conf" $HOST:/etc/nginx/sites-available/world.blockle.org
  scp "$REPO/infra/world.service" $HOST:/etc/systemd/system/world.service
  ssh $HOST 'ln -sf /etc/nginx/sites-available/world.blockle.org /etc/nginx/sites-enabled/world.blockle.org \
    && nginx -t && systemctl reload nginx \
    && certbot --nginx -d world.blockle.org --non-interactive --agree-tos -m ai@3vdc.com --redirect \
    && systemctl daemon-reload && systemctl enable world'
fi

echo "== restarting game server =="
ssh $HOST 'systemctl restart world && sleep 2 && systemctl is-active world'

echo "== verifying =="
curl -fsS https://world.blockle.org/api/healthz && echo " <- api ok"
curl -fsS -o /dev/null -w "client: %{http_code}\n" https://world.blockle.org/
