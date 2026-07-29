import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { Builder, By, type WebDriver } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import firefox from "selenium-webdriver/firefox.js";

import type {
  BrowserFactory,
  BrowserPage,
  BrowserSession,
} from "./driver.js";

class SeleniumPage implements BrowserPage {
  constructor(private readonly driver: WebDriver) {}

  async goto(url: string): Promise<void> {
    await this.driver.get(url);
  }

  async reload(): Promise<void> {
    await this.driver.navigate().refresh();
  }

  async currentUrl(): Promise<string> {
    return this.driver.getCurrentUrl();
  }

  async text(selector: string): Promise<string> {
    return this.driver.findElement(By.css(selector)).getText();
  }

  async texts(selector: string): Promise<string[]> {
    const elements = await this.driver.findElements(By.css(selector));
    return Promise.all(elements.map((element) => element.getText()));
  }

  async attribute(selector: string, name: string): Promise<string | null> {
    return this.driver.findElement(By.css(selector)).getAttribute(name);
  }

  async upload(selector: string, paths: string[]): Promise<void> {
    await this.driver
      .findElement(By.css(selector))
      .sendKeys(paths.join("\n"));
  }

  async click(selector: string): Promise<void> {
    await this.driver.findElement(By.css(selector)).click();
  }

  async sessionStorage(key: string): Promise<string | null> {
    return this.driver.executeScript<string | null>(
      "return globalThis.sessionStorage.getItem(arguments[0]);",
      key,
    );
  }

  async screenshot(filePath: string): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    const encoded = await this.driver.takeScreenshot();
    await writeFile(filePath, Buffer.from(encoded, "base64"));
  }
}

export function seleniumFactory(): BrowserFactory {
  const browserName = process.env.SELENIUM_BROWSER ?? "chrome";
  return {
    name: `selenium-${browserName}`,
    async newSession(): Promise<BrowserSession> {
      const builder = new Builder().forBrowser(browserName);
      if (browserName === "firefox") {
        const options = new firefox.Options().addArguments("-headless");
        const binary = process.env.SELENIUM_FIREFOX_BINARY;
        if (binary) options.setBinary(binary);
        builder.setFirefoxOptions(options);
      } else {
        const options = new chrome.Options().addArguments(
          "--headless=new",
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--window-size=390,844",
        );
        const binary = process.env.SELENIUM_CHROME_BINARY;
        if (binary) options.setBinaryPath(binary);
        builder.setChromeOptions(
          options as unknown as Parameters<Builder["setChromeOptions"]>[0],
        );
      }
      const driver = await builder.build();
      await driver.manage().setTimeouts({
        implicit: 2_000,
        pageLoad: 30_000,
        script: 15_000,
      });
      await driver.manage().window().setRect({ width: 390, height: 844 });
      return {
        page: new SeleniumPage(driver),
        close: async () => {
          try {
            await driver.quit();
          } catch (error) {
            if (
              !(error instanceof Error) ||
              !/unexpectedly closed|invalid session|no such session/i.test(
                error.message,
              )
            ) {
              throw error;
            }
          }
        },
      };
    },
  };
}
