#!/usr/bin/env bash
# usage: scripts/preview/run.sh <outDir>   -> renders fixtures with the app's real components and screenshots them (light/dark, 1280/390)
set -euo pipefail
cd "$(dirname "$0")/../.."
npx vitest run --config scripts/preview/vitest.config.mts >/dev/null
node scripts/preview/build-css.mjs
NODE_PATH=/opt/node-tools/node_modules node scripts/preview/shoot.mjs "$1" "${@:2}"
