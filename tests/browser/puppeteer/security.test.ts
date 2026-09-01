import {
  capabilityBoundaries,
  crossTunnelCapabilityIsolation,
  pairingSecurity,
} from "../support/scenarios.js";
import { puppeteerTest } from "../support/puppeteer-test.js";

puppeteerTest(
  "scrubs, stores, and redeems pairing capabilities safely",
  pairingSecurity,
);

puppeteerTest(
  "enforces phone, desktop, and one-time event-ticket scopes",
  capabilityBoundaries,
);

puppeteerTest(
  "isolates capabilities between tunnels",
  crossTunnelCapabilityIsolation,
);
