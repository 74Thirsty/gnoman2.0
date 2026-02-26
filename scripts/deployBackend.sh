#!/usr/bin/env bash
set -euo pipefail

repoRoot=$(cd "$(dirname "$0")/.." && pwd)
cd "$repoRoot"

echo "=== Pull latest ==="
git fetch --all
git reset --hard origin/main

echo "=== Install deps ==="
npm ci

echo "=== Test backend ==="
npm run test:backend

echo "=== Build backend ==="
npm run build:backend

echo "=== Restart backend service ==="
sudo systemctl restart gnoman-backend
sudo systemctl status gnoman-backend --no-pager -l

echo "=== Done ==="
