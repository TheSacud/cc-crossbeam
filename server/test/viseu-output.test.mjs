import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCanonicalViseuReviewArtifacts,
  buildViseuAnalysisArtifactsForSandbox,
  normalizeViseuFinding,
  normalizeSheetManifest,
} from '../dist/services/viseu-output.js';

process.env.SUPABASE_URL ??= 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

const {
  buildAnalysisPhaseOutputData,
  buildResponsePhaseOutputData,
  buildReviewPhaseOutputData,
  normalizeProjectUnderstandingForOutput,
} = await import('../dist/services/sandbox.js');

test('normalizeSheetManifest converges old and new manifest shapes', () => {
  const oldManifest = {
    sheets: [
      {
        page_number: 5,
        sheet_title: 'Planta do Piso 0',
        sheet_id: '05',
        content_summary: 'Ground-floor layout',
      },
    ],
  };
  const newManifest = {
    sheets: [
      {
        page: 5,
        title: 'Planta do Piso 0',
        desenho: 5,
        notes: 'Ground-floor layout',
      },
    ],
  };

  const oldNormalized = normalizeSheetManifest(oldManifest);
  const newNormalized = normalizeSheetManifest(newManifest);

  assert.deepEqual(oldNormalized?.sheets, newNormalized?.sheets);
});

test('canonical v2 preserves blocking issues and derives sheet refs', () => {
  const rawFiles = {
    'sheet-manifest.json': {
      sheets: [
        { page: 5, desenho: 5, title: 'Planta RC', notes: 'Ground floor' },
        { page: 6, desenho: 6, title: 'Planta Piso 1', notes: 'First floor' },
      ],
    },
    'project_understanding.json': {
      project_summary: {
        project_type: 'moradia',
        work_type: 'alteracao',
        confidence: 'medium',
        summary_text: 'The submitted drawings include floor plans relevant to typology.',
      },
      building_program: [],
      site_and_mass: { accesses: [], confidence: 'medium', evidence_refs: ['ev_typology'] },
      key_tables_and_legends: { scales: [], confidence: 'medium', evidence_refs: ['ev_typology'] },
      discipline_coverage: [],
      evidence_index: [
        { id: 'ev_typology', page: 5, evidence_type: 'floor-plan', quote: 'Floor plan typology evidence' },
      ],
      open_questions: [],
      understanding_status: 'partial',
    },
    'draft_corrections.json': {
      municipality: 'Viseu',
      document_type: 'draft_corrections_letter',
      review_outcome: 'needs_corrections',
      total_findings: { total: 1 },
      blocking_issues: [
        {
          title: 'Typology mismatch: T3 vs T4',
          description: 'Project plans show a T4 instead of the approved T3.',
          priority: 1,
          source_scope: 'municipal-viseu',
          source_findings: ['ARQ-005'],
        },
      ],
    },
    'findings-arquitetura-urbanismo.json': [
      {
        id: 'ARQ-005',
        process_type: 'licenciamento',
        review_area: 'arquitetura-urbanismo',
        finding_category: 'REGULATORY_NON_COMPLIANCE',
        description: 'Typology mismatch noted in page 5 and page 6 floor plans.',
        source_scope: 'municipal-viseu',
        source_doc: 'rmue.md',
        article_or_section: 'art. 12',
        source_reference: 'RMUE art. 12 page 5 page 6',
        verification_status: 'official_verified',
        evidence_status: 'confirmed',
        evidence_refs: ['ev_typology'],
      },
    ],
  };

  const { canonicalReviewChecklist } = buildCanonicalViseuReviewArtifacts(rawFiles);
  assert.equal(canonicalReviewChecklist?.schema_version, 1);
  assert.equal(canonicalReviewChecklist?.blocking_issues.length, 1);
  assert.deepEqual(
    canonicalReviewChecklist?.blocking_issues[0].sheet_refs.map((ref) => ref.page),
    [5, 6],
  );
});

test('canonical v1/v3 promotion converts critical_blockers into blocking_issues', () => {
  const rawFiles = {
    'sheet-manifest.json': {
      sheets: [
        { page_number: 19, sheet_title: 'Quadro Sinoptico', sheet_designation: 19, content_summary: 'Area schedule' },
      ],
    },
    'project_understanding.json': {
      project_summary: {
        project_type: 'moradia',
        work_type: 'alteracao',
        confidence: 'medium',
        summary_text: 'The submitted drawings include a synoptic area table.',
      },
      building_program: [],
      site_and_mass: { accesses: [], confidence: 'medium', evidence_refs: ['ev_area_table'] },
      key_tables_and_legends: { scales: [], confidence: 'medium', evidence_refs: ['ev_area_table'] },
      discipline_coverage: [],
      evidence_index: [
        { id: 'ev_area_table', page: 19, evidence_type: 'area-table', quote: 'Quadro sinoptico' },
      ],
      open_questions: [],
      understanding_status: 'partial',
    },
    'draft_corrections.json': {
      municipality: 'Viseu',
      critical_blockers: ['ARQ-009'],
      all_findings: [
        {
          id: 'ARQ-009',
          process_type: 'licenciamento',
          review_area: 'arquitetura-urbanismo',
          finding_category: 'REGULATORY_NON_COMPLIANCE',
          description: 'Quadro sinoptico contains critical area inconsistencies on page 19.',
          source_scope: 'municipal-viseu',
          source_doc: 'rmue.md',
          article_or_section: 'art. 18',
          source_reference: 'RMUE art. 18 page 19',
          verification_status: 'official_verified',
          evidence_status: 'confirmed',
          evidence_refs: ['ev_area_table'],
        },
      ],
    },
  };

  const { canonicalReviewChecklist } = buildCanonicalViseuReviewArtifacts(rawFiles);
  assert.equal(canonicalReviewChecklist?.blocking_issues.length, 1);
  assert.equal(canonicalReviewChecklist?.blocking_issues[0].source_findings[0], 'ARQ-009');
  assert.equal(canonicalReviewChecklist?.blocking_issues[0].sheet_refs[0].page, 19);
});

test('review_summary fills outcome and recommendation when draft omits them', () => {
  const rawFiles = {
    'sheet-manifest.json': { sheets: [] },
    'draft_corrections.json': {
      municipality: 'Viseu',
      blocking_issues: [],
    },
    'review_summary.json': {
      review_outcome: 'rejected',
      recommendation: 'Reject until the blocking issues are resolved.',
      review_outcome_rationale: 'Multiple blocking issues remain unresolved.',
    },
  };

  const { canonicalReviewChecklist } = buildCanonicalViseuReviewArtifacts(rawFiles);
  assert.equal(canonicalReviewChecklist?.review_outcome, 'rejected');
  assert.equal(canonicalReviewChecklist?.recommendation, 'Reject until the blocking issues are resolved.');
  assert.equal(canonicalReviewChecklist?.review_outcome_rationale, 'Multiple blocking issues remain unresolved.');
});

test('analysis gate classifies findings with explicit determination status', () => {
  const confirmed = normalizeViseuFinding({
    item_id: 'VC1-2',
    finding_category: 'MISSING_DRAWING_OR_ELEMENT',
    source_scope: 'municipal-viseu',
    source_doc: 'rmue.md',
    article_or_section: 'art. 20',
    source_reference: 'RMUE art. 20',
    verification_status: 'official_verified',
    evidence_status: 'missing-from-submission',
  });
  const sourceNeeded = normalizeViseuFinding({
    item_id: 'VC1-1',
    finding_category: 'REGULATORY_NON_COMPLIANCE',
    source_scope: 'municipal-viseu',
    source_reference: 'RMUE art. 17',
    evidence_status: 'source-needed',
  });
  const inconclusive = normalizeViseuFinding({
    item_id: 'VC1-3',
    finding_category: 'MUNICIPAL_PROCEDURE_MISMATCH',
    source_scope: 'municipal-viseu',
    source_doc: 'rmue.md',
    article_or_section: 'art. 43',
    source_reference: 'RMUE art. 43 + pdmv-operational-baseline.md',
    verification_status: 'official_verified',
    evidence_status: 'depends-on-pdmv',
  });

  assert.equal(confirmed.determination_status, 'document_missing_or_incomplete');
  assert.equal(sourceNeeded.determination_status, 'needs_official_source');
  assert.equal(inconclusive.determination_status, 'inconclusive');
});

test('analysis normalizes evidence refs against project understanding index', () => {
  const rawFiles = {
    'sheet-manifest.json': {
      sheets: [{ page: 5, desenho: 5, title: 'Quadro de areas' }],
    },
    'project_understanding.json': {
      project_summary: {
        project_type: 'moradia',
        work_type: 'alteracao',
        confidence: 'medium',
        summary_text: 'The submission includes an area schedule.',
      },
      building_program: [],
      site_and_mass: { accesses: [], confidence: 'medium', evidence_refs: ['ev_area'] },
      key_tables_and_legends: { scales: [], confidence: 'medium', evidence_refs: ['ev_area'] },
      discipline_coverage: [],
      evidence_index: [
        { id: 'ev_area', page: 5, evidence_type: 'area-table', quote: 'Quadro de areas' },
      ],
      open_questions: [],
      understanding_status: 'partial',
    },
    'corrections_categorized.json': [
      {
        item_id: 'ARQ-AREA',
        finding_category: 'REGULATORY_NON_COMPLIANCE',
        source_scope: 'municipal-viseu',
        source_doc: 'rmue.md',
        article_or_section: 'art. 1',
        source_reference: 'RMUE art. 1',
        verification_status: 'official_verified',
        evidence_status: 'confirmed',
        evidence_refs: ['ev_area', 'missing_ev'],
      },
    ],
  };

  const { normalizedFindings } = buildViseuAnalysisArtifactsForSandbox(rawFiles);

  assert.deepEqual(normalizedFindings?.[0].evidence_refs, ['ev_area']);
  assert.deepEqual(normalizedFindings?.[0].gate_reasons, []);
});

test('analysis demotes project-dependent confirmed findings without evidence refs', () => {
  const rawFiles = {
    'project_understanding.json': {
      project_summary: {
        project_type: 'moradia',
        work_type: 'alteracao',
        confidence: 'medium',
        summary_text: 'The submission includes parking information.',
      },
      building_program: [],
      site_and_mass: { accesses: [], parking: 'Parking shown on plan', confidence: 'medium', evidence_refs: ['ev_parking'] },
      key_tables_and_legends: { scales: [], confidence: 'medium', evidence_refs: ['ev_parking'] },
      discipline_coverage: [],
      evidence_index: [
        { id: 'ev_parking', page: 3, evidence_type: 'site-plan', quote: 'Parking layout' },
      ],
      open_questions: [],
      understanding_status: 'partial',
    },
    'corrections_categorized.json': [
      {
        item_id: 'ARQ-PARK',
        finding_category: 'REGULATORY_NON_COMPLIANCE',
        description: 'Parking appears insufficient for the proposal.',
        source_scope: 'municipal-viseu',
        source_doc: 'rmue.md',
        article_or_section: 'art. 54',
        source_reference: 'RMUE art. 54',
        verification_status: 'official_verified',
        evidence_status: 'confirmed',
      },
    ],
  };

  const { normalizedFindings } = buildViseuAnalysisArtifactsForSandbox(rawFiles);

  assert.equal(normalizedFindings?.[0].determination_status, 'inconclusive');
  assert.ok(normalizedFindings?.[0].gate_reasons.includes('insufficient_project_evidence'));
});

test('review gate demotes blocker when linked finding lacks evidence refs', () => {
  const rawFiles = {
    'draft_corrections.json': {
      municipality: 'Viseu',
      critical_blockers: ['ARQ-PARK'],
    },
    'project_understanding.json': {
      project_summary: {
        project_type: 'moradia',
        work_type: 'alteracao',
        confidence: 'medium',
        summary_text: 'The submission includes parking information.',
      },
      building_program: [],
      site_and_mass: { accesses: [], parking: 'Parking shown on plan', confidence: 'medium', evidence_refs: ['ev_parking'] },
      key_tables_and_legends: { scales: [], confidence: 'medium', evidence_refs: ['ev_parking'] },
      discipline_coverage: [],
      evidence_index: [
        { id: 'ev_parking', page: 3, evidence_type: 'site-plan', quote: 'Parking layout' },
      ],
      open_questions: [],
      understanding_status: 'partial',
    },
    'sheet-manifest.json': {
      sheets: [{ page: 3, desenho: 3, title: 'Implantacao' }],
    },
    'municipal_compliance.json': [
      {
        item_id: 'ARQ-PARK',
        description: 'Parking appears insufficient for the proposal.',
        finding_category: 'REGULATORY_NON_COMPLIANCE',
        source_scope: 'municipal-viseu',
        source_doc: 'rmue.md',
        article_or_section: 'art. 54',
        source_reference: 'RMUE art. 54',
        verification_status: 'official_verified',
        evidence_status: 'confirmed',
      },
    ],
  };

  const { canonicalReviewChecklist } = buildCanonicalViseuReviewArtifacts(rawFiles);

  assert.equal(canonicalReviewChecklist?.blocking_issues.length, 0);
  assert.equal(canonicalReviewChecklist?.additional_corrections[0].determination_status, 'inconclusive');
  assert.equal(canonicalReviewChecklist?.additional_corrections[0].reason, 'demoted_from_blocking_issue_due_to_insufficient_support');
  assert.equal(canonicalReviewChecklist?.validation_report.summary.demoted_findings, 1);
  assert.equal(canonicalReviewChecklist?.validation_report.summary.removed_blocking_issues, 1);
  assert.equal(canonicalReviewChecklist?.validation_report.removed_blocking_issues[0].title, 'Parking appears insufficient for the proposal.');
});

test('analysis phase persists normalized findings and enriched applicant questions', () => {
  const rawFiles = {
    'corrections_categorized.json': [
      {
        item_id: 'VC1-1',
        process_type: 'licenciamento',
        review_area: 'instrucao-administrativa',
        finding_category: 'SOURCE_NEEDED',
        source_scope: 'procedure-instruction',
        source_reference: 'RMUE art. 17 + nip.md',
        evidence_status: 'source-needed',
        needs_question: true,
      },
      {
        item_id: 'VC1-2',
        process_type: 'licenciamento',
        review_area: 'acessibilidades-seguranca',
        finding_category: 'MISSING_DRAWING_OR_ELEMENT',
        source_scope: 'municipal-viseu',
        source_doc: 'rmue.md',
        article_or_section: 'art. 20',
        source_reference: 'RMUE art. 20',
        verification_status: 'official_verified',
        evidence_status: 'missing-from-submission',
        needs_question: false,
      },
    ],
    'applicant_questions.json': {
      question_groups: [
        {
          group_id: 'instruction',
          title: 'Instruction',
          questions: [
            {
              question_key: 'q_vc1_1_0',
              question_text: 'Question for VC1-1',
            },
          ],
        },
      ],
    },
  };

  const analysisArtifacts = buildViseuAnalysisArtifactsForSandbox(rawFiles);
  const outputData = buildAnalysisPhaseOutputData(rawFiles);

  assert.equal(analysisArtifacts.normalizedFindings?.[0].determination_status, 'inconclusive');
  assert.equal(analysisArtifacts.normalizedFindings?.[1].determination_status, 'document_missing_or_incomplete');
  assert.equal(
    analysisArtifacts.normalizedContractorQuestions?.question_groups[0].questions[0].related_finding_ids[0],
    'VC1-1',
  );
  assert.equal(
    outputData.applicant_questions_json?.question_groups[0].questions[0].determination_status,
    'inconclusive',
  );
});

test('project understanding normalization enriches evidence with manifest paths', () => {
  const normalized = normalizeProjectUnderstandingForOutput({
    'sheet-manifest.json': {
      source_pdf: 'binder.dwf.pdf',
      sheets: [
        { page: 5, desenho: 5, title: 'Planta do R/C' },
      ],
    },
    'page-text.json': [
      { page: 5, text: 'PLANTA DO R/C', text_length: 13, has_extractable_text: true, source: 'pdf-native' },
    ],
    'project_understanding.json': {
      project_summary: {
        project_type: 'moradia geminada',
        work_type: 'nova construcao',
        confidence: 'high',
        summary_text: 'The submission appears to show a two-unit residential build.',
      },
      building_program: [
        {
          level_name: 'R/C',
          spaces: ['Sala', 'Cozinha'],
          stated_areas: [{ label: 'Sala', value: '42.13 m2', value_type: 'declared' }],
          confidence: 'medium',
          evidence_refs: ['ev_1'],
        },
      ],
      site_and_mass: {
        implantation: 'Detached volume near the center of the lot.',
        accesses: ['Pedestrian access from the south'],
        parking: 'Covered parking for two vehicles',
        confidence: 'medium',
        evidence_refs: ['ev_1'],
      },
      key_tables_and_legends: {
        synoptic_table_present: false,
        legend_present: true,
        scales: ['1:100'],
        north_arrow_present: true,
        confidence: 'medium',
        evidence_refs: ['ev_1'],
      },
      discipline_coverage: [
        {
          discipline: 'arquitetura',
          present_pages: [5],
          missing_expected: [],
          confidence: 'high',
        },
      ],
      evidence_index: [
        {
          id: 'ev_1',
          page: 5,
          evidence_type: 'floor-plan',
          quote: 'PLANTA DO R/C',
        },
      ],
      open_questions: [],
      understanding_status: 'complete',
    },
  });

  assert.equal(normalized?.schema_version, 1);
  assert.equal(normalized?.document_profile.source_pdf, 'binder.dwf.pdf');
  assert.equal(normalized?.document_profile.has_native_text, true);
  assert.equal(normalized?.document_profile.drawing_origin_guess, 'dwf-derived');
  assert.equal(normalized?.evidence_index[0].page_png_path, 'pages-png/page-05.png');
  assert.equal(normalized?.evidence_index[0].title, 'Planta do R/C');
  assert.equal(normalized?.building_program[0].stated_areas[0].value_type, 'declared');
  assert.equal(normalized?.building_program[0].stated_areas[0].usable_for_compliance, true);
});

test('review gate demotes unsupported blocker and preserves it as additional correction', () => {
  const rawFiles = {
    'draft_corrections.json': {
      municipality: 'Viseu',
      blocking_issues: [
        {
          title: 'Parking non-compliance',
          description: 'Parking appears non-compliant.',
          priority: 1,
          source_scope: 'municipal-viseu',
          source_findings: ['VC1-3'],
        },
      ],
    },
    'sheet-manifest.json': { sheets: [{ page: 1, title: 'Cover', notes: 'Binder cover' }] },
    'municipal_compliance.json': [
      {
        item_id: 'VC1-3',
        review_area: 'arquitetura-urbanismo',
        finding_category: 'MUNICIPAL_PROCEDURE_MISMATCH',
        source_scope: 'municipal-viseu',
        source_doc: 'rmue.md',
        article_or_section: 'art. 43',
        source_reference: 'RMUE art. 43 + pdmv-operational-baseline.md',
        verification_status: 'official_verified',
        evidence_status: 'depends-on-pdmv',
      },
    ],
  };

  const { canonicalReviewChecklist } = buildCanonicalViseuReviewArtifacts(rawFiles);
  assert.equal(canonicalReviewChecklist?.blocking_issues.length, 0);
  assert.equal(canonicalReviewChecklist?.depends_on_pdmv_items.length, 0);
  assert.equal(canonicalReviewChecklist?.additional_corrections[0].reason, 'demoted_from_blocking_issue_due_to_insufficient_support');
});

test('review gate keeps blocker with verified legal basis and concrete evidence', () => {
  const rawFiles = {
    'draft_corrections.json': {
      municipality: 'Viseu',
      critical_blockers: ['VC1-2'],
    },
    'sheet-manifest.json': {
      sheets: [{ page: 7, desenho: 7, title: 'Accessibility plan', notes: 'Missing dimensions' }],
    },
    'project_understanding.json': {
      project_summary: {
        project_type: 'moradia',
        work_type: 'alteracao',
        confidence: 'medium',
        summary_text: 'The submitted drawings include an accessibility sheet.',
      },
      building_program: [],
      site_and_mass: { accesses: [], confidence: 'medium', evidence_refs: ['ev_access'] },
      key_tables_and_legends: { scales: [], confidence: 'medium', evidence_refs: ['ev_access'] },
      discipline_coverage: [],
      evidence_index: [
        { id: 'ev_access', page: 7, evidence_type: 'accessibility-sheet', quote: 'Accessibility plan' },
      ],
      open_questions: [],
      understanding_status: 'partial',
    },
    'municipal_compliance.json': [
      {
        item_id: 'VC1-2',
        description: 'Accessibility plan on page 7 omits required slopes and dimensions.',
        review_area: 'acessibilidades-seguranca',
        finding_category: 'MISSING_DRAWING_OR_ELEMENT',
        source_scope: 'municipal-viseu',
        source_doc: 'rmue.md',
        article_or_section: 'art. 20',
        source_reference: 'RMUE art. 20 page 7',
        verification_status: 'official_verified',
        evidence_status: 'missing-from-submission',
        evidence_refs: ['ev_access'],
        sheet_refs: [{ page: 7, visual_note: 'Accessibility annotations missing.' }],
      },
    ],
  };

  const { canonicalReviewChecklist } = buildCanonicalViseuReviewArtifacts(rawFiles);
  assert.equal(canonicalReviewChecklist?.blocking_issues.length, 1);
  assert.equal(canonicalReviewChecklist?.blocking_issues[0].source_findings[0], 'VC1-2');
  assert.deepEqual(canonicalReviewChecklist?.blocking_issues[0].evidence_refs, ['ev_access']);
  assert.equal(canonicalReviewChecklist?.evidence_index[0].title, 'Accessibility plan');
  assert.equal(canonicalReviewChecklist?.blocking_issues[0].sheet_refs[0].page, 7);
});

test('review phase persists canonical checklist while preserving raw artifacts untouched', () => {
  const rawFiles = {
    'draft_corrections.md': '# Draft',
    'project_understanding.json': {
      project_summary: {
        project_type: 'legalizacao',
        work_type: 'alteracao',
        confidence: 'medium',
        summary_text: 'The submission concerns a legalization-oriented review.',
      },
      building_program: [],
      site_and_mass: { accesses: [], confidence: 'medium', evidence_refs: ['ev_1'] },
      key_tables_and_legends: { scales: [], confidence: 'medium', evidence_refs: ['ev_1'] },
      discipline_coverage: [],
      evidence_index: [{ id: 'ev_1', page: 1, evidence_type: 'cover-sheet' }],
      open_questions: [],
      understanding_status: 'partial',
    },
    'draft_corrections.json': {
      municipality: 'Viseu',
      critical_blockers: ['ADM-002'],
      all_findings: [
        {
          id: 'ADM-002',
          process_type: 'licenciamento',
          review_area: 'instrucao-administrativa',
          finding_category: 'MISSING_DOCUMENT',
          description: 'Core administrative documents missing from page 1 binder.',
          source_scope: 'procedure-instruction',
          source_doc: 'nip.md',
          article_or_section: 'sec. 2',
          source_reference: 'NIP sec. 2 page 1',
          verification_status: 'official_verified',
          evidence_status: 'missing-from-submission',
        },
      ],
    },
    'sheet-manifest.json': {
      sheets: [
        { page: 1, title: 'Cover sheet', notes: 'Binder cover' },
      ],
    },
  };
  const originalRawArtifacts = JSON.parse(JSON.stringify(rawFiles));

  const outputData = buildReviewPhaseOutputData(rawFiles);

  assert.equal(outputData.corrections_letter_md, '# Draft');
  assert.equal(outputData.review_checklist_json?.schema_version, 1);
  assert.equal(outputData.review_checklist_json?.blocking_issues.length, 1);
  assert.equal(outputData.review_checklist_json?.validation_report.summary.accepted_findings, 1);
  assert.equal(outputData.raw_artifacts['validation_report.json'].summary.accepted_findings, 1);
  assert.equal(outputData.project_understanding_json?.evidence_index[0].page_png_path, 'pages-png/page-01.png');
  assert.deepEqual(rawFiles, originalRawArtifacts);
  assert.ok(Array.isArray(rawFiles['draft_corrections.json'].critical_blockers));
});

test('analysis and response outputs preserve normalized project understanding', () => {
  const rawFiles = {
    'project_understanding.json': {
      project_summary: {
        project_type: 'moradia',
        work_type: 'nova construcao',
        confidence: 'high',
        summary_text: 'The project is a residential new-build.',
      },
      building_program: [],
      site_and_mass: { accesses: [], confidence: 'medium', evidence_refs: ['ev_1'] },
      key_tables_and_legends: { scales: [], confidence: 'medium', evidence_refs: ['ev_1'] },
      discipline_coverage: [],
      evidence_index: [{ id: 'ev_1', page: 2, evidence_type: 'site-plan' }],
      open_questions: [],
      understanding_status: 'complete',
    },
    'sheet-manifest.json': {
      sheets: [{ page: 2, desenho: 2, title: 'Implantacao' }],
    },
    'corrections_categorized.json': [],
    'applicant_questions.json': { question_groups: [] },
    'response_letter.md': '# Response',
    'professional_scope.md': '# Scope',
    'corrections_report.md': '# Report',
  };

  const analysisOutput = buildAnalysisPhaseOutputData(rawFiles);
  const responseOutput = buildResponsePhaseOutputData(rawFiles);

  assert.equal(analysisOutput.project_understanding_json?.evidence_index[0].title, 'Implantacao');
  assert.equal(analysisOutput.raw_artifacts['validation_report.json'].summary.total_findings, 0);
  assert.equal(responseOutput.project_understanding_json?.evidence_index[0].page_png_path, 'pages-png/page-02.png');
  assert.equal(responseOutput.response_letter_md, '# Response');
});
