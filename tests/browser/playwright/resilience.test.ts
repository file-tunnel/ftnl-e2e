import { test } from "@playwright/test";

import {
  cancelledTunnelFailsClosed,
  portalPrivacy,
  validationFailures,
} from "../support/scenarios.js";
import { playwrightFactory } from "../support/playwright-driver.js";

test("shows safe errors for unsupported and oversized files", async ({
  browser,
}) => {
  await validationFailures(playwrightFactory(browser));
});

test("fails closed when a cancelled tunnel is scanned", async ({ browser }) => {
  await cancelledTunnelFailsClosed(playwrightFactory(browser));
});

test("ships private portal responses and rejects incomplete routes", async ({
  browser,
}) => {
  await portalPrivacy(playwrightFactory(browser));
});
