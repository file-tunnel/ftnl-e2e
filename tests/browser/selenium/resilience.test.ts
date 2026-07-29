import {
  cancelledTunnelFailsClosed,
  portalPrivacy,
  validationFailures,
} from "../support/scenarios.js";
import { seleniumTest } from "../support/selenium-test.js";

seleniumTest(
  "shows safe errors for unsupported and oversized files",
  validationFailures,
);

seleniumTest(
  "fails closed when a cancelled tunnel is scanned",
  cancelledTunnelFailsClosed,
);

seleniumTest(
  "ships private portal responses and rejects incomplete routes",
  portalPrivacy,
);
