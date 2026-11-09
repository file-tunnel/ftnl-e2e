import assert from "node:assert/strict";

import {
  apiOrigin,
  cancel,
  createTunnel,
  download,
  phoneSessionKey,
  snapshot,
  subscribe,
  waitFor,
  type Tunnel,
} from "./api.js";
import { type BrowserFactory, type BrowserPage, withSession } from "./driver.js";
import { jpegBytes } from "./fixtures.js";

const firstChunkLength = 10;

function resource(tunnel: Tunnel, fileId?: string): string {
  const root = apiOrigin + "/v1/tunnels/" + tunnel.tunnel_id;
  return fileId ? root + "/files/" + fileId + "/content" : root;
}

function auth(capability: string): Record<string, string> {
  return { authorization: "Bearer " + capability };
}

async function connect(page: BrowserPage, tunnel: Tunnel): Promise<string> {
  await page.goto(tunnel.pairing_uri);
  const capability = await waitFor(
    () => page.sessionStorage(phoneSessionKey(tunnel)),
    (value) => Boolean(value),
  );
  assert.ok(capability, "phone must claim an independent session capability");
  await waitFor(
    () => page.text("#connection"),
    (value) => /connected securely/i.test(value),
  );
  assert.equal(new URL(await page.currentUrl()).hash, "", "browser must scrub QR secret");
  return capability;
}

async function declare(tunnel: Tunnel, phone: string, name: string): Promise<string> {
  const response = await fetch(resource(tunnel) + "/files", {
    method: "POST",
    headers: { ...auth(phone), "content-type": "application/json" },
    body: JSON.stringify({
      name,
      media_type: "image/jpeg",
      size_bytes: jpegBytes.length,
    }),
  });
  assert.equal(response.status, 201, "valid file declaration");
  const file = (await response.json()) as { file_id: string };
  assert.ok(file.file_id);
  return file.file_id;
}

async function put(
  tunnel: Tunnel,
  fileId: string,
  phone: string,
  range: string,
  body: Uint8Array,
): Promise<Response> {
  return fetch(resource(tunnel, fileId), {
    method: "PUT",
    headers: {
      ...auth(phone),
      "content-type": "application/octet-stream",
      "content-range": range,
    },
    body: new Uint8Array(body).buffer,
    redirect: "manual",
  });
}

function range(start: number, end: number, total = jpegBytes.length): string {
  return "bytes " + start + "-" + end + "/" + total;
}

function checkpointHeaders(response: Response, offset: number, complete: boolean): void {
  assert.equal(response.status, complete ? 204 : 308, "upload checkpoint response status");
  assert.equal(response.headers.get("x-upload-offset"), String(offset));
  assert.equal(response.headers.get("x-upload-complete"), String(complete));
}

async function checkpoint(
  tunnel: Tunnel,
  fileId: string,
  phone: string,
  offset: number,
  complete: boolean,
): Promise<void> {
  const response = await fetch(resource(tunnel, fileId), {
    method: "HEAD",
    headers: auth(phone),
    redirect: "manual",
  });
  checkpointHeaders(response, offset, complete);
}

async function problem(
  response: Response,
  expectedStatus: number,
  expectedCode: string,
  capability: string,
): Promise<void> {
  assert.equal(response.status, expectedStatus, "rejected request HTTP status");
  assert.match(response.headers.get("content-type") ?? "", /application\/problem\+json/);
  const body = await response.text();
  assert.ok(!body.includes(capability), "errors must not reflect credentials");
  const parsed = JSON.parse(body) as { code?: string; status?: number };
  assert.equal(parsed.code, expectedCode);
  assert.equal(parsed.status, expectedStatus);
}

/**
 * Browser performs the one-time QR claim; actual HTTP streaming checkpoints,
 * retries, corruption, and download hit the running Rust API.
 */
export async function resumableUploadRejectsCorruption(factory: BrowserFactory): Promise<void> {
  await withSession(factory, "resumable-adversarial", async (phonePage) => {
    const tunnel = await createTunnel();
    let completed = false;
    const events = await subscribe(tunnel);
    try {
      const phone = await connect(phonePage, tunnel);
      const fileId = await declare(tunnel, phone, "resumable-photo.jpg");
      await checkpoint(tunnel, fileId, phone, 0, false);

      const prefix = jpegBytes.subarray(0, firstChunkLength);
      checkpointHeaders(
        await put(tunnel, fileId, phone, range(0, firstChunkLength - 1), prefix),
        firstChunkLength,
        false,
      );
      await checkpoint(tunnel, fileId, phone, firstChunkLength, false);
      await events.waitFor("file.progress");

      await problem(
        await fetch(resource(tunnel, fileId), { headers: auth(tunnel.desktop_capability) }),
        409,
        "state_conflict",
        tunnel.desktop_capability,
      );

      const cases: Array<[string, Uint8Array, number, string]> = [
        [range(firstChunkLength + 2, firstChunkLength + 3), jpegBytes.subarray(12, 14), 409, "upload_offset_conflict"],
        [range(firstChunkLength - 1, firstChunkLength), jpegBytes.subarray(9, 11), 409, "upload_offset_conflict"],
        [range(0, firstChunkLength - 1), new Uint8Array(firstChunkLength).fill(0x5a), 409, "upload_offset_conflict"],
        [range(firstChunkLength, firstChunkLength + 2), jpegBytes.subarray(10, 11), 400, "invalid_request"],
        [range(0, firstChunkLength - 1, jpegBytes.length + 1), prefix, 400, "invalid_request"],
      ];

      for (const [contentRange, body, status, code] of cases) {
        await problem(await put(tunnel, fileId, phone, contentRange, body), status, code, phone);
        await checkpoint(tunnel, fileId, phone, firstChunkLength, false);
        const state = await snapshot(tunnel);
        assert.equal(state.files.length, 1, "rejected attempts cannot create files");
        assert.equal(state.files[0]?.bytes_transferred, firstChunkLength);
        assert.equal(state.files[0]?.status, "uploading");
      }

      checkpointHeaders(
        await put(tunnel, fileId, phone, range(0, firstChunkLength - 1), prefix),
        firstChunkLength,
        false,
      );
      await checkpoint(tunnel, fileId, phone, firstChunkLength, false);

      checkpointHeaders(
        await put(
          tunnel,
          fileId,
          phone,
          range(firstChunkLength, jpegBytes.length - 1),
          jpegBytes.subarray(firstChunkLength),
        ),
        jpegBytes.length,
        true,
      );
      await checkpoint(tunnel, fileId, phone, jpegBytes.length, true);
      await events.waitFor("file.available");
      const progress = events.events.filter(
        (event) => event.kind === "file.progress" && event.file_id === fileId,
      );
      assert.deepEqual(
        progress.map((event) => event.bytes_transferred),
        [firstChunkLength, jpegBytes.length],
        "bad requests and exact replay must not generate extra progress",
      );
      assert.equal(
        events.events.filter((event) => event.kind === "file.available" && event.file_id === fileId).length,
        1,
        "a completed upload publishes availability only once",
      );
      assert.deepEqual(await download(tunnel, fileId), jpegBytes);
      const finalState = await snapshot(tunnel);
      assert.equal(finalState.status, "complete");
      assert.equal(finalState.files[0]?.status, "downloaded");
      completed = true;
      await problem(
        await put(tunnel, fileId, phone, range(0, firstChunkLength - 1), prefix),
        409,
        "state_conflict",
        phone,
      );
    } finally {
      events.close();
      if (!completed) await cancel(tunnel).catch(() => undefined);
    }
  });
}

/** A cancelled tunnel discards incomplete data and cannot be resumed with old credentials. */
export async function cancellationRevokesInFlightTransfer(factory: BrowserFactory): Promise<void> {
  await withSession(factory, "cancel-incomplete-transfer", async (phonePage) => {
    const tunnel = await createTunnel();
    const events = await subscribe(tunnel);
    let cancelled = false;
    try {
      const phone = await connect(phonePage, tunnel);
      const fileId = await declare(tunnel, phone, "abandoned.jpg");
      const prefix = jpegBytes.subarray(0, firstChunkLength);
      checkpointHeaders(
        await put(tunnel, fileId, phone, range(0, firstChunkLength - 1), prefix),
        firstChunkLength,
        false,
      );
      await cancel(tunnel);
      cancelled = true;
      await events.waitFor("tunnel.cancelled");

      await problem(
        await put(
          tunnel,
          fileId,
          phone,
          range(firstChunkLength, jpegBytes.length - 1),
          jpegBytes.subarray(firstChunkLength),
        ),
        409,
        "state_conflict",
        phone,
      );
      const head = await fetch(resource(tunnel, fileId), {
        method: "HEAD", headers: auth(phone), redirect: "manual",
      });
      assert.equal(head.status, 409, "cancelled partial file cannot expose a checkpoint");
      await problem(
        await fetch(resource(tunnel, fileId), { headers: auth(tunnel.desktop_capability) }),
        409,
        "state_conflict",
        tunnel.desktop_capability,
      );
      await problem(
        await fetch(resource(tunnel), { headers: auth(tunnel.desktop_capability) }),
        409,
        "state_conflict",
        tunnel.desktop_capability,
      );
      await problem(
        await fetch(resource(tunnel) + "/event-tickets", {
          method: "POST", headers: auth(tunnel.desktop_capability),
        }),
        409,
        "state_conflict",
        tunnel.desktop_capability,
      );
      await problem(
        await fetch(resource(tunnel) + "/files", {
          method: "POST",
          headers: { ...auth(phone), "content-type": "application/json" },
          body: JSON.stringify({
            name: "post-cancel.jpg", media_type: "image/jpeg", size_bytes: jpegBytes.length,
          }),
        }),
        409,
        "state_conflict",
        phone,
      );
    } finally {
      events.close();
      if (!cancelled) await cancel(tunnel).catch(() => undefined);
    }
  });
}

/** Exceeding the declaration quota must not poison an otherwise valid transfer. */
export async function quotaRejectionPreservesTransfer(factory: BrowserFactory): Promise<void> {
  await withSession(factory, "quota-atomic-rejection", async (phonePage) => {
    const tunnel = await createTunnel({ maxFiles: 1 });
    let completed = false;
    try {
      const phone = await connect(phonePage, tunnel);
      const fileId = await declare(tunnel, phone, "allowed.jpg");
      await problem(
        await fetch(resource(tunnel) + "/files", {
          method: "POST",
          headers: { ...auth(phone), "content-type": "application/json" },
          body: JSON.stringify({
            name: "exceeds-quota.jpg",
            media_type: "image/jpeg",
            size_bytes: jpegBytes.length,
          }),
        }),
        413,
        "file_too_large",
        phone,
      );
      const state = await snapshot(tunnel);
      assert.equal(state.files.length, 1);
      assert.equal(state.files[0]?.file_id, fileId);
      assert.equal(state.files[0]?.status, "declared");
      checkpointHeaders(
        await put(tunnel, fileId, phone, range(0, jpegBytes.length - 1), jpegBytes),
        jpegBytes.length,
        true,
      );
      assert.deepEqual(await download(tunnel, fileId), jpegBytes);
      assert.equal((await snapshot(tunnel)).status, "complete");
      completed = true;
    } finally {
      if (!completed) await cancel(tunnel).catch(() => undefined);
    }
  });
}

/** Competing phone browsers must never receive two live phone capabilities. */
export async function concurrentPairingHasOneWinner(factory: BrowserFactory): Promise<void> {
  const tunnel = await createTunnel();
  const left = await factory.newSession();
  const right = await factory.newSession();
  try {
    await Promise.all([left.page.goto(tunnel.pairing_uri), right.page.goto(tunnel.pairing_uri)]);
    async function outcome(page: BrowserPage): Promise<"connected" | "rejected"> {
      return waitFor(async () => {
        const connected = await page.text("#connection").catch(() => "");
        if (/connected securely/i.test(connected)) return "connected" as const;
        const error = await page.text("#error").catch(() => "");
        if (/state conflicts|already been used/i.test(error)) return "rejected" as const;
        return "pending" as const;
      }, (value) => value !== "pending") as Promise<"connected" | "rejected">;
    }
    const results = await Promise.all([outcome(left.page), outcome(right.page)]);
    assert.deepEqual(results.sort(), ["connected", "rejected"]);
    const winner = results[0] === "connected" ? left.page : right.page;
    assert.ok(await winner.sessionStorage(phoneSessionKey(tunnel)));
    assert.equal(new URL(await winner.currentUrl()).hash, "");
    assert.equal((await snapshot(tunnel)).status, "connected");
  } finally {
    await cancel(tunnel).catch(() => undefined);
    await Promise.all([left.close(), right.close()]);
  }
}
