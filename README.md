# ftnl-e2e

Browser-level contract tests for the complete File Tunnel journey. Each test
drives two isolated browser contexts:

- a desktop host creates a tunnel, subscribes to realtime events, and imports;
- a phone opens the exact QR destination, selects a local file, and uploads.

This catches failures that API-only tests miss: URL fragment handling, CORS,
Content Security Policy, browser WebSocket tickets, file-input behavior, XHR
progress, mobile layout, one-time pairing, and cross-context event ordering.

## Run against local sibling checkouts

```bash
nix develop
npm ci
npx playwright install chromium webkit

FTNL_BACKEND_DIR=../ftnl-backend-api.rs \
FTNL_WEB_DIR=../ftnl-web-server.rs \
npm test
```

The suite starts both Rust services and waits for their health endpoints.
`nix develop --command agent-check` performs dependency, type, and test
discovery checks without launching browsers; the integration workflow installs
the pinned npm Playwright browsers and runs the full two-context journey.

## Run against a deployed environment

```bash
FTNL_E2E_EXTERNAL=1 \
FTNL_API_ORIGIN=https://api.file-tunnel.dev \
FTNL_PORTAL_ORIGIN=https://upload.file-tunnel.dev \
npm test
```

Use an isolated, short-retention test environment. Test artifacts redact
pairing fragments and capabilities; traces are retained only on failure.

## Contract scenarios

- happy-path phone-to-desktop image transfer;
- progress and availability events are monotonic;
- bytes downloaded by the desktop match the selected phone file;
- QR fragment disappears from the phone address bar after claim;
- pairing secret cannot be redeemed twice;
- query-string credentials are rejected;
- portal privacy/security headers are present;
- cancellation closes the tunnel.

MIT licensed.
