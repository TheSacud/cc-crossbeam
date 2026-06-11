import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL ??= 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

// supabase-js resolves the global fetch when the client is created, so install
// the override hook before importing the module under test.
const realFetch = globalThis.fetch;
let fetchOverride = null;
globalThis.fetch = (...args) => (fetchOverride ? fetchOverride(...args) : realFetch(...args));

const {
  RAW_ARTIFACTS_BUCKET,
  isRawArtifactsPointer,
  loadRawArtifacts,
  rawArtifactsStoragePath,
} = await import('../dist/services/supabase.js');

const pointer = {
  storage_pointer: true,
  bucket: RAW_ARTIFACTS_BUCKET,
  path: 'user-1/project-1/raw-artifacts-v2.json',
  size_bytes: 42,
  sha256: 'abc123',
};

test('isRawArtifactsPointer accepts storage pointers only', () => {
  assert.equal(isRawArtifactsPointer(pointer), true);
  assert.equal(isRawArtifactsPointer({ 'draft_corrections.json': {} }), false);
  assert.equal(isRawArtifactsPointer({ storage_pointer: true }), false);
  assert.equal(isRawArtifactsPointer(null), false);
  assert.equal(isRawArtifactsPointer([pointer]), false);
  assert.equal(isRawArtifactsPointer('crossbeam-outputs/a.json'), false);
});

test('rawArtifactsStoragePath builds the per-version payload path', () => {
  assert.equal(
    rawArtifactsStoragePath('user-1', 'project-1', 3),
    'user-1/project-1/raw-artifacts-v3.json',
  );
});

test('loadRawArtifacts returns inline records as-is', async () => {
  const inline = { 'draft_corrections.json': { blocking_issues: [] } };
  assert.deepEqual(await loadRawArtifacts({ raw_artifacts: inline }), inline);
});

test('loadRawArtifacts returns null when there is no payload', async () => {
  assert.equal(await loadRawArtifacts(null), null);
  assert.equal(await loadRawArtifacts({}), null);
  assert.equal(await loadRawArtifacts({ raw_artifacts: null }), null);
  assert.equal(await loadRawArtifacts({ raw_artifacts: 'not-a-record' }), null);
});

test('loadRawArtifacts downloads pointer payloads from storage', async () => {
  const payload = { 'project_understanding.json': { understanding_status: 'complete' } };
  const requested = [];
  fetchOverride = async (url) => {
    requested.push(String(url));
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const loaded = await loadRawArtifacts({ raw_artifacts: pointer });
    assert.deepEqual(loaded, payload);
    assert.equal(requested.length, 1);
    assert.match(requested[0], /crossbeam-outputs/);
    assert.match(requested[0], /raw-artifacts-v2\.json/);
  } finally {
    fetchOverride = null;
  }
});
