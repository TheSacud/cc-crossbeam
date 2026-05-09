import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

process.env.SUPABASE_URL ??= 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

const {
  buildAnalysisPhaseOutputData,
  buildResponsePhaseOutputData,
} = await import('../dist/services/sandbox.js');

const fixtureRoot = path.resolve('..', 'test-assets', 'viseu-correction-01');

async function readJson(...parts) {
  return JSON.parse(await readFile(path.join(fixtureRoot, ...parts), 'utf8'));
}

async function readText(...parts) {
  return readFile(path.join(fixtureRoot, ...parts), 'utf8');
}

function fixtureProjectUnderstanding() {
  return {
    project_summary: {
      project_type: 'moradia unifamiliar',
      work_type: 'alteracao e ampliacao com legalizacao parcial',
      confidence: 'medium',
      summary_text:
        'O dossier contem pecas de arquitetura, uma folha parcial de acessibilidades e quadro de areas.',
    },
    building_program: [
      {
        level_name: 'Piso 0',
        spaces: ['habitacao', 'anexo a legalizar'],
        stated_areas: [
          {
            label: 'Quadro de areas',
            value: 'ver folha A05',
            value_type: 'declared',
            usable_for_compliance: false,
          },
        ],
        confidence: 'medium',
        evidence_refs: ['ev_area_table'],
      },
    ],
    site_and_mass: {
      accesses: ['acesso a partir da via publica'],
      parking: 'Estacionamento referido pela notificacao municipal, sem enquadramento PDMV bastante.',
      confidence: 'medium',
      evidence_refs: ['ev_site_plan'],
    },
    key_tables_and_legends: {
      synoptic_table_present: true,
      legend_present: true,
      scales: ['1:100'],
      north_arrow_present: true,
      confidence: 'medium',
      evidence_refs: ['ev_area_table', 'ev_accessibility'],
    },
    discipline_coverage: [
      {
        discipline: 'arquitetura',
        present_pages: [1, 2, 3, 4, 5],
        missing_expected: [],
        confidence: 'high',
      },
      {
        discipline: 'acessibilidades',
        present_pages: [6],
        missing_expected: ['cotas completas', 'declives', 'detalhe construtivo'],
        confidence: 'medium',
      },
    ],
    evidence_index: [
      {
        id: 'ev_site_plan',
        page: 1,
        evidence_type: 'site-plan',
        quote: 'Planta de implantacao e localizacao',
        crop_box: { x: 0.05, y: 0.08, width: 0.55, height: 0.45, unit: 'percent' },
      },
      {
        id: 'ev_area_table',
        page: 5,
        evidence_type: 'area-table',
        quote: 'Quadro de areas',
        crop_box: { x: 0.58, y: 0.12, width: 0.35, height: 0.34, unit: 'percent' },
      },
      {
        id: 'ev_accessibility',
        page: 6,
        evidence_type: 'accessibility-plan',
        quote: 'Acessibilidades - nota e esquema parcial',
        crop_box: { x: 0.12, y: 0.18, width: 0.72, height: 0.52, unit: 'percent' },
      },
    ],
    open_questions: [],
    understanding_status: 'partial',
  };
}

test('Viseu correction fixture runs analysis and response artifact pipeline end-to-end', async () => {
  const sheetManifest = await readJson('expected', 'analysis', 'sheet-manifest.json');
  const analysisRawFiles = {
    'sheet-manifest.json': sheetManifest,
    'project_understanding.json': fixtureProjectUnderstanding(),
    'corrections_parsed.json': await readJson('expected', 'analysis', 'corrections_parsed.json'),
    'corrections_categorized.json': await readJson('expected', 'analysis', 'corrections_categorized.json'),
    'municipal_compliance.json': await readJson('expected', 'analysis', 'municipal_compliance.json'),
    'national_compliance.json': await readJson('expected', 'analysis', 'national_compliance.json'),
    'applicant_questions.json': await readJson('expected', 'analysis', 'contractor_questions.json'),
  };

  const analysisOutput = buildAnalysisPhaseOutputData(analysisRawFiles);

  assert.equal(analysisOutput.project_understanding_json?.evidence_index.length, 3);
  assert.equal(analysisOutput.project_understanding_json?.evidence_index[0].title, 'Planta de implantacao e localizacao');
  assert.equal(analysisOutput.project_understanding_json?.evidence_index[0].page_png_path, 'pages-png/page-01.png');
  assert.equal(
    analysisOutput.raw_artifacts['project_understanding.json'].evidence_index[0].crop_box.unit,
    'percent',
  );

  assert.equal(analysisOutput.corrections_analysis_json.length, 5);
  assert.equal(analysisOutput.applicant_questions_json?.question_groups.length, 3);
  assert.equal(analysisOutput.applicant_questions_json?.question_groups[0].questions[0].related_finding_ids[0], 'VC1-1');
  assert.equal(analysisOutput.applicant_questions_json?.question_groups[0].questions[0].determination_status, 'needs_official_source');
  assert.equal(analysisOutput.raw_artifacts['validation_report.json'].summary.total_findings, 5);
  assert.ok(analysisOutput.raw_artifacts['validation_report.json'].summary.source_needed_findings >= 1);
  assert.equal(analysisOutput.raw_artifacts['validation_report.json'].summary.depends_on_pdmv_findings, 1);

  const responseRawFiles = {
    ...analysisRawFiles,
    'response_letter.md': await readText('expected', 'response', 'response_letter.md'),
    'professional_scope.md': await readText('expected', 'response', 'professional_scope.md'),
    'corrections_report.md': await readText('expected', 'response', 'corrections_report.md'),
    'sheet_annotations.json': await readJson('expected', 'response', 'sheet_annotations.json'),
  };

  const responseOutput = buildResponsePhaseOutputData(responseRawFiles);

  assert.match(responseOutput.response_letter_md, /Exmos\. Senhores/i);
  assert.match(responseOutput.professional_scope_md, /NIP/i);
  assert.match(responseOutput.corrections_report_md, /VC1-3/i);
  assert.equal(responseOutput.sheet_annotations_json.length, 3);
  assert.equal(responseOutput.sheet_annotations_json[0].sheet_id, 'AC01');
  assert.equal(responseOutput.project_understanding_json?.evidence_index[2].page_png_path, 'pages-png/page-06.png');
});
