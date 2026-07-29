import {
  multipleFileTransfer,
  singleFileTransfer,
} from "../support/scenarios.js";
import { puppeteerTest } from "../support/puppeteer-test.js";

puppeteerTest(
  "moves one phone photo to the desktop with ordered progress",
  singleFileTransfer,
);

puppeteerTest(
  "moves multiple selected phone images without byte changes",
  multipleFileTransfer,
);
