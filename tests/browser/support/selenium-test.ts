import { test } from "node:test";

import type { BrowserFactory } from "./driver.js";
import { seleniumFactory } from "./selenium-driver.js";

export function seleniumTest(
  name: string,
  scenario: (factory: BrowserFactory) => Promise<void>,
): void {
  test(name, { timeout: 120_000 }, async () => {
    await scenario(seleniumFactory());
  });
}
