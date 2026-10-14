#!/usr/bin/env bash
# Private BLOCK devnet (regtest) for WORLD development.
# Usage: infra/devnet.sh [init|start|stop|status]
set -euo pipefail

BLOCKLE_REPO="${BLOCKLE_REPO:-$(cd "$(dirname "$0")/../.." && pwd)/blockle}"
BIN="$BLOCKLE_REPO/chain/target/release/blockle-chain"
DATADIR="${WORLD_DEVNET_DATADIR:-$HOME/.world-devnet}"
PIDFILE="$DATADIR/devnet.pid"
AUX_HTTP="127.0.0.1:8445"
RPC="127.0.0.1:9790"
P2P="127.0.0.1:18444"

build() {
  [ -x "$BIN" ] && return
  echo "building blockle-chain (release)…"
  (cd "$BLOCKLE_REPO/chain" && cargo build --release)
}

case "${1:-start}" in
  init)
    build
    "$BIN" --network regtest --datadir "$DATADIR" init
    ;;
  start)
    build
    [ -d "$DATADIR/regtest" ] || "$BIN" --network regtest --datadir "$DATADIR" init
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      echo "devnet already running (pid $(cat "$PIDFILE"))"; exit 0
    fi
    nohup "$BIN" --network regtest --datadir "$DATADIR" start \
      --listen "$P2P" --mine --mine-interval 2 \
      --aux-http "$AUX_HTTP" \
      --rpc "$RPC" --rpc-user world --rpc-password world \
      >"$DATADIR/node.log" 2>&1 &
    echo $! >"$PIDFILE"
    echo "devnet up: p2p $P2P, aux-http $AUX_HTTP (INTERNAL ONLY), rpc $RPC; log $DATADIR/node.log"
    ;;
  stop)
    [ -f "$PIDFILE" ] && kill "$(cat "$PIDFILE")" && rm -f "$PIDFILE" && echo "stopped" || echo "not running"
    ;;
  status)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      curl -s "http://$AUX_HTTP" -X POST -H 'content-type: application/json' \
        -d '{"jsonrpc":"2.0","id":1,"method":"getauxchaininfo","params":[]}' || true
      echo
    else
      echo "not running"
    fi
    ;;
  *) echo "usage: $0 [init|start|stop|status]"; exit 1 ;;
esac
