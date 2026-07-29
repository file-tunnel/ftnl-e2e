import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { apiOrigin, portalOrigin } from "../playwright.config.js";

interface Tunnel {
  tunnel_id: string;
  pairing_uri: string;
  desktop_capability: string;
}

interface TunnelEvent {
  sequence: number;
  kind: string;
  file_id?: string;
  bytes_transferred?: number;
}

const syntheticJpeg = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0xff, 0xd9,
]);

async function desktopHarness(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  // Reuse the real portal origin as a neutral host page so Chromium's private
  // network access checks see the same local trust boundary as production
  // (HTTPS portal → HTTPS API) rather than a synthetic public hostname.
  await page.goto(`${portalOrigin}/`);
  return page;
}

async function createTunnel(page: Page): Promise<Tunnel> {
  return page.evaluate(async ({ api }) => {
    const response = await fetch(`${api}/v1/tunnels`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        application_id: "ftnl-e2e",
        accept: ["image/*"],
        max_files: 3,
        max_file_bytes: 1024 * 1024,
        expires_in_seconds: 60,
      }),
    });
    if (!response.ok) throw new Error(`create failed: ${response.status}`);
    return response.json();
  }, { api: apiOrigin });
}

async function subscribe(page: Page, tunnel: Tunnel): Promise<void> {
  await page.evaluate(
    async ({ api, id, capability }) => {
      const response = await fetch(`${api}/v1/tunnels/${id}/event-tickets`, {
        method: "POST",
        headers: { authorization: `Bearer ${capability}` },
      });
      const { ticket } = await response.json();
      const wsOrigin = api.replace(/^http/, "ws");
      const socket = new WebSocket(
        `${wsOrigin}/v1/tunnels/${id}/events?ticket=${encodeURIComponent(ticket)}`,
      );
      const state = window as typeof window & {
        ftnlEvents: TunnelEvent[];
        ftnlSocket: WebSocket;
      };
      state.ftnlEvents = [];
      state.ftnlSocket = socket;
      socket.addEventListener("message", (message) => {
        state.ftnlEvents.push(JSON.parse(String(message.data)));
      });
      await new Promise<void>((resolve, reject) => {
        socket.addEventListener("open", () => resolve(), { once: true });
        socket.addEventListener("error", () => reject(new Error("socket failed")), {
          once: true,
        });
      });
    },
    {
      api: apiOrigin,
      id: tunnel.tunnel_id,
      capability: tunnel.desktop_capability,
    },
  );
}

test("phone selection arrives in the desktop host with ordered progress", async ({
  browser,
}) => {
  const desktopContext = await browser.newContext();
  const phoneContext = await browser.newContext({
    ...{
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    },
  });
  const desktop = await desktopHarness(desktopContext);
  const tunnel = await createTunnel(desktop);
  expect(tunnel.pairing_uri).toContain("#c=");
  await subscribe(desktop, tunnel);

  const phone = await phoneContext.newPage();
  await phone.goto(tunnel.pairing_uri);
  await expect(phone.getByText("Connected securely")).toBeVisible();
  await expect.poll(() => phone.url()).not.toContain("#c=");

  await phone.locator("#files").setInputFiles({
    name: "phone-photo.jpg",
    mimeType: "image/jpeg",
    buffer: syntheticJpeg,
  });
  await expect(phone.getByText("Sent", { exact: true })).toBeVisible();

  await expect
    .poll(() =>
      desktop.evaluate(() => {
        const state = window as typeof window & { ftnlEvents: TunnelEvent[] };
        return state.ftnlEvents.map((event) => event.kind);
      }),
    )
    .toContain("file.available");

  const events = await desktop.evaluate(() => {
    const state = window as typeof window & { ftnlEvents: TunnelEvent[] };
    return state.ftnlEvents;
  });
  for (let index = 1; index < events.length; index += 1) {
    expect(events[index]!.sequence).toBeGreaterThan(events[index - 1]!.sequence);
  }
  const available = events.find((event) => event.kind === "file.available");
  expect(available?.bytes_transferred).toBe(syntheticJpeg.length);

  const downloaded = await desktop.evaluate(
    async ({ api, id, fileId, capability }) => {
      const response = await fetch(
        `${api}/v1/tunnels/${id}/files/${fileId}/content`,
        { headers: { authorization: `Bearer ${capability}` } },
      );
      return Array.from(new Uint8Array(await response.arrayBuffer()));
    },
    {
      api: apiOrigin,
      id: tunnel.tunnel_id,
      fileId: available!.file_id!,
      capability: tunnel.desktop_capability,
    },
  );
  expect(Buffer.from(downloaded)).toEqual(syntheticJpeg);

  await desktop.evaluate(
    async ({ api, id, capability }) => {
      const response = await fetch(`${api}/v1/tunnels/${id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${capability}` },
      });
      if (!response.ok) throw new Error(`cancel failed: ${response.status}`);
    },
    { api: apiOrigin, id: tunnel.tunnel_id, capability: tunnel.desktop_capability },
  );

  await phoneContext.close();
  await desktopContext.close();
});

test("pairing secret is one-time and portal responses are private", async ({
  browser,
  request,
}) => {
  const context = await browser.newContext();
  const desktop = await desktopHarness(context);
  const tunnel = await createTunnel(desktop);

  const original = new URL(tunnel.pairing_uri);
  const secret = new URLSearchParams(original.hash.slice(1)).get("c")!;
  const queryContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const queryPhone = await queryContext.newPage();
  await queryPhone.goto(
    `${portalOrigin}${original.pathname}?c=${encodeURIComponent(secret)}`,
  );
  await expect(queryPhone.getByRole("alert")).toContainText(/incomplete/i);
  await queryContext.close();

  const firstPhone = await context.newPage();
  await firstPhone.goto(tunnel.pairing_uri);
  await expect(firstPhone.getByText("Connected securely")).toBeVisible();

  const secondContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const secondPhone = await secondContext.newPage();
  await secondPhone.goto(tunnel.pairing_uri);
  await expect(secondPhone.getByRole("alert")).toContainText(/state conflicts|already been used/i);

  const tunnelPath = new URL(tunnel.pairing_uri).pathname;
  const response = await request.get(`${portalOrigin}${tunnelPath}`);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");

  await secondContext.close();
  await context.close();
});
