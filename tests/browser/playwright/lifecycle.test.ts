import { test } from "@playwright/test";

import {
  cancellationRevokesInFlightTransfer,
  concurrentPairingHasOneWinner,
  quotaRejectionPreservesTransfer,
  resumableUploadRejectsCorruption,
} from "../support/lifecycle-scenarios.js";
import { playwrightFactory } from "../support/playwright-driver.js";

test("resumes byte-exact uploads and rejects gaps, overlaps, corrupt retries, and length lies", async ({ browser }) => {
  await resumableUploadRejectsCorruption(playwrightFactory(browser));
});

test("revokes active uploads and capabilities immediately after cancellation", async ({ browser }) => {
  await cancellationRevokesInFlightTransfer(playwrightFactory(browser));
});

test("rejects file quota overflow without corrupting accepted transfers", async ({ browser }) => {
  await quotaRejectionPreservesTransfer(playwrightFactory(browser));
});

test("allows exactly one winner when two phones scan a QR concurrently", async ({ browser }) => {
  await concurrentPairingHasOneWinner(playwrightFactory(browser));
});
