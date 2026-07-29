import { after, test } from "node:test";

import puppeteer, { type Browser } from "puppeteer";

import type { BrowserFactory } from "./driver.js";
import { puppeteerFactory } from "./puppeteer-driver.js";

let browser: Browser | undefined;

after(async () => {
  await browser?.close();
});

export function puppeteerTest(
  name: string,
  scenario: (factory: BrowserFactory) => Promise<void>,
): void {
  test(name, { timeout: 90_000 }, async () => {
    browser ??= await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    await scenario(puppeteerFactory(browser));
  });
}
