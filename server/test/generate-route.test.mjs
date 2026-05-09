import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'service-role-key';

const { resolveSupportedProjectCity } = await import('../dist/routes/generate.js');

test('resolveSupportedProjectCity accepts Viseu projects', () => {
  assert.equal(resolveSupportedProjectCity({ city: 'Viseu' }), 'Viseu');
  assert.equal(resolveSupportedProjectCity({ city: '  Viseu  ' }), 'Viseu');
});

test('resolveSupportedProjectCity fails fast for unsupported cities', () => {
  assert.throws(
    () => resolveSupportedProjectCity({ city: 'Placentia' }),
    /Unsupported city: only Viseu is enabled in this runtime/,
  );
});

test('resolveSupportedProjectCity fails fast when city is missing', () => {
  assert.throws(
    () => resolveSupportedProjectCity({ city: null }),
    /Unsupported city: only Viseu is enabled in this runtime/,
  );
});
