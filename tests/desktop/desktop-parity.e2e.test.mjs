import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, "../..");
const sourceLock = readJson(path.join(testDirectory, "sources.json"));
const interfacesRoot = path.resolve(
  process.env.FTNL_INTERFACES_DIR ?? path.join(repositoryRoot, "../ftnl-interfaces"),
);
const rustRoot = path.resolve(
  process.env.FTNL_RUST_DESKTOP_DIR ??
    path.join(repositoryRoot, "../ftnl-desktop-app.rs"),
);
const evidenceRoot = path.resolve(
  process.env.FTNL_DESKTOP_EVIDENCE_DIR ??
    path.join(repositoryRoot, "../../file-tunnel-test/contract-conformance-tests"),
);

const schema = readJson(path.join(interfacesRoot, "schema/desktop-workspace.schema.json"));
const proximity = readJson(path.join(interfacesRoot, "schema/proximity.schema.json"));
const rustManifest = readJson(
  path.join(rustRoot, "contracts/desktop-feature-manifest.json"),
);
const flutterEvidence = readJson(
  path.join(evidenceRoot, "fixtures/flutter-desktop-evidence.json"),
);
const expectedFeatures = [
  "clipboard.capture.pause",
  "clipboard.clear_unpinned",
  "clipboard.deduplicate",
  "clipboard.delete",
  "clipboard.history.text",
  "clipboard.pin",
  "clipboard.retention",
  "clipboard.search",
  "desktop.tray.lifecycle",
  "desktop.window.close_to_tray",
  "desktop.window.regular",
  "privacy.source_exclusions",
];

test("desktop sources are immutable and traceable across organizations", () => {
  assert.equal(sourceLock.contractRevision, "DEN-3384.v1");
  assert.deepEqual(Object.keys(sourceLock.sources), [
    "interfaces",
    "rustDesktop",
    "flutterDesktop",
    "flutterEvidence",
  ]);
  for (const source of Object.values(sourceLock.sources)) {
    assert.match(source.commit, /^[0-9a-f]{40}$/);
    assert.match(source.repository, /^(file-tunnel|file-tunnel-test)\/[A-Za-z0-9._-]+$/);
  }
  assertRevision(interfacesRoot, sourceLock.sources.interfaces.commit);
  assertRevision(rustRoot, sourceLock.sources.rustDesktop.commit);
  assertRevision(evidenceRoot, sourceLock.sources.flutterEvidence.commit);
});

test("workspace schema accounts for the same ordered baseline in both desktop apps", () => {
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.$defs.schemaVersion.const, 1);
  assert.deepEqual(schema.$defs.implementation.enum, [
    "rust_desktop",
    "flutter_desktop",
  ]);
  assert.deepEqual(schema.$defs.featureId.enum, expectedFeatures);
  const manifestFeatures =
    schema.$defs.implementationManifest.properties.features;
  assert.equal(manifestFeatures.minItems, expectedFeatures.length);
  assert.equal(manifestFeatures.maxItems, expectedFeatures.length);
  assert.equal(schema.$defs.implementationManifest.additionalProperties, false);
  assert.equal(schema.$defs.parityManifest.additionalProperties, false);
});

test("Rust and Flutter publish exactly equal implemented feature semantics", () => {
  assert.equal(flutterEvidence.repository, sourceLock.sources.flutterDesktop.repository);
  assert.equal(flutterEvidence.commit, sourceLock.sources.flutterDesktop.commit);
  assert.equal(flutterEvidence.interface_commit, sourceLock.sources.interfaces.commit);

  const flutterManifest = flutterEvidence.feature_manifest;
  assert.equal(rustManifest.implementation, "rust_desktop");
  assert.equal(flutterManifest.implementation, "flutter_desktop");
  const rustSemantics = validateManifest(rustManifest);
  const flutterSemantics = validateManifest(flutterManifest);
  assert.deepEqual(rustSemantics, flutterSemantics);
  assert.ok(rustSemantics.every(([, status]) => status === "implemented"));
});

test("Rust resolves the same immutable interface revision as Flutter evidence", () => {
  const interfaceCommit = sourceLock.sources.interfaces.commit;
  const cargoManifest = fs.readFileSync(path.join(rustRoot, "Cargo.toml"), "utf8");
  const cargoLock = fs.readFileSync(path.join(rustRoot, "Cargo.lock"), "utf8");
  assert.match(
    cargoManifest,
    new RegExp(
      `ftnl-interfaces = \\{ git = "https://github\\.com/file-tunnel/ftnl-interfaces\\.git", rev = "${interfaceCommit}" \\}`,
    ),
  );
  assert.ok(
    cargoLock.includes(
      `git+https://github.com/file-tunnel/ftnl-interfaces.git?rev=${interfaceCommit}#${interfaceCommit}`,
    ),
  );
  assert.equal(flutterEvidence.interface_commit, interfaceCommit);
});

test("proximity transport cannot become identity proof or an application update channel", () => {
  assert.match(proximity.description, /transport evidence only/i);
  assert.match(proximity.description, /never increase authentication assurance/i);
  for (const name of [
    "discoveryAdvertisement",
    "handshakeHello",
    "encryptedFrame",
    "sharedAuthStepUpPayload",
    "peerInfoOfferPayload",
    "updateManifestOfferPayload",
  ]) {
    assert.equal(proximity.$defs[name].additionalProperties, false, `${name} is open-ended`);
  }

  const sharedAuth = proximity.$defs.sharedAuthStepUpPayload;
  assert.match(sharedAuth.description, /No factor result returns over proximity/i);
  assert.match(sharedAuth.properties.opaque_request_b64url.description, /Never a bearer token/i);
  assert.equal(sharedAuth.properties.opaque_request_b64url.maxLength, 2731);

  const peerInfo = proximity.$defs.peerInfoOfferPayload;
  assert.equal(peerInfo.properties.content_size_bytes.maximum, 32768);

  const update = proximity.$defs.updateManifestOfferPayload;
  assert.match(update.description, /Signed HTTPS manifest metadata only/i);
  assert.match(update.description, /Raw applications.*prohibited/i);
  assert.equal(update.properties.manifest_url.pattern, "^https://");
  assert.equal(update.properties.signature_algorithm.const, "ed25519");
  assert.ok(update.properties.distribution.enum.includes("testflight"));
  for (const forbidden of ["application_binary", "installer", "silent_install"])
    assert.equal(update.properties[forbidden], undefined);
});

test("desktop and proximity schemas stay closed and credential-free", () => {
  const forbiddenProperties = new Set([
    "access_token",
    "assurance_level",
    "authorization",
    "bearer_token",
    "factor_result",
    "installer",
    "otp",
    "password",
    "private_key",
    "refresh_token",
    "silent_install",
  ]);
  const visit = (value, location) => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${location}[${index}]`));
      return;
    }
    if (!value || typeof value !== "object") return;
    if (value.type === "object") {
      assert.equal(
        value.additionalProperties,
        false,
        `${location} must reject unknown fields`,
      );
    }
    if (value.properties) {
      for (const name of Object.keys(value.properties)) {
        assert.equal(
          forbiddenProperties.has(name),
          false,
          `${location} exposes forbidden property ${name}`,
        );
      }
    }
    for (const [key, child] of Object.entries(value)) visit(child, `${location}.${key}`);
  };

  visit(schema, "desktop-workspace.schema.json");
  visit(proximity, "proximity.schema.json");

  const serializedEvidence = JSON.stringify({
    rust: rustManifest,
    flutter: flutterEvidence.feature_manifest,
  });
  assert.doesNotMatch(
    serializedEvidence,
    /access[_-]token|refresh[_-]token|bearer[_-]token|private[_-]key|file:\/\//i,
  );
});

function validateManifest(manifest) {
  assert.deepEqual(Object.keys(manifest), ["implementation", "features"]);
  assert.equal(manifest.features.length, expectedFeatures.length);
  return manifest.features.map((feature, index) => {
    assert.deepEqual(Object.keys(feature), ["feature_id", "status", "evidence"]);
    assert.equal(feature.feature_id, expectedFeatures[index]);
    assert.equal(feature.status, "implemented");
    assert.ok(Array.isArray(feature.evidence));
    assert.ok(feature.evidence.length >= 1 && feature.evidence.length <= 8);
    assert.equal(new Set(feature.evidence).size, feature.evidence.length);
    for (const evidence of feature.evidence) {
      assert.match(evidence, /^[A-Za-z0-9._/ :-]{1,160}$/);
    }
    return [feature.feature_id, feature.status];
  });
}

function assertRevision(root, expected) {
  const actual = childProcess
    .execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" })
    .trim();
  if (process.env.FTNL_VERIFY_DESKTOP_REVISIONS === "1") {
    assert.equal(actual, expected);
    return;
  }
  childProcess.execFileSync("git", [
    "-C",
    root,
    "merge-base",
    "--is-ancestor",
    expected,
    actual,
  ]);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
