import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL ??= 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

const { staleRunTimeoutMsFromEnv } = await import('../dist/routes/maintenance.js');

test('staleRunTimeoutMsFromEnv defaults to one hour', () => {
  const previous = process.env.CROSSBEAM_STALE_RUN_TIMEOUT_MINUTES;
  delete process.env.CROSSBEAM_STALE_RUN_TIMEOUT_MINUTES;
  assert.equal(staleRunTimeoutMsFromEnv(), 60 * 60 * 1000);
  if (previous !== undefined) process.env.CROSSBEAM_STALE_RUN_TIMEOUT_MINUTES = previous;
});

test('staleRunTimeoutMsFromEnv accepts configured minutes', () => {
  const previous = process.env.CROSSBEAM_STALE_RUN_TIMEOUT_MINUTES;
  process.env.CROSSBEAM_STALE_RUN_TIMEOUT_MINUTES = '15';
  assert.equal(staleRunTimeoutMsFromEnv(), 15 * 60 * 1000);
  if (previous === undefined) {
    delete process.env.CROSSBEAM_STALE_RUN_TIMEOUT_MINUTES;
  } else {
    process.env.CROSSBEAM_STALE_RUN_TIMEOUT_MINUTES = previous;
  }
});

test('staleRunTimeoutMsFromEnv falls back for unsafe values', () => {
  const previous = process.env.CROSSBEAM_STALE_RUN_TIMEOUT_MINUTES;
  process.env.CROSSBEAM_STALE_RUN_TIMEOUT_MINUTES = '1';
  assert.equal(staleRunTimeoutMsFromEnv(), 60 * 60 * 1000);
  if (previous === undefined) {
    delete process.env.CROSSBEAM_STALE_RUN_TIMEOUT_MINUTES;
  } else {
    process.env.CROSSBEAM_STALE_RUN_TIMEOUT_MINUTES = previous;
  }
});
