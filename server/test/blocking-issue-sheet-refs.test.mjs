import test from 'node:test';
import assert from 'node:assert/strict';

function toPagePngPath(page) {
  return `pages-png/page-${String(page).padStart(2, '0')}.png`;
}

function toTitleBlockPath(page) {
  return `title-blocks/title-block-${String(page).padStart(2, '0')}.png`;
}

function buildSheetRef(sheet) {
  return {
    page: sheet.page,
    desenho: sheet.desenho ?? null,
    title: sheet.title || `Page ${sheet.page}`,
    page_png_path: sheet.page_png_path || toPagePngPath(sheet.page),
    title_block_png_path: sheet.title_block_png_path || toTitleBlockPath(sheet.page),
    visual_note: sheet.notes || null,
  };
}

function deriveBlockingRefs(manifest, draft) {
  const byPage = new Map(manifest.sheets.map((sheet) => [sheet.page, sheet]));
  const byDesenho = new Map(
    manifest.sheets.filter((sheet) => sheet.desenho != null).map((sheet) => [sheet.desenho, sheet]),
  );

  const issueSheetHints = [
    { pattern: /Typology mismatch|T3 .* T4/i, desenhos: [5, 6], summary: 'Floor plans show the unit typology used to support this blocking issue.' },
    { pattern: /Quadro sinoptico/i, desenhos: [19], summary: 'The synoptic sheet contains the contradictory area and index data supporting this blocking issue.' },
    { pattern: /Exterior colour palette/i, desenhos: [13, 14], summary: 'Elevations show the exterior palette referenced in this blocking issue.' },
    { pattern: /Core administrative documents missing/i, pages: [1], summary: 'The submitted binder content supports the dossier-level incompleteness referenced in this blocking issue.' },
  ];

  for (const issue of draft.blocking_issues) {
    const matched = new Map();
    const hint = issueSheetHints.find((candidate) => candidate.pattern.test(issue.title));
    if (hint?.desenhos) {
      for (const desenho of hint.desenhos) {
        const sheet = byDesenho.get(desenho);
        if (!sheet) continue;
        const ref = buildSheetRef(sheet);
        ref.visual_note = hint.summary;
        matched.set(ref.page, ref);
      }
    }
    if (hint?.pages) {
      for (const page of hint.pages) {
        const sheet = byPage.get(page);
        if (!sheet) continue;
        const ref = buildSheetRef(sheet);
        ref.visual_note = hint.summary;
        matched.set(ref.page, ref);
      }
    }
    issue.sheet_refs = [...matched.values()].sort((a, b) => a.page - b.page).slice(0, 3);
    if (issue.sheet_refs.length === 0) {
      issue.visual_note_summary = hint?.summary || 'No direct visual sheet reference was resolved for this blocking issue; review remains primarily documental/procedural.';
    }
  }
}

test('derive blocking issue refs for quadro sinoptico and T3/T4 issues', () => {
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

  deriveBlockingRefs(manifest, draft);

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
  assert.equal(
    draft.blocking_issues[3].sheet_refs[0].page_png_path,
    'pages-png/page-01.png',
  );
});
