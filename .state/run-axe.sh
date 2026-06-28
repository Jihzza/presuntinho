#!/usr/bin/env bash
set -u
NAME="$1"
node_modules/.bin/axe "https://presuntinho.netlify.app/" --save "./.state/axe-${NAME}.json" >/dev/null 2>&1
echo "axe done ${NAME} exit=$?"
