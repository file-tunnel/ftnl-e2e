import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { test } from "node:test";

function launch(overrides) {
  return spawnSync(process.execPath, ["scripts/with-services.mjs", "playwright"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 10_000,
    env: {
      ...process.env,
      FTNL_E2E_EXTERNAL: "0",
      ...overrides,
    },
  });
}

test("local E2E rejects an occupied backend socket instead of trusting /healthz", async () => {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  try {
    const address = listener.address();
    assert.ok(address && typeof address !== "string");
    const backend = "http://127.0.0.1:" + address.port;
    const run = launch({
      FTNL_API_ORIGIN: backend,
      FTNL_PORTAL_ORIGIN: "http://127.0.0.1:3000",
    });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /backend listen socket is occupied or unavailable \(EADDRINUSE\)/);
    assert.doesNotMatch(run.stderr, /File Tunnel API listening/);
  } finally {
    await new Promise((resolve, reject) => {
      listener.close((error) => error ? reject(error) : resolve());
    });
  }
});

test("local E2E rejects malformed service origins before spawning Cargo", () => {
  const run = launch({
    FTNL_API_ORIGIN: "https://127.0.0.1:8080/private?token=hidden",
    FTNL_PORTAL_ORIGIN: "http://127.0.0.1:3000",
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /backend origin must be an HTTP origin without credentials or paths/);
  assert.ok(!run.stderr.includes("token=hidden"), "never log origin query credentials");
});

test("local E2E rejects colliding backend and portal origins", () => {
  const run = launch({
    FTNL_API_ORIGIN: "http://127.0.0.1:8080",
    FTNL_PORTAL_ORIGIN: "http://127.0.0.1:8080",
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /backend and portal origins must use distinct listen sockets/);
});
