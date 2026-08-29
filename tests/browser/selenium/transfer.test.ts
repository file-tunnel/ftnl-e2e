import {
  multipleFileTransfer,
  qrPairingHandoff,
  singleFileTransfer,
} from "../support/scenarios.js";
import { seleniumTest } from "../support/selenium-test.js";

seleniumTest(
  "moves one phone photo to the desktop with ordered progress",
  singleFileTransfer,
);

seleniumTest(
  "moves multiple selected phone images without byte changes",
  multipleFileTransfer,
);

seleniumTest(
  "scans a real QR artifact before the mobile transfer handoff",
  qrPairingHandoff,
);
