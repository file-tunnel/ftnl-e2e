# shellcheck shell=bash
set -euo pipefail

npm ci
npm run typecheck
npx playwright test --list
