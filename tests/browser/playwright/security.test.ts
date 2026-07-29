import { test } from "@playwright/test";

import {
  capabilityBoundaries,
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
