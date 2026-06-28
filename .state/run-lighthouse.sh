#!/usr/bin/env bash
set -u
ROUTE="$1"
NAME="$2"
npx --yes lighthouse "https://presuntinho.netlify.app${ROUTE}" \
  --only-categories=accessibility \
  --output=json \
  --output-path="./.state/lighthouse-${NAME}.json" \
  --quiet \
  --chrome-flags='--headless --no-sandbox --disable-gpu --disable-dev-shm-usage' \
  >/dev/null 2>&1
echo "done ${NAME}"
