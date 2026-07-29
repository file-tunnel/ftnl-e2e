import path from "node:path";

export interface BrowserPage {
  goto(url: string): Promise<void>;
  reload(): Promise<void>;
  currentUrl(): Promise<string>;
  text(selector: string): Promise<string>;
  texts(selector: string): Promise<string[]>;
  attribute(selector: string, name: string): Promise<string | null>;
  upload(selector: string, paths: string[]): Promise<void>;
  click(selector: string): Promise<void>;
  sessionStorage(key: string): Promise<string | null>;
  screenshot(filePath: string): Promise<void>;
}

export interface BrowserSession {
  page: BrowserPage;
  close(): Promise<void>;
}

export interface BrowserFactory {
  readonly name: string;
  newSession(): Promise<BrowserSession>;
}

export async function withSession(
  factory: BrowserFactory,
  scenario: string,
  run: (page: BrowserPage) => Promise<void>,
): Promise<void> {
  const session = await factory.newSession();
  try {
    await run(session.page);
  } catch (error) {
    const safeName = scenario.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
    await session.page
      .screenshot(
        path.resolve(
          "browser-artifacts",
          `${factory.name}-${safeName}-${Date.now()}.png`,
        ),
      )
      .catch(() => undefined);
    throw error;
  } finally {
    await session.close();
  }
}
