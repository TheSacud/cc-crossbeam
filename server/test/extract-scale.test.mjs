import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL ||= 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-key';

const { inferScale } = await import('../dist/services/extract.js');

test('inferScale parses standard title-block scale formats', () => {
  assert.equal(inferScale('ESCALA: 1:100'), '1:100');
  assert.equal(inferScale('scale 1 / 200'), '1:200');
  assert.equal(inferScale('Esc. 1-50'), '1:50');
});

test('inferScale normalizes common title-block OCR mistakes', () => {
  assert.equal(inferScale('ee | | ESCALA: [11100 |'), '1:100');
  assert.equal(inferScale('| ESCALA: | SCALA: 4:100 | 100 A'), '1:100');
  assert.equal(inferScale('ESCALA: l:2O'), '1:20');
});

test('inferScale does not treat arbitrary drawing dimensions as scales', () => {
  assert.equal(inferScale('0.30 1.60 6.70 2.75 3.35'), null);
  assert.equal(inferScale('Data: 01-2025 SISTEMA DE COORDENADAS PT-TM06'), null);
  assert.equal(inferScale('EE Po 511.75 —Y'), null);
  assert.equal(inferScale('Data: [o1-2025 | (SISTEMA DE COORDENADAS PT-TMOG/ETRS89>'), null);
  assert.equal(inferScale('01-2025 ALÇADOS'), null);
});
