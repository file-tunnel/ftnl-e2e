import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("tests/browser");
const frameworks = ["playwright", "puppeteer", "selenium"];

for (const framework of frameworks) {
  const directory = path.join(root, framework);
  const tests = (await readdir(directory))
    .filter((name) => name.endsWith(".test.ts"))
    .sort();
  assert.ok(
    tests.length >= 3,
    `${framework} must provide transfer, security, and resilience test modules`,
  );
  for (const required of [
    "transfer.test.ts",
    "security.test.ts",
    "resilience.test.ts",
  ]) {
    assert.ok(
      tests.includes(required),
      `${framework} is missing ${required}`,
    );
  }
  process.stdout.write(`${framework}: ${tests.length} test modules\n`);
}
