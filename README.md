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

The QR handoff scenario renders the server-issued pairing URI into a real PNG,
decodes its pixels through a scanner implementation, and gives only that
decoded value to the mobile-sized browser. The PNG remains in memory so its
fragment capability never enters retained diagnostics.

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
- a rendered and decoded QR artifact completes a byte-exact transfer;
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

## Desktop parity

The independent desktop lane assembles the Rust and Flutter feature manifests
against one immutable JSON Schema revision and verifies the Bluetooth transport
boundary for Shared Auth relays, peer information, and signed update metadata:

```bash
npm run test:desktop
```

Local execution uses the sibling `ftnl-interfaces`, `ftnl-desktop-app.rs`, and
`file-tunnel-test/contract-conformance-tests` checkouts. CI checks out their
exact commits without private-repository credentials, validates all 12 paired
desktop features, and executes the Rust app's headless reducer suite. Flutter is
represented by sanitized, commit-bound evidence because its source repository
is private; the separate gated test-org lane executes the private source when
its least-privilege integration credential is enabled.

## GitHub Actions

- `e2e-static` type-checks every adapter and verifies all three directory
  contracts.
- `browser-e2e` runs eight scenarios across six driver/browser combinations on
  every pull request and `main` push, plus nightly.
- `external-browser-smoke` manually runs five conformance combinations against
  an isolated deployed environment.
- `desktop-parity` verifies immutable Rust/Flutter schema parity, Bluetooth
  security boundaries, and the executable Rust headless reducer.
- `nix` verifies the reproducible development shell, pinned workflows, shell
  scripts, and static agent checks.

MIT licensed.
