import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const jpegBytes = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0xff, 0xd9,
]);

export const pngBytes = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
]);

export interface FixtureFiles {
  jpeg: string;
  png: string;
  text: string;
  oversizedJpeg: string;
}

let fixturePromise: Promise<FixtureFiles> | undefined;

export function fixtures(): Promise<FixtureFiles> {
  fixturePromise ??= createFixtures();
  return fixturePromise;
}

async function createFixtures(): Promise<FixtureFiles> {
  const directory = path.join(tmpdir(), `ftnl-e2e-${process.pid}`);
  await mkdir(directory, { recursive: true });
  const files = {
    jpeg: path.join(directory, "phone-photo.jpg"),
    png: path.join(directory, "phone-screenshot.png"),
    text: path.join(directory, "not-an-image.txt"),
    oversizedJpeg: path.join(directory, "too-large.jpg"),
  };
  await Promise.all([
    writeFile(files.jpeg, jpegBytes),
    writeFile(files.png, pngBytes),
    writeFile(files.text, "File Tunnel validation fixture\n"),
    writeFile(files.oversizedJpeg, Buffer.alloc(512, 0x5a)),
  ]);
  return files;
}
