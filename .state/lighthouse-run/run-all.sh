#!/usr/bin/env bash
set -u
TS=$(date -u +%Y%m%dT%H%M%SZ)
OUTDIR=".state/lighthouse-run/${TS}"
mkdir -p "$OUTDIR"
echo "$TS" > "$OUTDIR/timestamp.txt"

declare -a ROUTES=(
  "/ home"
  "/escola/ escola"
  "/financas/ financas"
  "/habitos/ habitos"
  "/biblioteca/ biblioteca"
  "/trabalhos/ trabalhos"
  "/aulas/ aulas"
  "/definicoes/ definicoes"
)

for pair in "${ROUTES[@]}"; do
  set -- $pair
  ROUTE="$1"
  NAME="$2"
  echo "=== Running Lighthouse for $NAME ($ROUTE) at $(date -u +%H:%M:%S) ==="
  npx --yes lighthouse "https://presuntinho.netlify.app${ROUTE}" \
    --only-categories=accessibility \
    --output=json \
    --output-path="${OUTDIR}/lighthouse-${NAME}.json" \
    --quiet \
    --chrome-flags='--headless --no-sandbox --disable-gpu --disable-dev-shm-usage' \
    >/dev/null 2>&1
  if [ -f "${OUTDIR}/lighthouse-${NAME}.json" ]; then
    SCORE=$(node .state/inspect-lh.cjs "${OUTDIR}/lighthouse-${NAME}.json" | head -1)
    echo "  -> $SCORE"
  else
    echo "  -> FAILED (no output file)"
  fi
done

# Summary table
echo ""
echo "=== Summary @ ${TS} ==="
for pair in "${ROUTES[@]}"; do
  set -- $pair
  NAME="$2"
  if [ -f "${OUTDIR}/lighthouse-${NAME}.json" ]; then
    SCORE=$(node .state/inspect-lh.cjs "${OUTDIR}/lighthouse-${NAME}.json" | head -1)
    echo "  ${NAME}: ${SCORE}"
  else
    echo "  ${NAME}: FAILED"
  fi
done
echo "DONE"
