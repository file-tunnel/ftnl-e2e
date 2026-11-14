import { test } from "@playwright/test";

import {
  ambiguousPairingCannotRedeem,
  capabilityBoundaries,
  crossTunnelCapabilityIsolation,
  pairingSecurity,
} from "../support/scenarios.js";
import { playwrightFactory } from "../support/playwright-driver.js";

test("scrubs, stores, and redeems pairing capabilities safely", async ({
  browser,
}) => {
  await pairingSecurity(playwrightFactory(browser));
});

test("enforces phone, desktop, and one-time event-ticket scopes", async ({
  browser,
}) => {
  await capabilityBoundaries(playwrightFactory(browser));
});

test("isolates capabilities between tunnels", async ({ browser }) => {
  await crossTunnelCapabilityIsolation(playwrightFactory(browser));
});

test("rejects ambiguous fragment credentials without consuming valid pairing", async ({ browser }) => {
  await ambiguousPairingCannotRedeem(playwrightFactory(browser));
});
