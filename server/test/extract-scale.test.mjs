import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL ||= 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-key';

const { inferScale, selectPlanBinderPdf } = await import('../dist/services/extract.js');

function fileRecord(filename, overrides = {}) {
  return {
    id: filename,
    filename,
    storage_path: `uploads/${filename}`,
    file_type: 'other',
    created_at: null,
    ...overrides,
  };
}

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

test('selectPlanBinderPdf prefers the explicit plan binder PDF', () => {
  const selected = selectPlanBinderPdf([
    fileRecord('01-corrections-letter.pdf', { created_at: '2026-01-01T00:00:00.000Z' }),
    fileRecord('zz-main-binder.pdf', {
      file_type: 'plan-binder',
      created_at: '2026-01-02T00:00:00.000Z',
    }),
  ]);

  assert.equal(selected?.filename, 'zz-main-binder.pdf');
});

test('selectPlanBinderPdf falls back to plan-like PDF names before administrative PDFs', () => {
  const selected = selectPlanBinderPdf([
    fileRecord('01-corrections-letter.pdf', { created_at: '2026-01-01T00:00:00.000Z' }),
    fileRecord('02-plantas-arquitetura.pdf', { created_at: '2026-01-02T00:00:00.000Z' }),
  ]);

  assert.equal(selected?.filename, '02-plantas-arquitetura.pdf');
});

test('selectPlanBinderPdf has a stable fallback when there are no binder hints', () => {
  const selected = selectPlanBinderPdf([
    fileRecord('b-document.pdf', { created_at: '2026-01-02T00:00:00.000Z' }),
    fileRecord('a-document.pdf', { created_at: '2026-01-01T00:00:00.000Z' }),
    fileRecord('z-image.png', { created_at: '2025-01-01T00:00:00.000Z' }),
  ]);

  assert.equal(selected?.filename, 'a-document.pdf');
});

test('inferScale does not treat arbitrary drawing dimensions as scales', () => {
  assert.equal(inferScale('0.30 1.60 6.70 2.75 3.35'), null);
  assert.equal(inferScale('Data: 01-2025 SISTEMA DE COORDENADAS PT-TM06'), null);
  assert.equal(inferScale('EE Po 511.75 —Y'), null);
  assert.equal(inferScale('Data: [o1-2025 | (SISTEMA DE COORDENADAS PT-TMOG/ETRS89>'), null);
  assert.equal(inferScale('01-2025 ALÇADOS'), null);
});
