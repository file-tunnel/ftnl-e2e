import {
  cancellationRevokesInFlightTransfer,
  concurrentPairingHasOneWinner,
  quotaRejectionPreservesTransfer,
  resumableUploadRejectsCorruption,
} from "../support/lifecycle-scenarios.js";
import { seleniumTest } from "../support/selenium-test.js";

seleniumTest("resumable upload rejects corruption and preserves checkpoint", resumableUploadRejectsCorruption);
seleniumTest("cancellation revokes incomplete uploads", cancellationRevokesInFlightTransfer);
seleniumTest("quota overflow preserves existing files", quotaRejectionPreservesTransfer);
seleniumTest("concurrent pairing has exactly one winner", concurrentPairingHasOneWinner);
