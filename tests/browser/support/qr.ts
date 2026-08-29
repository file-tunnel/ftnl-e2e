import assert from "node:assert/strict";

import jsQRModule from "jsqr";
import { PNG } from "pngjs";
import QRCode from "qrcode";

const decodeQr = jsQRModule as unknown as (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: { inversionAttempts: "dontInvert" },
) => { data: string } | null;

/**
 * Produces the same PNG artifact shown by a desktop QR surface and decodes its
 * pixels as a phone scanner would. The image stays in memory so fragment
 * credentials never enter screenshots, traces, logs, or retained artifacts.
 */
export async function renderAndScanQr(payload: string): Promise<string> {
  assert.ok(payload.length > 0, "QR payload must not be empty");
  const encoded = await QRCode.toBuffer(payload, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 4,
    scale: 8,
  });
  const image = PNG.sync.read(encoded);
  const decoded = decodeQr(
    Uint8ClampedArray.from(image.data),
    image.width,
    image.height,
    { inversionAttempts: "dontInvert" },
  );
  assert.ok(decoded, "mobile QR scanner must decode the pairing artifact");
  assert.equal(decoded.data, payload, "QR scanning must preserve the pairing URI exactly");
  return decoded.data;
}
