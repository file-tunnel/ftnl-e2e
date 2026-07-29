import { mkdir } from "node:fs/promises";
import path from "node:path";

import type {
  Browser,
  BrowserContext,
  Page,
} from "@playwright/test";

import type {
  BrowserFactory,
  BrowserPage,
  BrowserSession,
} from "./driver.js";

class PlaywrightPage implements BrowserPage {
  constructor(private readonly page: Page) {}

  async goto(url: string): Promise<void> {
    await this.page.goto(url);
  }

  async reload(): Promise<void> {
    await this.page.reload();
  }

  async currentUrl(): Promise<string> {
    return this.page.url();
  }

  async text(selector: string): Promise<string> {
    return (await this.page.locator(selector).first().textContent()) ?? "";
  }

  async texts(selector: string): Promise<string[]> {
    return this.page.locator(selector).allTextContents();
  }

  async attribute(selector: string, name: string): Promise<string | null> {
    return this.page.locator(selector).first().getAttribute(name);
  }

  async upload(selector: string, paths: string[]): Promise<void> {
    await this.page.locator(selector).setInputFiles(paths);
  }

  async click(selector: string): Promise<void> {
    await this.page.locator(selector).click();
  }

  async sessionStorage(key: string): Promise<string | null> {
    return this.page.evaluate(
      (storageKey) => globalThis.sessionStorage.getItem(storageKey),
      key,
    );
  }

  async screenshot(filePath: string): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    await this.page.screenshot({ path: filePath, fullPage: true });
  }
}

export function playwrightFactory(browser: Browser): BrowserFactory {
  return {
    name: "playwright",
    async newSession(): Promise<BrowserSession> {
      const context: BrowserContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      return {
        page: new PlaywrightPage(page),
        close: () => context.close(),
      };
    },
  };
}
