#!/usr/bin/env bash
#
# Rhemos end-to-end demo runner.
#
# Assumes the three local services are already up:
#   - Convex local backend (`bunx convex dev` in packages/backend)
#   - Go intelligence server (`go run ./cmd/server` in apps/server)
#   - Test 402 server      (`bun run server.ts` in tools/test-402)
#
# And the CLI is onboarded (~/.rhemify/{config,wallet}.json).
#
# Runs: status → pay → show → replay. Captures trace_id from `pay` output
# and threads it into the subsequent commands. Exits non-zero on any step.
# This is the demo-day walk-through script — what a judge would invoke to
# see the whole pipeline in one shot.
#
# Usage:
#   tools/demo-run.sh [endpoint]
#
# Defaults to the x402 endpoint. Pass /analytics for MPP:
#   tools/demo-run.sh http://localhost:3402/analytics

set -euo pipefail

ENDPOINT="${1:-http://localhost:3402/stock-data}"
CLI_DIR="$(cd "$(dirname "$0")/.." && pwd)/packages/cli"

step() {
  echo
  echo "─── $1 ───"
}

run_cli() {
  # Invoke bun on the absolute entrypoint instead of via `--cwd ... run
  # src/index.ts ...` — the latter gets interpreted as a package.json
  # script lookup and swallows the script's own argv.
  bun "$CLI_DIR/src/index.ts" "$@"
}

# 1. Health check first — fail fast if any service is down.
step "1. Dependency health"
run_cli status

# 2. Real payment against the configured endpoint. Capture the trace_id.
#    Strict: if pay fails, the script aborts (set -e).
step "2. Pay $ENDPOINT"
PAY_OUTPUT="$(run_cli pay "$ENDPOINT" --max-budget '$1.00')"
echo "$PAY_OUTPUT"

TRACE_ID="$(echo "$PAY_OUTPUT" | awk '/Trace:/ {print $2}' | tail -n 1)"
TX_HASH="$(echo "$PAY_OUTPUT" | awk '/TxHash:/ {print $2}' | tail -n 1)"

if [[ -z "$TRACE_ID" ]]; then
  echo "  Could not extract trace_id from pay output." >&2
  exit 1
fi

# 3. Render the full decision context. The 7 sections answer "why did this
#    payment decision happen" — agent, vendor, rules fired, paths
#    evaluated, snapshot, verifiability, next steps.
step "3. Show trace $TRACE_ID"
run_cli traces show "$TRACE_ID"

# 4. Counterfactual: re-run the same trace with daily_limit forced to 0.
#    Should flip ALLOWED → BLOCKED with only the daily_limit rule tagged
#    CHANGED. The killer-demo moment.
step "4. Replay $TRACE_ID with daily_limit=0"
run_cli traces replay "$TRACE_ID" --daily-limit 0

# 5. Final summary.
echo
echo "─── Done ───"
echo "  trace_id:    $TRACE_ID"
if [[ -n "$TX_HASH" ]]; then
  echo "  payment tx:  $TX_HASH"
  echo "  explorer:    https://explorer.solana.com/tx/$TX_HASH?cluster=devnet"
fi
echo
echo "  Inspect again:"
echo "    rhemify traces show $TRACE_ID"
echo "  Try other overrides:"
echo "    rhemify traces replay $TRACE_ID --override 'domain_allowlist=+localhost'"
echo
