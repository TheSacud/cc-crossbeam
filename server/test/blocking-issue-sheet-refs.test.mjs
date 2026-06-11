import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL ??= 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

const { inferBlockingIssueSheetRefs } = await import('../dist/services/sandbox.js');

test('derives blocking issue refs from explicit page and desenho references only', () => {
  const manifest = {
    sheets: [
      { page: 1, desenho: null, title: 'Cover sheet / index', notes: 'Binder cover' },
      { page: 5, desenho: 5, title: 'Planta do R/Chao', notes: 'Ground floor plan' },
      { page: 6, desenho: 6, title: 'Planta do 1o Andar', notes: 'First floor plan' },
      { page: 13, desenho: 13, title: 'Alcados', notes: 'Elevations' },
      { page: 14, desenho: 14, title: 'Alcados (continued)', notes: 'More elevations' },
      { page: 19, desenho: 19, title: 'Quadro Sinoptico', notes: 'Area schedule' },
    ],
  };
  const draft = {
    blocking_issues: [
      { title: 'Typology mismatch: T3 (PIP) vs T4 (project)', source_findings: ['ARQ-005'] },
      { title: 'Quadro sinoptico contains critical errors', source_findings: ['ARQ-009'] },
      { title: 'Exterior colour palette contradicts PIP condition', source_findings: ['ARQ-007'] },
      { title: 'Core administrative documents missing', source_findings: ['ADM-002'] },
    ],
  };
  const allFiles = {
    'sheet-manifest.json': manifest,
    'draft_corrections.json': draft,
    'findings-arquitetura-urbanismo.json': [
      {
        id: 'ARQ-005',
        source_reference: 'desenho 5 and desenho 6',
        description: 'Typology is visible on the referenced drawings.',
      },
      {
        id: 'ARQ-009',
        source_reference: 'page 19',
        description: 'Area schedule inconsistency.',
      },
      {
        id: 'ARQ-007',
        source_reference: 'municipal condition',
        description: 'Compare with drawing 13 and drawing 14.',
      },
      {
        id: 'ADM-002',
        source_reference: 'administrative dossier',
        description: 'No sheet-level reference is provided.',
      },
    ],
  };

  inferBlockingIssueSheetRefs(allFiles);

  assert.deepEqual(
    draft.blocking_issues[0].sheet_refs.map((ref) => ref.page),
    [5, 6],
  );
  assert.equal(
    draft.blocking_issues[1].sheet_refs[0].title_block_png_path,
    'title-blocks/title-block-19.png',
  );
  assert.deepEqual(
    draft.blocking_issues[2].sheet_refs.map((ref) => ref.page),
    [13, 14],
  );
  assert.deepEqual(draft.blocking_issues[3].sheet_refs, []);
  assert.match(
    draft.blocking_issues[3].visual_note_summary,
    /No direct visual sheet reference was resolved/,
  );
});
