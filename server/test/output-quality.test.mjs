import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareReviewOutputRegression,
  evaluateReviewOutputQuality,
  selectRegressionBaseline,
} from '../dist/services/output-quality.js';

function makeSnapshot(overrides = {}) {
  const review_checklist_json = {
    total_findings: {
      total: 8,
      determination_counts: {
        confirmed_non_compliance: 2,
        document_missing_or_incomplete: 6,
        needs_official_source: 0,
        inconclusive: 0,
      },
    },
    blocking_issues: [
      {
        title: 'PIP e loteamento: alteração ao alvará necessária',
        source_findings: ['ARQ-001'],
        evidence_refs: ['ev_pip'],
        sheet_refs: [{ page: 1 }],
      },
      {
        title: 'Quadro sinóptico sem parâmetros PDMV e estacionamento',
        source_findings: ['ARQ-002'],
        evidence_refs: ['ev_qs'],
        sheet_refs: [{ page: 19 }],
      },
      {
        title: 'Ficha SCIE e segurança contra incêndio em falta',
        source_findings: ['SCIE-001'],
        evidence_refs: ['ev_docs'],
        sheet_refs: [],
      },
      {
        title: 'Planta de implantação cotada sem cotas e afastamentos',
        source_findings: ['ARQ-003'],
        evidence_refs: ['ev_implantacao'],
        sheet_refs: [{ page: 3 }],
      },
      {
        title: 'Documentos administrativos, termos e certidões em falta',
        source_findings: ['INST-001'],
        evidence_refs: ['ev_docs'],
        sheet_refs: [],
      },
      {
        title: 'Tipologia T3/T4 por fração deve ser coerente',
        source_findings: ['ARQ-004'],
        evidence_refs: ['ev_typology'],
        sheet_refs: [{ page: 5 }],
      },
    ],
    additional_corrections: [],
    source_needed_items: [],
    depends_on_pdmv_items: [],
  };

  const snapshot = {
    id: 'current',
    created_at: '2026-05-11T00:00:00Z',
    agent_turns: 40,
    agent_cost_usd: 3,
    agent_duration_ms: 600000,
    project_understanding_json: {
      understanding_status: 'complete',
      evidence_index: [{ id: 'ev_pip' }, { id: 'ev_qs' }],
    },
    review_checklist_json,
    raw_artifacts: {
      'sheet-manifest.json': {
        sheets: Array.from({ length: 4 }, (_, index) => ({
          page: index + 1,
          desenho: index + 1,
          title: `Sheet ${index + 1}`,
          scale: '1:100',
        })),
      },
    },
  };

  return {
    ...snapshot,
    ...overrides,
    review_checklist_json: {
      ...review_checklist_json,
      ...(overrides.review_checklist_json || {}),
    },
    raw_artifacts: {
      ...snapshot.raw_artifacts,
      ...(overrides.raw_artifacts || {}),
    },
  };
}

test('quality gate passes complete Viseu review output', () => {
  const quality = evaluateReviewOutputQuality(makeSnapshot());
  assert.equal(quality.status, 'pass');
  assert.equal(quality.metrics.source_needed_items, 0);
  assert.equal(quality.metrics.depends_on_pdmv_items, 0);
  assert.equal(quality.mandatory_topics.every((topic) => topic.status === 'pass'), true);
});

test('quality gate fails missing project understanding and mandatory topic', () => {
  const snapshot = makeSnapshot({
    project_understanding_json: { understanding_status: 'partial', evidence_index: [] },
    review_checklist_json: {
      blocking_issues: [],
      source_needed_items: [{ ref: 'SRC-1' }],
    },
  });
  const quality = evaluateReviewOutputQuality(snapshot);
  assert.equal(quality.status, 'fail');
  assert.equal(quality.checks.find((check) => check.id === 'project_understanding_complete')?.status, 'fail');
  assert.equal(quality.checks.find((check) => check.id === 'no_source_needed')?.status, 'fail');
  assert.ok(quality.mandatory_topics.some((topic) => topic.status === 'fail'));
});

test('regression report warns when blocker topic moves to additional correction', () => {
  const baseline = makeSnapshot({ id: 'baseline', agent_cost_usd: 2.5 });
  const current = makeSnapshot({
    id: 'current',
    review_checklist_json: {
      blocking_issues: baseline.review_checklist_json.blocking_issues.filter((issue) => !/Tipologia/i.test(issue.title)),
      additional_corrections: [{ title: 'Tipologia T3/T4 por fração deve ser esclarecida' }],
    },
  });
  const report = compareReviewOutputRegression(current, baseline);
  assert.equal(report.status, 'warn');
  assert.equal(report.checks.some((check) => check.id === 'topic_downgraded_typology'), true);
});

test('regression report treats finding volume growth as pass when useful findings grow', () => {
  const baseline = makeSnapshot({ id: 'baseline' });
  const current = makeSnapshot({
    id: 'current',
    review_checklist_json: {
      total_findings: {
        total: 20,
        determination_counts: {
          confirmed_non_compliance: 8,
          document_missing_or_incomplete: 12,
          needs_official_source: 0,
          inconclusive: 0,
        },
      },
    },
  });
  const report = compareReviewOutputRegression(current, baseline);
  const volume = report.checks.find((check) => check.id === 'finding_volume_increase');
  assert.equal(volume?.status, 'pass');
  assert.equal(report.value_comparison.verdict, 'improved');
  assert.equal(report.value_comparison.delta.useful_findings, 12);
});

test('regression report warns when finding volume grows without useful value', () => {
  const baseline = makeSnapshot({ id: 'baseline' });
  const duplicateFinding = {
    title: 'Quadro sinóptico sem parâmetros PDMV e estacionamento',
    source_findings: ['ARQ-002'],
    evidence_refs: ['ev_qs'],
    sheet_refs: [{ page: 19 }],
  };
  const current = makeSnapshot({
    id: 'current',
    review_checklist_json: {
      total_findings: {
        total: 20,
        determination_counts: {
          confirmed_non_compliance: 2,
          document_missing_or_incomplete: 6,
          needs_official_source: 0,
          inconclusive: 0,
        },
      },
      additional_corrections: Array.from({ length: 12 }, () => duplicateFinding),
    },
  });
  const report = compareReviewOutputRegression(current, baseline);
  const volume = report.checks.find((check) => check.id === 'finding_volume_increase');
  assert.equal(volume?.status, 'warn');
  assert.equal(report.value_comparison.verdict, 'noisier');
  assert.ok(report.value_comparison.current.duplicate_issue_entries > 0);
});

test('baseline selector prefers highest quality then lower cost', () => {
  const bad = makeSnapshot({
    id: 'bad',
    agent_cost_usd: 1,
    project_understanding_json: { understanding_status: 'partial', evidence_index: [] },
  });
  const expensive = makeSnapshot({ id: 'expensive', agent_cost_usd: 5 });
  const cheap = makeSnapshot({ id: 'cheap', agent_cost_usd: 3 });
  const selected = selectRegressionBaseline([bad, expensive, cheap], 'current');
  assert.equal(selected?.id, 'cheap');
});
