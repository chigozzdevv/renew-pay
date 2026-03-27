#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="$ROOT_DIR/server"
PORT="${PORT:-4100}"
MONGODB_DB_NAME="${MONGODB_DB_NAME:-renew_e2e}"
SERVER_LOG="$(mktemp -t renew-e2e-server.XXXXXX.log)"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

cd "$SERVER_DIR"

ENABLE_WORKERS=false \
NODE_ENV=test \
PORT="$PORT" \
MONGODB_DB_NAME="$MONGODB_DB_NAME" \
node --import tsx src/index.ts >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

for _ in {1..40}; do
  if curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
  echo "Renew server did not become healthy. Logs:" >&2
  cat "$SERVER_LOG" >&2
  exit 1
fi

ENABLE_WORKERS=false \
NODE_ENV=test \
PORT="$PORT" \
MONGODB_DB_NAME="$MONGODB_DB_NAME" \
node --import tsx src/scripts/e2e-mvp.ts
