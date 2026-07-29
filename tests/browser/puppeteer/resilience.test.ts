import {
  cancelledTunnelFailsClosed,
  portalPrivacy,
  validationFailures,
} from "../support/scenarios.js";
import { puppeteerTest } from "../support/puppeteer-test.js";

puppeteerTest(
  "shows safe errors for unsupported and oversized files",
  validationFailures,
);

puppeteerTest(
  "fails closed when a cancelled tunnel is scanned",
  cancelledTunnelFailsClosed,
);

puppeteerTest(
  "ships private portal responses and rejects incomplete routes",
  portalPrivacy,
);
