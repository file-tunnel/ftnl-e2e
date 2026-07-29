import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const apiOrigin = process.env.FTNL_API_ORIGIN ?? "http://127.0.0.1:8080";
const portalOrigin = process.env.FTNL_PORTAL_ORIGIN ?? "http://127.0.0.1:3000";
const external = process.env.FTNL_E2E_EXTERNAL === "1";
const backendDir = path.resolve(process.env.FTNL_BACKEND_DIR ?? "../ftnl-backend-api.rs");
const portalDir = path.resolve(process.env.FTNL_WEB_DIR ?? "../ftnl-web-server.rs");

export default defineConfig({
  testDir: "tests/browser/playwright",
  testMatch: "**/*.test.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [
        ["line"],
        ["html", { open: "never" }],
        ["junit", { outputFile: "test-results/playwright-junit.xml" }],
      ]
    : "list",
  outputDir: "test-results",
  use: {
    baseURL: portalOrigin,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: external
    ? undefined
    : [
        {
          command: `cargo run --manifest-path "${path.join(backendDir, "Cargo.toml")}"`,
          url: `${apiOrigin}/healthz`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            FTNL_BIND: new URL(apiOrigin).host,
            FTNL_PORTAL_ORIGIN: portalOrigin,
            RUST_LOG: "ftnl_backend_api=info",
          },
        },
        {
          command: `cargo run --manifest-path "${path.join(portalDir, "Cargo.toml")}"`,
          url: `${portalOrigin}/healthz`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            FTNL_WEB_BIND: new URL(portalOrigin).host,
            FTNL_API_ORIGIN: apiOrigin,
            RUST_LOG: "ftnl_web_server=info",
          },
        },
      ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
