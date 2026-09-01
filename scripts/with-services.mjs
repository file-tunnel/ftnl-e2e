import { spawn } from "node:child_process";
import path from "node:path";

const suite = process.argv[2];
const forwardedArgs = process.argv.slice(3);
const supported = new Set(["playwright", "puppeteer", "selenium"]);

if (!supported.has(suite)) {
  throw new Error(
    `expected one of ${[...supported].join(", ")}, received ${suite ?? "nothing"}`,
  );
}

const apiOrigin =
  process.env.FTNL_API_ORIGIN ?? "http://127.0.0.1:8080";
const portalOrigin =
  process.env.FTNL_PORTAL_ORIGIN ?? "http://127.0.0.1:3000";
const external = process.env.FTNL_E2E_EXTERNAL === "1";
const children = [];
let cleaningUp = false;
let runner;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    runner?.kill(signal);
    terminateServices();
    process.exit(1);
  });
}
process.once("exit", terminateServices);

if (!external) {
  const backendDir = path.resolve(
    process.env.FTNL_BACKEND_DIR ?? "../ftnl-backend-api.rs",
  );
  const portalDir = path.resolve(
    process.env.FTNL_WEB_DIR ?? "../ftnl-web-server.rs",
  );
  const backend = startCargo(
    path.join(backendDir, "Cargo.toml"),
    process.env.FTNL_BACKEND_BIN ?? "ftnl-backend-api",
    {
      FTNL_BIND: new URL(apiOrigin).host,
      FTNL_PORTAL_ORIGIN: portalOrigin,
      RUST_LOG: "ftnl_backend_api=info",
    },
  );
  const portal = startCargo(
    path.join(portalDir, "Cargo.toml"),
    process.env.FTNL_WEB_BIN ?? "ftnl-web-server",
    {
      FTNL_WEB_BIND: new URL(portalOrigin).host,
      FTNL_API_ORIGIN: apiOrigin,
      RUST_LOG: "ftnl_web_server=info",
    },
  );
  children.push(backend, portal);
  await Promise.all([
    waitForHealth(`${apiOrigin}/healthz`, backend),
    waitForHealth(`${portalOrigin}/healthz`, portal),
  ]);
}

const npmArgs = ["run", `test:${suite}:runner`];
if (forwardedArgs.length > 0) npmArgs.push("--", ...forwardedArgs);
runner = spawn(process.platform === "win32" ? "npm.cmd" : "npm", npmArgs, {
  env: {
    ...process.env,
    FTNL_API_ORIGIN: apiOrigin,
    FTNL_PORTAL_ORIGIN: portalOrigin,
    FTNL_E2E_EXTERNAL: "1",
  },
  stdio: "inherit",
});
const exitCode = await new Promise((resolve, reject) => {
  runner.once("error", reject);
  runner.once("exit", (code, signal) => {
    if (signal) process.stderr.write(`test runner exited after ${signal}\n`);
    resolve(code ?? 1);
  });
});
await cleanup();
process.exitCode = exitCode;

function startCargo(manifestPath, binary, extraEnv) {
  return spawn(
    "cargo",
    ["run", "--quiet", "--manifest-path", manifestPath, "--bin", binary],
    {
      detached: process.platform !== "win32",
      env: { ...process.env, ...extraEnv },
      stdio: "inherit",
    },
  );
}

async function waitForHealth(url, service) {
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    if (service.exitCode !== null) {
      await cleanup();
      throw new Error(
        `service exited with code ${service.exitCode} before becoming healthy: ${url}`,
      );
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The Rust service may still be compiling or binding its socket.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await cleanup();
  throw new Error(`service did not become healthy: ${url}`);
}

async function cleanup() {
  if (cleaningUp) return;
  cleaningUp = true;
  terminateServices();
  await Promise.all(
    children.map(
      (child) =>
        new Promise((resolve) => {
          if (child.exitCode !== null) resolve();
          else {
            child.once("exit", resolve);
            setTimeout(resolve, 2_000);
          }
        }),
    ),
  );
}

function terminateServices() {
  for (const child of children) {
    if (!child.pid || child.exitCode !== null) continue;
    try {
      if (process.platform === "win32") child.kill();
      else process.kill(-child.pid, "SIGTERM");
    } catch {
      // The service may have already stopped after a test failure.
    }
  }
}
