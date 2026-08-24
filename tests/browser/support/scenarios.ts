import assert from "node:assert/strict";

import {
  apiOrigin,
  cancel,
  createTunnel,
  download,
  pairingSecret,
  phoneSessionKey,
  portalOrigin,
  snapshot,
  subscribe,
  waitFor,
  waitForSnapshot,
  type Tunnel,
  type TunnelEvent,
} from "./api.js";
import {
  type BrowserFactory,
  type BrowserPage,
  withSession,
} from "./driver.js";
import { fixtures, jpegBytes, pngBytes } from "./fixtures.js";
import { renderAndScanQr } from "./qr.js";

export async function singleFileTransfer(
  factory: BrowserFactory,
): Promise<void> {
  await withSession(factory, "single-file-transfer", async (phone) => {
    const tunnel = await createTunnel();
    const events = await subscribe(tunnel);
    const files = await fixtures();
    try {
      await connect(phone, tunnel);
      await phone.upload("#files", [files.jpeg]);
      await expectText(phone, ".upload-state", "Sent");
      await waitFor(
        () => phone.attribute('[role="progressbar"]', "aria-valuenow"),
        (value) => value === "100",
      );

      const available = await events.waitFor("file.available");
      assert.equal(available.bytes_transferred, jpegBytes.length);
      assertOrdered(events.events);

      const state = await waitForSnapshot(
        tunnel,
        (value) =>
          value.files.length === 1 && value.files[0]?.status === "available",
      );
      assert.equal(state.files[0]?.name, "phone-photo.jpg");
      assert.deepEqual(
        await download(tunnel, state.files[0]!.file_id),
        jpegBytes,
      );
      assert.equal(
        (await snapshot(tunnel)).status,
        "complete",
        "downloading every file must complete the tunnel",
      );

      await expectText(phone, "#done", "Done");
      await phone.click("#done");
      await expectText(phone, "#title", "You’re all set");
      assert.equal(
        await phone.sessionStorage(phoneSessionKey(tunnel)),
        null,
        "Done must forget the phone capability",
      );
    } finally {
      events.close();
    }
  });
}

export async function multipleFileTransfer(
  factory: BrowserFactory,
): Promise<void> {
  await withSession(factory, "multiple-file-transfer", async (phone) => {
    const tunnel = await createTunnel({ maxFiles: 3 });
    const events = await subscribe(tunnel);
    const files = await fixtures();
    try {
      await connect(phone, tunnel);
      await phone.upload("#files", [files.jpeg, files.png]);
      await waitFor(
        () => phone.texts(".upload-state"),
        (values) =>
          values.length === 2 && values.every((value) => value === "Sent"),
      );

      const state = await waitForSnapshot(
        tunnel,
        (value) =>
          value.files.length === 2 &&
          value.files.every((file) => file.status === "available"),
      );
      assert.deepEqual(
        state.files.map((file) => file.name).sort(),
        ["phone-photo.jpg", "phone-screenshot.png"],
      );

      const byName = new Map(state.files.map((file) => [file.name, file]));
      assert.deepEqual(
        await download(tunnel, byName.get("phone-photo.jpg")!.file_id),
        jpegBytes,
      );
      assert.deepEqual(
        await download(tunnel, byName.get("phone-screenshot.png")!.file_id),
        pngBytes,
      );
      assert.equal(
        (await snapshot(tunnel)).status,
        "complete",
        "downloading every file must complete the tunnel",
      );
      assert.equal(
        events.events.filter((event) => event.kind === "file.available").length,
        2,
      );
      assertOrdered(events.events);
    } finally {
      events.close();
    }
  });
}

export async function qrPairingHandoff(
  factory: BrowserFactory,
): Promise<void> {
  await withSession(factory, "qr-pairing-handoff", async (phone) => {
    const tunnel = await createTunnel();
    const files = await fixtures();

    const scannedUri = await renderAndScanQr(tunnel.pairing_uri);
    assert.equal(scannedUri, tunnel.pairing_uri);
    await phone.goto(scannedUri);
    await expectText(phone, "#connection", "Connected securely");
    await waitFor(
      () => phone.currentUrl(),
      (value) => new URL(value).hash === "",
    );

    const phoneCapability = await phone.sessionStorage(phoneSessionKey(tunnel));
    assert.ok(phoneCapability, "QR handoff must establish a phone session");
    assert.notEqual(phoneCapability, pairingSecret(tunnel));

    await phone.upload("#files", [files.jpeg]);
    await expectText(phone, ".upload-state", "Sent");
    const state = await waitForSnapshot(
      tunnel,
      (value) =>
        value.files.length === 1 && value.files[0]?.status === "available",
    );
    assert.deepEqual(
      await download(tunnel, state.files[0]!.file_id),
      jpegBytes,
      "the file selected after QR pairing must arrive byte-for-byte",
    );
    assert.equal((await snapshot(tunnel)).status, "complete");
  });
}

export async function pairingSecurity(factory: BrowserFactory): Promise<void> {
  const tunnel = await createTunnel();
  const first = await factory.newSession();
  const replay = await factory.newSession();
  const queryOnly = await factory.newSession();
  const queryTunnel = await createTunnel();
  try {
    await connect(first.page, tunnel);
    const capability = await first.page.sessionStorage(phoneSessionKey(tunnel));
    assert.ok(capability, "the claimed capability must be held in session storage");
    assert.notEqual(capability, pairingSecret(tunnel));

    await first.page.reload();
    await expectText(first.page, "#connection", "Connected securely");
    assert.equal(new URL(await first.page.currentUrl()).hash, "");

    await replay.page.goto(tunnel.pairing_uri);
    await expectText(
      replay.page,
      "#error",
      /state conflicts|already been used/i,
    );

    const url = new URL(queryTunnel.pairing_uri);
    const queryCredential = pairingSecret(queryTunnel);
    await queryOnly.page.goto(
      `${portalOrigin}${url.pathname}?c=${encodeURIComponent(queryCredential)}`,
    );
    await expectText(queryOnly.page, "#error", /incomplete|already been used/i);

    await cancel(tunnel);
    await cancel(queryTunnel);
  } finally {
    await Promise.all([
      first.close(),
      replay.close(),
      queryOnly.close(),
    ]);
  }
}

export async function validationFailures(
  factory: BrowserFactory,
): Promise<void> {
  await withSession(factory, "validation-failures", async (phone) => {
    const files = await fixtures();
    const mediaTunnel = await createTunnel({ accept: ["image/*"] });
    await connect(phone, mediaTunnel);
    await phone.upload("#files", [files.text]);
    await expectText(phone, "#error", /media type is not accepted/i);
    await expectText(phone, ".upload-state", "Failed");
    assert.equal((await snapshot(mediaTunnel)).files.length, 0);
    await cancel(mediaTunnel);

    const sizeTunnel = await createTunnel({
      accept: ["image/*"],
      maxFileBytes: 64,
    });
    await phone.goto(sizeTunnel.pairing_uri);
    await expectText(phone, "#connection", "Connected securely");
    await phone.upload("#files", [files.oversizedJpeg]);
    await expectText(phone, "#error", /too large/i);
    await expectText(phone, ".upload-state", "Failed");
    assert.equal((await snapshot(sizeTunnel)).files.length, 0);
    await cancel(sizeTunnel);
  });
}

export async function cancelledTunnelFailsClosed(
  factory: BrowserFactory,
): Promise<void> {
  await withSession(factory, "cancelled-tunnel", async (phone) => {
    const tunnel = await createTunnel();
    await cancel(tunnel);
    await phone.goto(tunnel.pairing_uri);
    await expectText(phone, "#error", /state conflicts/i);
    await expectText(phone, "#connection", "Connection unavailable");
  });
}

export async function portalPrivacy(factory: BrowserFactory): Promise<void> {
  const tunnel = await createTunnel();
  try {
    const response = await fetch(
      `${portalOrigin}${new URL(tunnel.pairing_uri).pathname}`,
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.match(
      response.headers.get("content-security-policy") ?? "",
      /frame-ancestors 'none'/,
    );
    assert.match(
      response.headers.get("permissions-policy") ?? "",
      /camera=\(\)/,
    );
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");

    await withSession(factory, "portal-fails-closed", async (page) => {
      await page.goto(`${portalOrigin}/`);
      await expectText(page, "#error", /valid tunnel/i);
      assert.match(await page.text("body"), /File Tunnel/);
    });
  } finally {
    await cancel(tunnel);
  }
}

export async function capabilityBoundaries(
  factory: BrowserFactory,
): Promise<void> {
  await withSession(factory, "capability-boundaries", async (phone) => {
    const tunnel = await createTunnel();
    const stream = await subscribe(tunnel);
    try {
      await connect(phone, tunnel);
      const phoneCapability = await phone.sessionStorage(phoneSessionKey(tunnel));
      assert.ok(phoneCapability);

      const anonymous = await fetch(
        `${apiOrigin}/v1/tunnels/${tunnel.tunnel_id}`,
      );
      assert.equal(anonymous.status, 401);

      const phoneCancel = await fetch(
        `${apiOrigin}/v1/tunnels/${tunnel.tunnel_id}`,
        {
          method: "DELETE",
          headers: { authorization: `Bearer ${phoneCapability}` },
        },
      );
      assert.equal(phoneCancel.status, 401);

      const desktopDeclare = await fetch(
        `${apiOrigin}/v1/tunnels/${tunnel.tunnel_id}/files`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${tunnel.desktop_capability}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            name: "desktop-cannot-upload.jpg",
            media_type: "image/jpeg",
            size_bytes: 1,
          }),
        },
      );
      assert.equal(desktopDeclare.status, 401);

      assert.equal((await snapshot(tunnel, phoneCapability)).status, "connected");
      await stream.assertTicketCannotBeReused(tunnel);
      await cancel(tunnel);
    } finally {
      stream.close();
    }
  });
}

async function connect(page: BrowserPage, tunnel: Tunnel): Promise<void> {
  assert.match(tunnel.pairing_uri, /#c=/);
  await page.goto(tunnel.pairing_uri);
  await expectText(page, "#connection", "Connected securely");
  await waitFor(
    () => page.currentUrl(),
    (value) => new URL(value).hash === "",
  );
}

async function expectText(
  page: BrowserPage,
  selector: string,
  expected: string | RegExp,
): Promise<string> {
  return waitFor(
    () => page.text(selector),
    (value) =>
      typeof expected === "string"
        ? value.toLocaleLowerCase().includes(expected.toLocaleLowerCase())
        : expected.test(value),
  );
}

function assertOrdered(events: TunnelEvent[]): void {
  assert.ok(events.length >= 4, "expected lifecycle and upload events");
  for (let index = 1; index < events.length; index += 1) {
    assert.ok(
      events[index]!.sequence > events[index - 1]!.sequence,
      "event sequence must be strictly increasing",
    );
  }
  assert.ok(events.some((event) => event.kind === "tunnel.connected"));
  assert.ok(events.some((event) => event.kind === "file.declared"));
  assert.ok(events.some((event) => event.kind === "file.progress"));
  assert.ok(events.some((event) => event.kind === "file.available"));
}
