import {
  cancellationRevokesInFlightTransfer,
  concurrentPairingHasOneWinner,
  quotaRejectionPreservesTransfer,
  resumableUploadRejectsCorruption,
} from "../support/lifecycle-scenarios.js";
import { puppeteerTest } from "../support/puppeteer-test.js";

puppeteerTest("resumable upload rejects corruption and preserves checkpoint", resumableUploadRejectsCorruption);
puppeteerTest("cancellation revokes incomplete uploads", cancellationRevokesInFlightTransfer);
puppeteerTest("quota overflow preserves existing files", quotaRejectionPreservesTransfer);
puppeteerTest("concurrent pairing has exactly one winner", concurrentPairingHasOneWinner);
