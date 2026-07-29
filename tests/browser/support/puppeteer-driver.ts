import { mkdir } from "node:fs/promises";
import path from "node:path";

import type { Browser, ElementHandle, Page } from "puppeteer";

import type {
  BrowserFactory,
  BrowserPage,
  BrowserSession,
} from "./driver.js";

class PuppeteerPage implements BrowserPage {
  constructor(private readonly page: Page) {}

  async goto(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: "networkidle0" });
  }

  async reload(): Promise<void> {
    await this.page.reload({ waitUntil: "networkidle0" });
  }

  async currentUrl(): Promise<string> {
    return this.page.url();
  }

  async text(selector: string): Promise<string> {
    return this.page.$eval(
      selector,
      (element) => element.textContent ?? "",
    );
  }

  async texts(selector: string): Promise<string[]> {
    return this.page.$$eval(selector, (elements) =>
      elements.map((element) => element.textContent ?? ""),
    );
  }

  async attribute(selector: string, name: string): Promise<string | null> {
    return this.page.$eval(
      selector,
      (element, attributeName) => element.getAttribute(attributeName),
      name,
    );
  }

  async upload(selector: string, paths: string[]): Promise<void> {
    const input = (await this.page.waitForSelector(
      selector,
    )) as ElementHandle<HTMLInputElement> | null;
    if (!input) throw new Error(`file input not found: ${selector}`);
    await input.uploadFile(...paths);
  }

  async click(selector: string): Promise<void> {
    await this.page.click(selector);
  }

  async sessionStorage(key: string): Promise<string | null> {
    return this.page.evaluate(
      (storageKey) => globalThis.sessionStorage.getItem(storageKey),
      key,
    );
  }

  async screenshot(filePath: string): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    await this.page.screenshot({
      path: filePath as `${string}.png`,
      fullPage: true,
    });
  }
}

export function puppeteerFactory(browser: Browser): BrowserFactory {
  return {
    name: "puppeteer",
    async newSession(): Promise<BrowserSession> {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      await page.setViewport({
        width: 390,
        height: 844,
        isMobile: true,
        hasTouch: true,
      });
      return {
        page: new PuppeteerPage(page),
        close: () => context.close(),
      };
    },
  };
}
