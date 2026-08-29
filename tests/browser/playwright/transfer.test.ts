import { test } from "@playwright/test";

import {
  multipleFileTransfer,
  qrPairingHandoff,
  singleFileTransfer,
} from "../support/scenarios.js";
import { playwrightFactory } from "../support/playwright-driver.js";

test("moves one phone photo to the desktop with ordered progress", async ({
  browser,
}) => {
  await singleFileTransfer(playwrightFactory(browser));
});

test("moves multiple selected phone images without byte changes", async ({
  browser,
}) => {
  await multipleFileTransfer(playwrightFactory(browser));
});

test("scans a real QR artifact before the mobile transfer handoff", async ({
  browser,
}) => {
  await qrPairingHandoff(playwrightFactory(browser));
});
