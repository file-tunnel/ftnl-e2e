import {
  capabilityBoundaries,
  pairingSecurity,
} from "../support/scenarios.js";
import { seleniumTest } from "../support/selenium-test.js";

seleniumTest(
  "scrubs, stores, and redeems pairing capabilities safely",
  pairingSecurity,
);

seleniumTest(
  "enforces phone, desktop, and one-time event-ticket scopes",
  capabilityBoundaries,
);
