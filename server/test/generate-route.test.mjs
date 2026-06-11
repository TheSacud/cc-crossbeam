import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'service-role-key';

const { resolveSupportedProjectCity } = await import('../dist/routes/generate.js');
const { processingStatusForFlow } = await import('../dist/services/supabase.js');

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

test('processingStatusForFlow maps flows to their lock status', () => {
  assert.equal(processingStatusForFlow('city-review'), 'processing');
  assert.equal(processingStatusForFlow('corrections-analysis'), 'processing-phase1');
  assert.equal(processingStatusForFlow('corrections-response'), 'processing-phase2');
});
