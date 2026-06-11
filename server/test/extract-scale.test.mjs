import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL ||= 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-key';

const {
  buildPreliminarySheetManifest,
  hasPdfMagicBytes,
  inferScale,
  normalizeVisionSheetMetadata,
  pdfExtractionLimitsFromEnv,
  selectPlanBinderPdf,
} = await import('../dist/services/extract.js');

const LIMIT_ENV_NAMES = [
  'CROSSBEAM_MAX_PDF_BYTES',
  'CROSSBEAM_MAX_PDF_MB',
  'CROSSBEAM_MAX_PLAN_PDF_PAGES',
  'CROSSBEAM_MAX_DOCUMENT_PDF_PAGES',
];

function withLimitEnv(values, callback) {
  const previous = Object.fromEntries(
    LIMIT_ENV_NAMES.map((name) => [name, process.env[name]]),
  );

  for (const name of LIMIT_ENV_NAMES) {
    delete process.env[name];
  }
  Object.assign(process.env, values);

  try {
    callback();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value == null) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

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

function pageText(page, text = '') {
  return {
    page,
    text,
    text_length: text.length,
    has_extractable_text: text.length > 0,
    source: text.length > 0 ? 'pdf-native' : 'none',
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

test('hasPdfMagicBytes accepts only PDF headers', () => {
  assert.equal(hasPdfMagicBytes(Buffer.from('%PDF-1.7\n')), true);
  assert.equal(hasPdfMagicBytes(Buffer.from('\n%PDF-1.4\n')), true);
  assert.equal(hasPdfMagicBytes(Buffer.from('not a pdf')), false);
});

test('pdfExtractionLimitsFromEnv reads safe configured limits', () => {
  withLimitEnv(
    {
      CROSSBEAM_MAX_PDF_MB: '2',
      CROSSBEAM_MAX_PLAN_PDF_PAGES: '42',
      CROSSBEAM_MAX_DOCUMENT_PDF_PAGES: '12',
    },
    () => {
      assert.deepEqual(pdfExtractionLimitsFromEnv('plan-binder'), {
        maxBytes: 2 * 1024 * 1024,
        maxPages: 42,
      });
      assert.deepEqual(pdfExtractionLimitsFromEnv('document'), {
        maxBytes: 2 * 1024 * 1024,
        maxPages: 12,
      });
    },
  );
});

test('pdfExtractionLimitsFromEnv ignores unsafe env values', () => {
  withLimitEnv(
    {
      CROSSBEAM_MAX_PDF_BYTES: '4096',
      CROSSBEAM_MAX_PDF_MB: '2',
      CROSSBEAM_MAX_PLAN_PDF_PAGES: '0',
    },
    () => {
      assert.deepEqual(pdfExtractionLimitsFromEnv('plan-binder'), {
        maxBytes: 4096,
        maxPages: 120,
      });
    },
  );
});

test('normalizeVisionSheetMetadata canonicalizes structured vision metadata', () => {
  const metadata = normalizeVisionSheetMetadata(3, {
    has_title_block: true,
    selected_crop: 'right',
    title: ' Planta do Piso 1 ',
    desenho: '7',
    scale: '1 / 100',
    discipline: 'arquitetura-urbanismo',
    confidence: 'high',
    notes: 'visible legend',
  }, 'test-model');

  assert.deepEqual(metadata, {
    page: 3,
    has_title_block: true,
    selected_crop: 'right',
    title: 'Planta do Piso 1',
    desenho: 7,
    scale: '1:100',
    discipline: 'arquitetura-urbanismo',
    confidence: 'high',
    notes: 'visible legend',
    source: 'anthropic-vision',
    model: 'test-model',
  });
});

test('buildPreliminarySheetManifest prefers usable vision metadata over OCR fallback', () => {
  const manifest = buildPreliminarySheetManifest(
    [pageText(1, 'random cover text without sheet title')],
    'binder.pdf',
    [],
    [
      normalizeVisionSheetMetadata(1, {
        has_title_block: true,
        selected_crop: 'bottom-right',
        title: 'Planta de Implantacao',
        desenho: 2,
        scale: '1:200',
        discipline: 'arquitetura-urbanismo',
        confidence: 'medium',
        notes: 'legend in bottom-right crop',
      }, 'test-model'),
    ],
  );

  assert.equal(manifest.generated_by, 'crossbeam-preextract-vision');
  assert.equal(manifest.sheets[0].title, 'Planta de Implantacao');
  assert.equal(manifest.sheets[0].desenho, 2);
  assert.equal(manifest.sheets[0].scale, '1:200');
  assert.equal(manifest.sheets[0].metadata_source, 'vision');
  assert.equal(manifest.sheets[0].selected_title_block_crop, 'bottom-right');
  assert.equal(manifest.sheets[0].needs_visual_review, true);
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
