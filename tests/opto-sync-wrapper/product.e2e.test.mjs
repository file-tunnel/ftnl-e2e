import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const profilePath = process.env.OPTO_SYNC_PROFILE;
const NO_SYNC = profilePath
  ? false
  : 'run through the isolated Opto-Sync workflow with OPTO_SYNC_PROFILE set';
const require = createRequire(import.meta.url);

let profile;
let sdk;
if (!NO_SYNC) {
  require('fake-indexeddb/auto');
  profile = JSON.parse(readFileSync(profilePath, 'utf8'));
  sdk = require(process.env.OPTO_SYNC_SDK_ENTRY ?? '../dist/index.js');
}

const {
  OptoSyncClient,
  createOptoSyncClient,
  initOptoSync,
  SYNC_STATUS,
  reconcileIncoming,
  engineVersion,
} = sdk ?? {};

const SHA256 = /^[0-9a-f]{64}$/;

function assertSafeByteCount(value, label) {
  assert.ok(Number.isSafeInteger(value) && value >= 0, `${label} must be a nonnegative safe integer`);
}

function assertSha256(value, label) {
  assert.equal(typeof value, 'string', `${label} must be a string`);
  assert.match(value, SHA256, `${label} must be canonical lowercase SHA-256 text`);
}

function assertCheckpoint(checkpoint, label) {
  assertSafeByteCount(checkpoint.confirmedOffset, `${label}.confirmedOffset`);
  assertSafeByteCount(checkpoint.totalBytes, `${label}.totalBytes`);
  assert.ok(
    checkpoint.confirmedOffset <= checkpoint.totalBytes,
    `${label}.confirmedOffset must not exceed totalBytes`,
  );
  assert.ok(
    Number.isSafeInteger(checkpoint.lastChunkIndex) && checkpoint.lastChunkIndex >= -1,
    `${label}.lastChunkIndex must be a safe integer greater than or equal to -1`,
  );
}

async function deleteDatabase(name) {
  await new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
}

async function openClient(databaseName) {
  if (typeof initOptoSync === 'function') await initOptoSync();
  if (typeof createOptoSyncClient === 'function') {
    return createOptoSyncClient({
      databaseName,
      stampUpdatedAt: false,
    });
  }
  return new OptoSyncClient({
    databaseName,
    stampUpdatedAt: false,
  });
}

test(
  'the downstream profile keeps product policy above the shared engine',
  { skip: NO_SYNC },
  () => {
    assert.equal(profile.dependency.package, 'opto-sync/opto-sync-clients');
    assert.equal(profile.dependency.range, '^0.2.0');
    assert.ok(profile.collections.length > 0);
    assert.ok(profile.writeStrategies.includes('queuedOptimistic'));
    assert.ok(profile.writeStrategies.includes('remoteConfirmed'));
    assert.ok(profile.domainGuards.length > 0);
    assert.ok(profile.persistence.web.includes('indexeddb'));
    assert.ok(profile.persistence.mobile.includes('sqlite'));
    assert.ok(profile.persistence.backend.includes('postgres'));
    assert.ok(profile.persistence.backend.includes('supabase'));
  },
);

test(
  'a product mutation survives restart, keeps its protocol id, and hides a stale server echo',
  { skip: NO_SYNC },
  async (t) => {
    const databaseName =
      `opto-downstream-${profile.repository.replaceAll('/', '-')}`;
    const collection = profile.collections[0];
    const recordId = 'wrapper-record-1';
    const pendingPayload = {
      id: recordId,
      title: 'edited offline',
      product: profile.repository,
      updatedAt: 5000,
    };

    await deleteDatabase(databaseName);
    t.after(() => deleteDatabase(databaseName));

    const client = await openClient(databaseName);
    const mutationId = await client.queueMutation(
      collection,
      recordId,
      pendingPayload,
    );
    const firstPush = await client.protocolPushRequest();
    const replayedPush = await client.protocolPushRequest();
    assert.deepEqual(
      firstPush.mutations.map((mutation) => mutation.mutationId),
      replayedPush.mutations.map((mutation) => mutation.mutationId),
    );
    client.db.close();

    const reopened = new OptoSyncClient({
      databaseName,
      stampUpdatedAt: false,
    });
    const pendingAfterRestart = await reopened.pendingMutations();
    assert.equal(pendingAfterRestart.length, 1);
    assert.equal(pendingAfterRestart[0].tableName, collection);
    assert.equal(pendingAfterRestart[0].recordId, recordId);
    assert.deepEqual(
      JSON.parse(pendingAfterRestart[0].jsonPayload),
      pendingPayload,
    );

    const staleServerEcho = {
      id: recordId,
      title: 'stale server value',
      product: profile.repository,
      updatedAt: 10,
    };
    const visible = reopened.reconcileIncoming(
      collection,
      recordId,
      staleServerEcho,
      pendingPayload,
    );
    assert.equal(visible.title, 'edited offline');
    assert.equal(visible.updatedAt, 5000);

    await reopened.markMutation(mutationId, SYNC_STATUS.SYNCED);
    assert.equal((await reopened.pendingMutations()).length, 0);
    reopened.db.close();
  },
);

test(
  'timestamp conflicts and tombstones are deterministic in the installed engine',
  { skip: NO_SYNC },
  async () => {
    if (typeof initOptoSync === 'function') await initOptoSync();

    const local = {
      id: 'conflict-1',
      value: 'new local',
      updatedAt: 200,
    };
    const staleIncoming = {
      id: 'conflict-1',
      value: 'old server',
      updatedAt: 100,
    };
    assert.deepEqual(reconcileIncoming(local, staleIncoming), local);

    const staleLiveRecord = {
      id: 'deleted-1',
      value: 'must not resurrect',
      tombstone: false,
      updatedAt: 100,
    };
    const newerTombstone = {
      id: 'deleted-1',
      value: null,
      tombstone: true,
      deletedAt: 200,
      updatedAt: 200,
    };
    const winner = reconcileIncoming(staleLiveRecord, newerTombstone);
    assert.equal(winner.tombstone, true);
    assert.equal(winner.deletedAt, 200);
    assert.equal(winner.value, null);
    assert.match(String(engineVersion()), /^\d+\.\d+\.\d+/);
  },
);

test(
  'File Tunnel exposes only bounded metadata and excludes blob and credential material',
  { skip: NO_SYNC },
  () => {
    assert.deepEqual(
      [...profile.collections].sort(),
      ['chunk_receipts', 'integrity_metadata', 'resume_checkpoints', 'transfer_manifests'],
    );
    const forbiddenCollections = new Set([
      'blob_bytes',
      'chunk_bytes',
      'decryption_keys',
      'encryption_keys',
      'file_contents',
      'object_store_credentials',
      'raw_chunks',
      'session_tokens',
      'signed_upload_urls',
      'storage_secrets',
    ]);
    assert.equal(
      profile.collections.some((collection) =>
        forbiddenCollections.has(collection),
      ),
      false,
    );
    assert.ok(
      profile.domainGuards.some((guard) =>
        guard.includes('file bytes and encrypted blob transport'),
      ),
    );
    assert.ok(
      profile.domainGuards.some((guard) =>
        guard.includes('chunk offsets, integrity hashes, ownership, and resume checkpoints'),
      ),
    );

    assertSha256('a'.repeat(64), 'content hash');
    assert.throws(() => assertSha256('A'.repeat(64), 'uppercase hash'), /canonical lowercase/);
    assert.throws(() => assertSha256('abc', 'short hash'), /canonical lowercase/);
    assertSafeByteCount(0, 'zero bytes');
    assertSafeByteCount(4096, 'total bytes');
    assert.throws(() => assertSafeByteCount(-1, 'negative bytes'), /nonnegative safe integer/);
  },
);

test(
  'manifest and checkpoint mutations sharing a transfer id remain isolated and monotonic',
  { skip: NO_SYNC },
  async (t) => {
    const databaseName =
      `opto-ftnl-integrity-${profile.repository.replaceAll('/', '-')}`;
    const transferId = 'transfer-42';

    await deleteDatabase(databaseName);
    t.after(() => deleteDatabase(databaseName));

    const manifest = {
      id: transferId,
      ownerId: 'owner-42',
      objectRef: 'object-safe-ref',
      fileName: 'archive.bin',
      totalBytes: 4096,
      chunkSize: 1024,
      contentSha256: 'b'.repeat(64),
      state: 'uploading',
      updatedAt: 700,
    };
    const checkpoint = {
      id: transferId,
      transferId,
      confirmedOffset: 2048,
      totalBytes: 4096,
      lastChunkIndex: 1,
      updatedAt: 701,
    };
    assertSafeByteCount(manifest.totalBytes, 'manifest.totalBytes');
    assertSafeByteCount(manifest.chunkSize, 'manifest.chunkSize');
    assertSha256(manifest.contentSha256, 'manifest.contentSha256');
    assertCheckpoint(checkpoint, 'checkpoint');

    const client = await openClient(databaseName);
    const manifestMutationId = await client.queueMutation(
      'transfer_manifests',
      transferId,
      manifest,
    );
    const checkpointMutationId = await client.queueMutation(
      'resume_checkpoints',
      transferId,
      checkpoint,
    );
    assert.notEqual(manifestMutationId, checkpointMutationId);

    const firstPush = await client.protocolPushRequest();
    const replayedPush = await client.protocolPushRequest();
    const projection = (request) =>
      request.mutations.map((mutation) => ({
        mutationId: mutation.mutationId,
        recordId: mutation.recordId,
        table: mutation.table,
      }));
    assert.deepEqual(projection(replayedPush), projection(firstPush));
    assert.deepEqual(
      new Set(firstPush.mutations.map((mutation) => mutation.table)),
      new Set(['transfer_manifests', 'resume_checkpoints']),
    );

    client.db.close();
    const reopened = new OptoSyncClient({
      databaseName,
      stampUpdatedAt: false,
    });
    const afterRestart = await reopened.pendingMutations();
    assert.deepEqual(
      new Set(afterRestart.map((mutation) => mutation.tableName)),
      new Set(['transfer_manifests', 'resume_checkpoints']),
    );

    await reopened.markMutation(manifestMutationId, SYNC_STATUS.SYNCED);
    const remaining = await reopened.pendingMutations();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].tableName, 'resume_checkpoints');
    assertCheckpoint(JSON.parse(remaining[0].jsonPayload), 'remaining checkpoint');
    reopened.db.close();
  },
);

test(
  'server-authoritative completion and abort prevent incomplete-transfer resurrection',
  { skip: NO_SYNC },
  async () => {
    if (typeof initOptoSync === 'function') await initOptoSync();

    const staleUploading = {
      id: 'transfer-complete-1',
      state: 'uploading',
      confirmedOffset: 3072,
      totalBytes: 4096,
      contentSha256: null,
      integrityVerified: false,
      immutable: false,
      updatedAt: 400,
    };
    const authoritativeCompletion = {
      id: 'transfer-complete-1',
      state: 'completed',
      confirmedOffset: 4096,
      totalBytes: 4096,
      contentSha256: 'c'.repeat(64),
      integrityVerified: true,
      immutable: true,
      completedAt: 500,
      updatedAt: 500,
    };
    assertCheckpoint(
      {...authoritativeCompletion, lastChunkIndex: 3},
      'completed transfer',
    );
    assertSha256(authoritativeCompletion.contentSha256, 'completed content hash');
    let winner = reconcileIncoming(staleUploading, authoritativeCompletion);
    assert.equal(winner.state, 'completed');
    assert.equal(winner.confirmedOffset, winner.totalBytes);
    assert.equal(winner.integrityVerified, true);
    assert.equal(winner.immutable, true);

    const staleResurrection = {
      ...staleUploading,
      confirmedOffset: 3584,
      updatedAt: 450,
    };
    assert.deepEqual(
      reconcileIncoming(authoritativeCompletion, staleResurrection),
      authoritativeCompletion,
    );

    const staleUploadingAbort = {
      id: 'transfer-abort-1',
      state: 'uploading',
      confirmedOffset: 1024,
      totalBytes: 4096,
      tombstone: false,
      updatedAt: 400,
    };
    const authoritativeAbort = {
      id: 'transfer-abort-1',
      state: 'aborted',
      confirmedOffset: 2048,
      totalBytes: 4096,
      tombstone: true,
      deletedAt: 500,
      immutable: true,
      updatedAt: 500,
    };
    winner = reconcileIncoming(staleUploadingAbort, authoritativeAbort);
    assert.equal(winner.state, 'aborted');
    assert.equal(winner.tombstone, true);
    assert.equal(winner.immutable, true);
    assert.deepEqual(
      reconcileIncoming(authoritativeAbort, {
        ...staleUploadingAbort,
        updatedAt: 450,
      }),
      authoritativeAbort,
    );
  },
);
