# shellcheck shell=bash
set -euo pipefail

PUPPETEER_SKIP_DOWNLOAD=true npm ci
npm run typecheck
npm run test:list
node --check tests/desktop/desktop-parity.e2e.test.mjs
