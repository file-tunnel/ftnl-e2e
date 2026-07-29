# ftnl-e2e

Cross-driver browser conformance tests for the complete File Tunnel journey.
The same security and transfer scenarios run through three independent browser
automation stacks:

| Suite | Test modules | CI browsers |
| --- | --- | --- |
| Playwright | `tests/browser/playwright/*.test.ts` | Chromium, Firefox, WebKit |
| Puppeteer | `tests/browser/puppeteer/*.test.ts` | Chrome for Testing |
| Selenium WebDriver | `tests/browser/selenium/*.test.ts` | Chrome, Firefox |

Shared scenarios live in `tests/browser/support`. Each suite controls a
mobile-sized upload portal while the harness acts as the desktop host:
creating the tunnel, subscribing to realtime events, verifying downloaded
bytes, and cancelling the tunnel.

This catches failures that API-only tests miss: URL-fragment handling, CORS,
Content Security Policy, WebSocket tickets, file-input behavior, XHR progress,
mobile layout, one-time pairing, session resumption, and cross-context event
ordering.

## Run against local sibling checkouts

```bash
nix develop
npm ci
npx playwright install chromium firefox webkit

FTNL_BACKEND_DIR=../ftnl-backend-api.rs \
FTNL_WEB_DIR=../ftnl-web-server.rs \
npm test
```

Run one driver while iterating:

```bash
npm run test:playwright -- --project=chromium
npm run test:puppeteer
SELENIUM_BROWSER=chrome npm run test:selenium
```

The service wrapper starts both Rust services, waits for their health
endpoints, runs the selected driver, and cleans up its process group.
`nix develop --command agent-check` performs reproducible dependency,
TypeScript, Playwright-discovery, and suite-layout checks without downloading
or launching browsers. The `nix` workflow adds shell, workflow, formatting, and
flake validation.

## Run against a deployed environment

```bash
FTNL_E2E_EXTERNAL=1 \
FTNL_API_ORIGIN=https://api.file-tunnel.dev \
FTNL_PORTAL_ORIGIN=https://upload.file-tunnel.dev \
npm run test:playwright -- --project=chromium
```

Use an isolated, short-retention test environment. Test artifacts redact
pairing fragments and capabilities; Playwright traces and driver screenshots
are retained only on failure.
The `external-browser-smoke` workflow exposes the same mode as an explicit
manual dispatch and requires both origins.

## Contract scenarios

- happy-path phone-to-desktop image transfer;
- multi-file selection and byte-for-byte downloads;
- progress and availability events are monotonic;
- bytes downloaded by the desktop match the selected phone file;
- QR fragment disappears from the phone address bar after claim;
- pairing secret cannot be redeemed twice;
- the claimed phone session survives reload but is forgotten after Done;
- query-string credentials are rejected;
- phone and desktop capabilities cannot cross privilege boundaries;
- WebSocket event tickets cannot be reused;
- unsupported media and oversized files fail safely;
- cancelled tunnels fail closed;
- portal privacy/security headers are present;
- cancellation closes the tunnel.

## GitHub Actions

- `e2e-static` type-checks every adapter and verifies all three directory
  contracts.
- `browser-e2e` runs seven scenarios across six driver/browser combinations on
  every pull request and `main` push, plus nightly.
- `external-browser-smoke` manually runs five conformance combinations against
  an isolated deployed environment.
- `nix` verifies the reproducible development shell, pinned workflows, shell
  scripts, and static agent checks.

MIT licensed.
