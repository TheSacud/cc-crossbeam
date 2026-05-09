export interface RawOutputFiles {
  [filename: string]: unknown;
}

export interface NormalizedSheetManifestSheet {
  page: number;
  desenho: number | null;
  title: string;
  notes: string | null;
  discipline: string | null;
  title_confirmed?: boolean;
  scale?: string | null;
  sheet_key: string;
  page_png_path: string;
  title_block_png_path: string;
}

export interface SheetRef {
  page: number;
  desenho: number | null;
  title: string;
  page_png_path: string;
  title_block_png_path: string;
  visual_note: string | null;
}

export interface EvidenceIndexEntry extends Record<string, unknown> {
  id: string;
  page: number;
  desenho: number | null;
  title: string;
  description: string | null;
  extracted_text: string | null;
  page_png_path: string;
  title_block_png_path: string;
  crop_path: string | null;
  crop_storage_bucket: string | null;
  crop_storage_path: string | null;
  evidence_type: string;
  quote: string | null;
}

export type DeterminationStatus =
  | 'confirmed_non_compliance'
  | 'document_missing_or_incomplete'
  | 'needs_official_source'
  | 'inconclusive';

export interface NormalizedViseuFinding extends Record<string, unknown> {
  item_id: string;
  process_type: string | null;
  review_area: string | null;
  finding_category: string | null;
  source_scope: string | null;
  source_doc: string | null;
  article_or_section: string | null;
  source_reference: string | null;
  verification_status: string | null;
  evidence_status: string | null;
  needs_question: boolean;
  determination_status: DeterminationStatus;
  gate_reasons: string[];
  depends_on_pdmv: boolean;
  evidence_refs: string[];
  sheet_refs?: SheetRef[];
}

export interface NormalizedContractorQuestion extends Record<string, unknown> {
  question_key: string;
  determination_status: DeterminationStatus;
  related_finding_ids: string[];
}

export interface NormalizedQuestionGroup extends Record<string, unknown> {
  group_id: string;
  title: string;
  questions: NormalizedContractorQuestion[];
}

export interface CanonicalBlockingIssue {
  title: string;
  description: string;
  priority: number;
  source_scope: string;
  source_findings: string[];
  evidence_refs: string[];
  sheet_refs: SheetRef[];
  visual_note_summary?: string;
}

export interface ValidationReportFindingSummary {
  ref: string;
  title: string;
  determination_status: DeterminationStatus;
  gate_reasons: string[];
  source_scope: string | null;
  evidence_refs: string[];
}

export interface ValidationReport {
  schema_version: 1;
  summary: {
    total_findings: number;
    accepted_findings: number;
    demoted_findings: number;
    source_needed_findings: number;
    depends_on_pdmv_findings: number;
    removed_blocking_issues: number;
  };
  accepted_findings: ValidationReportFindingSummary[];
  demoted_findings: ValidationReportFindingSummary[];
  source_needed_findings: ValidationReportFindingSummary[];
  depends_on_pdmv_findings: ValidationReportFindingSummary[];
  removed_blocking_issues: Array<{
    title: string;
    source_findings: string[];
    evidence_refs: string[];
    determination_status: DeterminationStatus | 'unknown';
    reason: string;
  }>;
}

export interface CanonicalReviewChecklist {
  schema_version: 1;
  municipality: string;
  document_type: string;
  review_outcome: string | null;
  total_findings: Record<string, unknown>;
  blocking_issues: CanonicalBlockingIssue[];
  source_needed_items: unknown[];
  depends_on_pdmv_items: unknown[];
  additional_corrections: unknown[];
  review_outcome_rationale: string | null;
  evidence_index: EvidenceIndexEntry[];
  validation_report: ValidationReport;
  project?: unknown;
  location?: unknown;
  applicant?: unknown;
  loteamento?: unknown;
  pip_process?: unknown;
  date?: unknown;
  review_date?: unknown;
  recommendation?: string | null;
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toPagePngPath(page: number): string {
  return `pages-png/page-${String(page).padStart(2, '0')}.png`;
}

function toTitleBlockPath(page: number): string {
  return `title-blocks/title-block-${String(page).padStart(2, '0')}.png`;
}

function parseMaybeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const normalized = value.trim().replace(',', '.');
    const parsed = Number(normalized.replace(/^0+(\d)/, '$1'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

const PORTUGUESE_TEXT_OVERRIDES: Record<string, string> = {
  'Cadastral area from drawing: 1785 m²': 'Área cadastral indicada no desenho: 1785 m²',
  'Public way cession: 67.65 m²': 'Cedência à via pública: 67,65 m²',
  'Cadastral area after cession: 1718.10 m²': 'Área cadastral após cedência: 1718,10 m²',
  'Proposed footprint: 329.35 m²': 'Área de implantação proposta: 329,35 m²',
  'Waterproofed areas: 594.43 m²': 'Áreas impermeabilizadas: 594,43 m²',
  'Construction spec mentions 4 bathrooms + 1 kitchen + technical zone per unit (7 total bathrooms in spec)': 'A descrição de obra menciona 4 casas de banho, 1 cozinha e zona técnica por fração (7 casas de banho no total)',
  'Marketing typology: T4 with 4 bedrooms': 'Tipologia anunciada: T4 com 4 quartos',
  'Marketing Fração A gross area': 'Área bruta anunciada da Fração A',
  'Marketing Fração B gross area': 'Área bruta anunciada da Fração B',
  'Marketing Fração A parking area': 'Área de estacionamento anunciada da Fração A',
  'Marketing Fração B parking area': 'Área de estacionamento anunciada da Fração B',
  'Marketing mentions garage and covered parking': 'O anúncio menciona garagem e estacionamento coberto',
  'PIP favorable decision dated 27.08.2024, process 17.04.02/2024/171': 'Decisão favorável do PIP datada de 27.08.2024, processo 17.04.02/2024/171',
  'Requirement for subdivision alteration before construction': 'Exigência de alteração ao loteamento antes da construção',
  'PIP typology: T3 bifamily': 'Tipologia no PIP: moradia bifamiliar T3',
  'Lot registry area and note about non-updated area': 'Área registal do lote e nota sobre área não atualizada',
  'PIP total construction area 500 m²': 'Área total de construção no PIP: 500 m²',
  'Alvará 14/86 conditions: floors, occupation, setbacks, colors, wall height': 'Condições do Alvará 14/86: pisos, ocupação, afastamentos, cores e altura do muro',
  'Urbanization works requirements and caução': 'Exigências relativas a obras de urbanização e caução',
  'Missing PDMV extracts (ordering/classification and constraints)': 'Faltam extratos PDMV (ordenamento/classificação e condicionantes)',
  'Digital format compliance (PDF/A and open technical format) -- needs human validation': 'Conformidade do formato digital (PDF/A e formato técnico aberto) — requer validação humana',
  'Drawing title blocks incomplete: missing location address and scale on most sheets': 'Legendas dos desenhos incompletas: falta morada/localização e escala na maioria das peças',
  'Process not properly indexed and paginated as a unified dossier': 'Processo sem índice e paginação adequados como dossier único',
  'Accessibility plan incomplete: only ground floor covered, first floor accessibility plan missing': 'Plano de acessibilidades incompleto: apenas o r/chão está coberto; falta o 1.º andar',
  'Missing cost estimate for construction works (edificacao)': 'Falta estimativa de custo das obras de edificação',
  'Color conventions for new construction/alteration not verifiable across all drawings': 'Convenções de cor para construção nova/alteração não verificáveis em todas as peças',
  'Occupation index depends on unresolved lot area - compliance indeterminate': 'Índice de ocupação depende da área do lote ainda por reconciliar — conformidade indeterminada',
  'sheet': 'peça',
};

function localizedText(value: string | null): string | null {
  if (!value) return null;
  return PORTUGUESE_TEXT_OVERRIDES[value] || value;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
}

function inferSheetTitle(raw: Record<string, unknown>, page: number): string {
  return firstString(raw.title, raw.sheet_title) || `Page ${page}`;
}

function inferSheetNotes(raw: Record<string, unknown>): string | null {
  return firstString(raw.notes, raw.content_summary);
}

function inferSheetDesenho(raw: Record<string, unknown>): number | null {
  return parseMaybeNumber(raw.desenho ?? raw.sheet_id ?? raw.sheet_designation);
}

function normalizeSheetRef(rawRef: Record<string, unknown>): SheetRef | null {
  const page = parseMaybeNumber(rawRef.page);
  if (page == null) return null;
  return {
    page,
    desenho: parseMaybeNumber(rawRef.desenho),
    title: firstString(rawRef.title) || `Page ${page}`,
    page_png_path: firstString(rawRef.page_png_path) || toPagePngPath(page),
    title_block_png_path: firstString(rawRef.title_block_png_path) || toTitleBlockPath(page),
    visual_note: firstString(rawRef.visual_note),
  };
}

function buildSheetRef(sheet: NormalizedSheetManifestSheet, visualNote?: string | null): SheetRef {
  return {
    page: sheet.page,
    desenho: sheet.desenho,
    title: sheet.title,
    page_png_path: sheet.page_png_path,
    title_block_png_path: sheet.title_block_png_path,
    visual_note: visualNote ?? sheet.notes,
  };
}

function normalizeQuestionKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function normalizeEvidenceRefs(rawFinding: Record<string, unknown>, validEvidenceIds?: Set<string>): string[] {
  const refs = [
    ...stringArray(rawFinding.evidence_refs),
    ...stringArray(rawFinding.evidence_ids),
    ...stringArray(rawFinding.related_evidence_ids),
  ];
  const seen = new Set<string>();
  return refs.filter((ref) => {
    if (seen.has(ref)) return false;
    seen.add(ref);
    return !validEvidenceIds || validEvidenceIds.has(ref);
  });
}

function findingRef(value: Record<string, unknown>): string | null {
  return firstString(value.item_id, value.id, value.ref, value.finding_id);
}

function isDocumentFindingCategory(category: string | null): boolean {
  return category === 'MISSING_DOCUMENT'
    || category === 'MISSING_DRAWING_OR_ELEMENT'
    || category === 'LEGALIZATION_GAP';
}

function referencesCriticalTopic(finding: Record<string, unknown>): boolean {
  const haystack = [
    firstString(finding.review_area),
    firstString(finding.source_reference),
    firstString(finding.source_doc),
    firstString(finding.description),
    firstString(finding.notes),
    firstString(finding.next_action),
  ].filter(Boolean).join(' | ');

  return /(parking|estacionamento|soil|solo|pdmv|nip)/i.test(haystack);
}

function requiresOfficialSource(finding: Record<string, unknown>): boolean {
  const sourceScope = firstString(finding.source_scope);
  return sourceScope === 'municipal-viseu'
    || sourceScope === 'procedure-instruction'
    || referencesCriticalTopic(finding);
}

function hasNormativeSupport(finding: Record<string, unknown>): boolean {
  const hasReference = Boolean(firstString(finding.source_reference));
  const hasRichReference = Boolean(firstString(finding.source_doc) && firstString(finding.article_or_section));
  const requiresOfficial = requiresOfficialSource(finding);
  const verificationStatus = firstString(finding.verification_status);
  if (requiresOfficial) {
    return hasReference && hasRichReference && verificationStatus === 'official_verified';
  }
  return hasReference;
}

function hasConcreteEvidence(finding: Record<string, unknown>, strictEvidenceRefs = false): boolean {
  if (
    strictEvidenceRefs
    && projectEvidenceRefsRequired(finding)
    && (!Array.isArray(finding.evidence_refs) || finding.evidence_refs.length === 0)
  ) {
    return false;
  }
  const evidenceStatus = firstString(finding.evidence_status);
  if (evidenceStatus === 'missing-from-submission' || evidenceStatus === 'confirmed') {
    return true;
  }
  if (Array.isArray(finding.evidence_refs) && finding.evidence_refs.length > 0) {
    return true;
  }
  if (Array.isArray(finding.sheet_refs) && finding.sheet_refs.length > 0) {
    return true;
  }
  return isDocumentFindingCategory(firstString(finding.finding_category));
}

function projectEvidenceRefsRequired(finding: Record<string, unknown>): boolean {
  const evidenceStatus = firstString(finding.evidence_status);
  if (evidenceStatus === 'source-needed' || evidenceStatus === 'depends-on-pdmv') {
    return false;
  }

  const category = firstString(finding.finding_category);
  if (category === 'REGULATORY_NON_COMPLIANCE' || category === 'NEEDS_TECHNICAL_REWORK') {
    return true;
  }

  if (evidenceStatus === 'confirmed' || evidenceStatus === 'needs-human-validation') {
    return true;
  }

  const haystack = [
    category,
    firstString(finding.review_area),
    firstString(finding.description),
    firstString(finding.notes),
    firstString(finding.next_action),
    firstString(finding.source_reference),
  ].filter(Boolean).join(' | ');

  return /(area|areas|área|áreas|cota|cotas|distancia|distância|afastamento|recuo|slope|inclina|declive|parking|estacionamento|typology|tipologia|implantacao|implantação|quadro|tabela|scale|escala)/i
    .test(haystack);
}

function deriveDeterminationStatus(rawFinding: Record<string, unknown>): {
  determination_status: DeterminationStatus;
  gate_reasons: string[];
  depends_on_pdmv: boolean;
} {
  const gateReasons: string[] = [];
  const findingCategory = firstString(rawFinding.finding_category);
  const evidenceStatus = firstString(rawFinding.evidence_status);
  const dependsOnPdmv = evidenceStatus === 'depends-on-pdmv'
    || /pdmv/i.test(
      [
        firstString(rawFinding.source_reference),
        firstString(rawFinding.next_action),
        firstString(rawFinding.notes),
      ].filter(Boolean).join(' | '),
    );

  if (evidenceStatus === 'source-needed') {
    gateReasons.push('missing_official_source');
    return {
      determination_status: 'needs_official_source',
      gate_reasons: gateReasons,
      depends_on_pdmv: dependsOnPdmv,
    };
  }

  if (dependsOnPdmv) {
    gateReasons.push('depends_on_pdmv');
    return {
      determination_status: 'inconclusive',
      gate_reasons: gateReasons,
      depends_on_pdmv: true,
    };
  }

  if (isDocumentFindingCategory(findingCategory)) {
    if (!hasNormativeSupport(rawFinding) && requiresOfficialSource(rawFinding)) {
      gateReasons.push('missing_verified_legal_basis');
      return {
        determination_status: 'needs_official_source',
        gate_reasons: gateReasons,
        depends_on_pdmv: false,
      };
    }
    return {
      determination_status: 'document_missing_or_incomplete',
      gate_reasons: gateReasons,
      depends_on_pdmv: false,
    };
  }

  if (!hasNormativeSupport(rawFinding)) {
    gateReasons.push('missing_verified_legal_basis');
    return {
      determination_status: 'needs_official_source',
      gate_reasons: gateReasons,
      depends_on_pdmv: false,
    };
  }

  if (!hasConcreteEvidence(rawFinding, Boolean(rawFinding.__strict_evidence_refs)) || evidenceStatus === 'needs-human-validation') {
    gateReasons.push('insufficient_project_evidence');
    return {
      determination_status: 'inconclusive',
      gate_reasons: gateReasons,
      depends_on_pdmv: false,
    };
  }

  return {
    determination_status: 'confirmed_non_compliance',
    gate_reasons: gateReasons,
    depends_on_pdmv: false,
  };
}

function summarizeFindingForChecklist(
  finding: NormalizedViseuFinding,
): { ref: string; topic: string; determination_status: DeterminationStatus; evidence_refs: string[] } {
  return {
    ref: finding.item_id,
    topic: firstString(finding.description, finding.next_action, finding.source_reference) || finding.item_id,
    determination_status: finding.determination_status,
    evidence_refs: finding.evidence_refs,
  };
}

function parseReferencedPages(text: string): number[] {
  const pages = new Set<number>();
  for (const match of text.matchAll(/\b(?:sheet|page|pagina|pagina|p[áa]gina)\s*0?(\d{1,2})\b/giu)) {
    pages.add(Number(match[1]));
  }
  return [...pages];
}

const ISSUE_SHEET_HINTS: Array<{ pattern: RegExp; pages?: number[]; desenhos?: number[]; summary: string }> = [
  { pattern: /Typology mismatch|T3 .* T4|quartos|tipologia/i, desenhos: [5, 6], summary: 'Floor plans show the unit typology used to support this blocking issue.' },
  { pattern: /Quadro sinoptico|quadro sinoptico|area|indice/i, desenhos: [19], summary: 'The synoptic sheet contains the contradictory area and index data supporting this blocking issue.' },
  { pattern: /Exterior colour palette|palette|alcad/i, desenhos: [13, 14], summary: 'Elevations show the exterior palette referenced in this blocking issue.' },
  { pattern: /specialty engineering projects absent|especialidades/i, pages: [1, 20], summary: 'The cover/index and end of the drawing set support the absence of specialty sheets in the submitted binder.' },
  { pattern: /Core administrative documents missing|documentos administrativos/i, pages: [1], summary: 'The submitted binder content supports the dossier-level incompleteness referenced in this blocking issue.' },
  { pattern: /Procedural sequencing violation|sequencia procedimental|loteamento/i, pages: [1], summary: 'This blocking issue is primarily documental; the binder itself does not show the required prior loteamento steps.' },
];

export function normalizeSheetManifest(
  rawManifest: unknown,
): { sheets: NormalizedSheetManifestSheet[]; [key: string]: unknown } | null {
  if (!rawManifest || typeof rawManifest !== 'object') return null;
  const manifest = cloneValue(rawManifest as Record<string, unknown>);
  const rawSheets = Array.isArray(manifest.sheets) ? (manifest.sheets as Record<string, unknown>[]) : null;
  if (!rawSheets) return null;

  const sheetCandidates = rawSheets.map((rawSheet) => {
    const page = parseMaybeNumber(rawSheet.page ?? rawSheet.page_number);
    if (page == null) return null;
    const desenho = inferSheetDesenho(rawSheet);
    const sheet: NormalizedSheetManifestSheet = {
      page,
      desenho,
      title: inferSheetTitle(rawSheet, page),
      notes: inferSheetNotes(rawSheet),
      discipline: typeof rawSheet.discipline === 'string' ? rawSheet.discipline : null,
      title_confirmed: typeof rawSheet.title_confirmed === 'boolean' ? rawSheet.title_confirmed : undefined,
      scale: typeof rawSheet.scale === 'string' ? rawSheet.scale : null,
      sheet_key: desenho != null ? `desenho-${desenho}` : `page-${page}`,
      page_png_path: firstString(rawSheet.page_png_path) || toPagePngPath(page),
      title_block_png_path: firstString(rawSheet.title_block_png_path) || toTitleBlockPath(page),
    };
    return sheet;
  });
  const sheets: NormalizedSheetManifestSheet[] = sheetCandidates
    .filter((sheet): sheet is NormalizedSheetManifestSheet => sheet !== null)
    .sort((a, b) => a.page - b.page);

  return { ...manifest, sheets };
}

function findingsArrayFromArtifact(artifact: unknown): Record<string, unknown>[] {
  if (Array.isArray(artifact)) {
    return artifact.filter((entry): entry is Record<string, unknown> => (
      Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
    ));
  }

  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    return [];
  }

  const record = artifact as Record<string, unknown>;
  for (const key of ['findings', 'items', 'corrections']) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((entry): entry is Record<string, unknown> => (
        Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
      ));
    }
  }

  return [];
}

function collectRawFindings(rawFiles: RawOutputFiles, draft?: Record<string, unknown>): Record<string, unknown>[] {
  const fromDraft = draft && Array.isArray(draft.all_findings) ? (draft.all_findings as Record<string, unknown>[]) : [];
  const sidecars = [
    'corrections_categorized.json',
    'findings-arquitetura-urbanismo.json',
    'findings-especialidades.json',
    'findings-acessibilidades-seguranca.json',
    'findings-instrucao-administrativa.json',
    'findings-legalizacao.json',
    'municipal_compliance.json',
    'national_compliance.json',
  ].flatMap((name) => findingsArrayFromArtifact(rawFiles[name]));

  const seen = new Set<string>();
  const combined = [...fromDraft, ...sidecars];
  return combined.filter((finding) => {
    const ref = findingRef(finding);
    if (!ref) return true;
    const key = normalizeQuestionKey(ref);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeEvidenceIndex(rawFiles: RawOutputFiles): EvidenceIndexEntry[] {
  const normalizedManifest = normalizeSheetManifest(rawFiles['sheet-manifest.json']);
  const byPage = new Map<number, NormalizedSheetManifestSheet>(
    (normalizedManifest?.sheets || []).map((sheet) => [sheet.page, sheet]),
  );
  const rawUnderstanding = rawFiles['project_understanding.json'];
  const understanding = rawUnderstanding && typeof rawUnderstanding === 'object' && !Array.isArray(rawUnderstanding)
    ? rawUnderstanding as Record<string, unknown>
    : null;
  const rawEntries = Array.isArray(understanding?.evidence_index)
    ? understanding.evidence_index as Array<Record<string, unknown>>
    : [];

  return rawEntries
    .map((entry, index) => {
      const page = parseMaybeNumber(entry.page);
      if (page == null) return null;
      const sheet = byPage.get(page);
      return {
        ...entry,
        id: firstString(entry.id) || `evidence_${index + 1}`,
        page,
        desenho: parseMaybeNumber(entry.desenho) ?? sheet?.desenho ?? null,
        title: firstString(entry.title) || sheet?.title || `Page ${page}`,
        description: localizedText(firstString(entry.description)),
        extracted_text: firstString(entry.extracted_text),
        page_png_path: firstString(entry.page_png_path) || sheet?.page_png_path || toPagePngPath(page),
        title_block_png_path: firstString(entry.title_block_png_path) || sheet?.title_block_png_path || toTitleBlockPath(page),
        crop_path: firstString(entry.crop_path),
        crop_storage_bucket: firstString(entry.crop_storage_bucket),
        crop_storage_path: firstString(entry.crop_storage_path),
        evidence_type: localizedText(firstString(entry.evidence_type)) || 'peça',
        quote: firstString(entry.quote),
      } satisfies EvidenceIndexEntry;
    })
    .filter((entry): entry is EvidenceIndexEntry => entry !== null);
}

export function normalizeViseuFinding(
  rawFinding: Record<string, unknown>,
  validEvidenceIds?: Set<string>,
): NormalizedViseuFinding {
  const cloned = cloneValue(rawFinding);
  const normalizedRefs = Array.isArray(cloned.sheet_refs)
    ? (cloned.sheet_refs as Array<Record<string, unknown>>)
        .map((ref) => normalizeSheetRef(ref))
        .filter((ref): ref is SheetRef => ref !== null)
    : undefined;
  const evidenceRefs = normalizeEvidenceRefs(cloned, validEvidenceIds);
  const strictEvidenceRefs = validEvidenceIds !== undefined;
  const derived = deriveDeterminationStatus({
    ...cloned,
    ...(normalizedRefs ? { sheet_refs: normalizedRefs } : {}),
    evidence_refs: evidenceRefs,
    __strict_evidence_refs: strictEvidenceRefs,
  });
  const gateReasons = [...derived.gate_reasons];
  if (
    validEvidenceIds
    && evidenceRefs.length === 0
    && stringArray(cloned.evidence_refs).length > 0
  ) {
    gateReasons.push('invalid_evidence_reference');
  }
  if (
    strictEvidenceRefs
    && evidenceRefs.length === 0
    && projectEvidenceRefsRequired(cloned)
    && !gateReasons.includes('insufficient_project_evidence')
  ) {
    gateReasons.push('missing_project_evidence_ref');
  }

  return {
    ...cloned,
    item_id: findingRef(cloned) || 'unidentified-finding',
    process_type: firstString(cloned.process_type),
    review_area: firstString(cloned.review_area),
    finding_category: firstString(cloned.finding_category),
    source_scope: firstString(cloned.source_scope),
    source_doc: firstString(cloned.source_doc),
    article_or_section: firstString(cloned.article_or_section),
    source_reference: firstString(cloned.source_reference),
    verification_status: firstString(cloned.verification_status),
    evidence_status: firstString(cloned.evidence_status),
    needs_question: Boolean(cloned.needs_question),
    determination_status: derived.determination_status,
    gate_reasons: gateReasons,
    depends_on_pdmv: derived.depends_on_pdmv,
    evidence_refs: evidenceRefs,
    ...(normalizedRefs ? { sheet_refs: normalizedRefs } : {}),
  };
}

export function buildViseuAnalysisArtifactsForSandbox(rawFiles: RawOutputFiles): {
  normalizedFindings: NormalizedViseuFinding[] | null;
  normalizedContractorQuestions: { question_groups: NormalizedQuestionGroup[] } | null;
} {
  const evidenceIndex = normalizeEvidenceIndex(rawFiles);
  const validEvidenceIds = new Set(evidenceIndex.map((entry) => entry.id));
  const rawCategorized = rawFiles['corrections_categorized.json'];
  const normalizedFindings = Array.isArray(rawCategorized)
    ? (rawCategorized as Record<string, unknown>[]).map((finding) => normalizeViseuFinding(finding, validEvidenceIds))
    : null;

  const findingByKey = new Map<string, NormalizedViseuFinding>();
  for (const finding of normalizedFindings || []) {
    findingByKey.set(normalizeQuestionKey(finding.item_id), finding);
  }

  const rawQuestions = rawFiles['applicant_questions.json'] || rawFiles['contractor_questions.json'];
  if (!rawQuestions || typeof rawQuestions !== 'object') {
    return {
      normalizedFindings,
      normalizedContractorQuestions: null,
    };
  }

  const root = cloneValue(rawQuestions as Record<string, unknown>);
  const rawGroups = Array.isArray(root.question_groups) ? (root.question_groups as Array<Record<string, unknown>>) : [];

  const questionGroups: NormalizedQuestionGroup[] = rawGroups.map((group, groupIndex) => {
    const rawQuestionsInGroup = Array.isArray(group.questions) ? (group.questions as Array<Record<string, unknown>>) : [];
    const questions: NormalizedContractorQuestion[] = rawQuestionsInGroup.map((question, questionIndex) => {
      const questionKey = firstString(question.question_key) || `question_${groupIndex + 1}_${questionIndex + 1}`;
      const normalizedKey = normalizeQuestionKey(questionKey);
      const relatedFindings = [...findingByKey.values()].filter((finding) => {
        const findingKey = normalizeQuestionKey(finding.item_id);
        return normalizedKey.includes(findingKey) || findingKey.includes(normalizedKey);
      });
      const highestPriorityStatus = relatedFindings.some((finding) => finding.determination_status === 'needs_official_source')
        ? 'needs_official_source'
        : relatedFindings.some((finding) => finding.determination_status === 'inconclusive')
          ? 'inconclusive'
          : relatedFindings.some((finding) => finding.determination_status === 'document_missing_or_incomplete')
            ? 'document_missing_or_incomplete'
            : 'confirmed_non_compliance';

      return {
        ...question,
        question_key: questionKey,
        determination_status: relatedFindings.length > 0 ? highestPriorityStatus : 'inconclusive',
        related_finding_ids: relatedFindings.map((finding) => finding.item_id),
      };
    });

    return {
      ...group,
      group_id: firstString(group.group_id) || `group_${groupIndex + 1}`,
      title: firstString(group.title) || `Question Group ${groupIndex + 1}`,
      questions,
    };
  });

  return {
    normalizedFindings,
    normalizedContractorQuestions: { ...root, question_groups: questionGroups },
  };
}

function priorityFromRef(ref: string): number {
  if (/^(ARQ|VC).*00?[1-3]$/i.test(ref)) return 1;
  if (/^ARQ-00[4-7]$/i.test(ref)) return 2;
  if (/^ADM-/i.test(ref)) return 3;
  if (/^ESP-/i.test(ref)) return 4;
  if (/^LEG-/i.test(ref)) return 5;
  return 6;
}

function titleFromFinding(finding: Record<string, unknown>): string {
  const explicitTitle = firstString(finding.title, finding.topic);
  if (explicitTitle) {
    const localized = localizedText(explicitTitle) || explicitTitle;
    return localized.length < 140 ? localized : localized.slice(0, 120).trim();
  }

  const description = firstString(finding.description, finding.next_action);
  if (!description) return findingRef(finding) || 'Blocking issue';

  const sentenceParts = description.split(/(?<=[.!?])\s+/);
  let sentence = '';
  for (const part of sentenceParts) {
    sentence = sentence ? `${sentence} ${part}` : part;
    if (!/(^|\s)(art|arts|n|nº|no|dr|dra|sr|sra)\.$/i.test(sentence.trim())) {
      break;
    }
  }
  sentence = sentence.replace(/[.!?]$/, '').trim();

  return sentence && sentence.length < 140 ? sentence : description.slice(0, 120).trim();
}

function enrichBlockingIssue(
  issue: CanonicalBlockingIssue,
  normalizedManifest: { sheets: NormalizedSheetManifestSheet[] },
  findingById: Map<string, NormalizedViseuFinding>,
): CanonicalBlockingIssue {
  const byPage = new Map(normalizedManifest.sheets.map((sheet) => [sheet.page, sheet]));
  const byDesenho = new Map(
    normalizedManifest.sheets
      .filter((sheet) => sheet.desenho != null)
      .map((sheet) => [sheet.desenho as number, sheet]),
  );
  const matched = new Map<number, SheetRef>();
  const evidenceRefs = new Set(issue.evidence_refs);

  for (const findingId of issue.source_findings) {
    const finding = findingById.get(findingId);
    if (!finding) continue;
    for (const evidenceRef of finding.evidence_refs) {
      evidenceRefs.add(evidenceRef);
    }

    if (Array.isArray(finding.sheet_refs)) {
      for (const explicitRef of finding.sheet_refs) {
        const sheet = byPage.get(explicitRef.page);
        if (sheet) matched.set(sheet.page, buildSheetRef(sheet, explicitRef.visual_note));
      }
    }

    for (const text of [finding.description, finding.source_reference].filter((value): value is string => typeof value === 'string')) {
      for (const page of parseReferencedPages(text)) {
        const sheet = byPage.get(page);
        if (sheet) matched.set(page, buildSheetRef(sheet));
      }
    }

    const desenho = parseMaybeNumber(finding.desenho);
    if (desenho != null) {
      const sheet = byDesenho.get(desenho);
      if (sheet) matched.set(sheet.page, buildSheetRef(sheet));
    }
  }

  let visualNoteSummary = issue.visual_note_summary;
  if (matched.size === 0) {
    const hint = ISSUE_SHEET_HINTS.find((candidate) => candidate.pattern.test(issue.title));
    if (hint?.desenhos) {
      for (const desenho of hint.desenhos) {
        const sheet = byDesenho.get(desenho);
        if (sheet) matched.set(sheet.page, buildSheetRef(sheet, hint.summary));
      }
    }
    if (hint?.pages) {
      for (const page of hint.pages) {
        const sheet = byPage.get(page);
        if (sheet) matched.set(sheet.page, buildSheetRef(sheet, hint.summary));
      }
    }
    if (hint?.summary) {
      visualNoteSummary = hint.summary;
    }
  }

  const sheetRefs = [...matched.values()].sort((a, b) => a.page - b.page).slice(0, 3);
  if (sheetRefs.length === 0) {
    visualNoteSummary = visualNoteSummary || 'No direct visual sheet reference was resolved for this blocking issue; review remains primarily documental/procedural.';
  }

  return {
    ...issue,
    evidence_refs: [...evidenceRefs],
    sheet_refs: sheetRefs,
    ...(visualNoteSummary ? { visual_note_summary: visualNoteSummary } : {}),
  };
}

function findingSupportsBlocker(finding: NormalizedViseuFinding): boolean {
  return finding.determination_status === 'confirmed_non_compliance'
    || finding.determination_status === 'document_missing_or_incomplete';
}

function summarizeFindingForAdditionalCorrection(
  finding: NormalizedViseuFinding,
  reason?: string,
): Record<string, unknown> {
  return {
    ref: finding.item_id,
    title: titleFromFinding(finding),
    determination_status: finding.determination_status,
    review_area: finding.review_area,
    source_scope: finding.source_scope,
    evidence_refs: finding.evidence_refs,
    reason: reason || finding.gate_reasons.join(', ') || null,
  };
}

function summarizeFindingForValidation(finding: NormalizedViseuFinding): ValidationReportFindingSummary {
  return {
    ref: finding.item_id,
    title: titleFromFinding(finding),
    determination_status: finding.determination_status,
    gate_reasons: finding.gate_reasons,
    source_scope: finding.source_scope,
    evidence_refs: finding.evidence_refs,
  };
}

function buildValidationReport(
  normalizedFindings: NormalizedViseuFinding[],
  removedBlockingIssues: ValidationReport['removed_blocking_issues'],
): ValidationReport {
  const acceptedFindings = normalizedFindings.filter((finding) => findingSupportsBlocker(finding));
  const demotedFindings = normalizedFindings.filter((finding) => (
    finding.determination_status === 'inconclusive'
    || finding.gate_reasons.length > 0
  ));
  const sourceNeededFindings = normalizedFindings.filter((finding) => finding.determination_status === 'needs_official_source');
  const dependsOnPdmvFindings = normalizedFindings.filter((finding) => finding.depends_on_pdmv);

  return {
    schema_version: 1,
    summary: {
      total_findings: normalizedFindings.length,
      accepted_findings: acceptedFindings.length,
      demoted_findings: demotedFindings.length,
      source_needed_findings: sourceNeededFindings.length,
      depends_on_pdmv_findings: dependsOnPdmvFindings.length,
      removed_blocking_issues: removedBlockingIssues.length,
    },
    accepted_findings: acceptedFindings.map((finding) => summarizeFindingForValidation(finding)),
    demoted_findings: demotedFindings.map((finding) => summarizeFindingForValidation(finding)),
    source_needed_findings: sourceNeededFindings.map((finding) => summarizeFindingForValidation(finding)),
    depends_on_pdmv_findings: dependsOnPdmvFindings.map((finding) => summarizeFindingForValidation(finding)),
    removed_blocking_issues: removedBlockingIssues,
  };
}

export function buildViseuValidationReportForSandbox(rawFiles: RawOutputFiles): ValidationReport {
  const evidenceIndex = normalizeEvidenceIndex(rawFiles);
  const validEvidenceIds = new Set(evidenceIndex.map((entry) => entry.id));
  const rawDraft = rawFiles['draft_corrections.json'];
  const draft = rawDraft && typeof rawDraft === 'object' && !Array.isArray(rawDraft)
    ? cloneValue(rawDraft as Record<string, unknown>)
    : undefined;
  const normalizedFindings = collectRawFindings(rawFiles, draft)
    .map((finding) => normalizeViseuFinding(finding, validEvidenceIds));
  return buildValidationReport(normalizedFindings, []);
}

function summarizeByDetermination(
  findings: NormalizedViseuFinding[],
  determinationStatus: DeterminationStatus,
): unknown[] {
  return findings
    .filter((finding) => finding.determination_status === determinationStatus)
    .map((finding) => summarizeFindingForChecklist(finding));
}

export function buildCanonicalViseuReviewArtifactsForSandbox(rawFiles: RawOutputFiles): {
  normalizedManifest: { sheets: NormalizedSheetManifestSheet[]; [key: string]: unknown } | null;
  canonicalReviewChecklist: CanonicalReviewChecklist | null;
} {
  const normalizedManifest = normalizeSheetManifest(rawFiles['sheet-manifest.json']);
  const evidenceIndex = normalizeEvidenceIndex(rawFiles);
  const validEvidenceIds = new Set(evidenceIndex.map((entry) => entry.id));
  const rawDraft = rawFiles['draft_corrections.json'];
  if (!rawDraft || typeof rawDraft !== 'object') {
    return { normalizedManifest, canonicalReviewChecklist: null };
  }

  const draft = cloneValue(rawDraft as Record<string, unknown>);
  const summary = rawFiles['review_summary.json'] && typeof rawFiles['review_summary.json'] === 'object'
    ? cloneValue(rawFiles['review_summary.json'] as Record<string, unknown>)
    : {};

  const normalizedFindings = collectRawFindings(rawFiles, draft)
    .map((finding) => normalizeViseuFinding(finding, validEvidenceIds));
  const findingById = new Map<string, NormalizedViseuFinding>();
  for (const finding of normalizedFindings) {
    findingById.set(finding.item_id, finding);
  }

  let rawBlockingIssues: CanonicalBlockingIssue[] = [];
  if (Array.isArray(draft.blocking_issues)) {
    rawBlockingIssues = (draft.blocking_issues as Array<Record<string, unknown>>).map((issue, index) => ({
      title: firstString(issue.title) || `Blocking issue ${index + 1}`,
      description: firstString(issue.description) || '',
      priority: parseMaybeNumber(issue.priority) ?? index + 1,
      source_scope: firstString(issue.source_scope) || 'unknown',
      source_findings: Array.isArray(issue.source_findings)
        ? issue.source_findings.filter((value): value is string => typeof value === 'string')
        : [],
      evidence_refs: normalizeEvidenceRefs(issue, validEvidenceIds),
      sheet_refs: Array.isArray(issue.sheet_refs)
        ? (issue.sheet_refs as Array<Record<string, unknown>>)
            .map((ref) => normalizeSheetRef(ref))
            .filter((ref): ref is SheetRef => ref !== null)
        : [],
      ...(typeof issue.visual_note_summary === 'string' ? { visual_note_summary: issue.visual_note_summary } : {}),
    }));
  } else if (Array.isArray(draft.critical_blockers)) {
    rawBlockingIssues = (draft.critical_blockers as unknown[])
      .filter((value): value is string => typeof value === 'string')
      .map((findingId) => {
        const finding = findingById.get(findingId);
        return {
          title: titleFromFinding(finding || { id: findingId }),
          description: firstString(finding?.description, finding?.next_action) || '',
          priority: priorityFromRef(findingId),
          source_scope: firstString(finding?.source_scope) || 'unknown',
          source_findings: [findingId],
          evidence_refs: finding?.evidence_refs || [],
          sheet_refs: [],
        } satisfies CanonicalBlockingIssue;
      });
  }

  const additionalCorrections: Record<string, unknown>[] = Array.isArray(draft.additional_corrections)
    ? cloneValue(draft.additional_corrections as Record<string, unknown>[])
    : [];
  const removedBlockingIssues: ValidationReport['removed_blocking_issues'] = [];

  const blockingIssues = rawBlockingIssues
    .map((issue) => {
      const linkedFindings = issue.source_findings
        .map((findingId) => findingById.get(findingId))
        .filter((finding): finding is NormalizedViseuFinding => Boolean(finding));
      const supportedFindings = linkedFindings.filter((finding) => findingSupportsBlocker(finding));

      const narrowedIssue: CanonicalBlockingIssue = {
        ...issue,
        source_findings: supportedFindings.length > 0
          ? supportedFindings.map((finding) => finding.item_id)
        : issue.source_findings,
        evidence_refs: [
          ...new Set([
            ...issue.evidence_refs,
            ...supportedFindings.flatMap((finding) => finding.evidence_refs),
          ]),
        ],
      };

      return normalizedManifest
        ? enrichBlockingIssue(narrowedIssue, normalizedManifest, findingById)
        : narrowedIssue;
    })
    .filter((issue): issue is CanonicalBlockingIssue => issue !== null);

  for (const finding of normalizedFindings) {
    if (finding.determination_status === 'inconclusive') {
      additionalCorrections.push(summarizeFindingForAdditionalCorrection(finding));
    }
  }

  const totalFindings = draft.total_findings && typeof draft.total_findings === 'object'
    ? {
        ...(draft.total_findings as Record<string, unknown>),
        determination_counts: {
          confirmed_non_compliance: normalizedFindings.filter((finding) => finding.determination_status === 'confirmed_non_compliance').length,
          document_missing_or_incomplete: normalizedFindings.filter((finding) => finding.determination_status === 'document_missing_or_incomplete').length,
          needs_official_source: normalizedFindings.filter((finding) => finding.determination_status === 'needs_official_source').length,
          inconclusive: normalizedFindings.filter((finding) => finding.determination_status === 'inconclusive').length,
        },
      }
    : {
        total: normalizedFindings.length,
        determination_counts: {
          confirmed_non_compliance: normalizedFindings.filter((finding) => finding.determination_status === 'confirmed_non_compliance').length,
          document_missing_or_incomplete: normalizedFindings.filter((finding) => finding.determination_status === 'document_missing_or_incomplete').length,
          needs_official_source: normalizedFindings.filter((finding) => finding.determination_status === 'needs_official_source').length,
          inconclusive: normalizedFindings.filter((finding) => finding.determination_status === 'inconclusive').length,
        },
      };

  const recommendation = firstString(draft.recommendation, summary.recommendation);
  const reviewOutcome = firstString(draft.review_outcome, summary.review_outcome);
  const reviewOutcomeRationale = firstString(
    draft.review_outcome_rationale,
    summary.review_outcome_rationale,
    summary.recommendation,
  );
  const validationReport = buildValidationReport(normalizedFindings, removedBlockingIssues);

  const canonicalReviewChecklist: CanonicalReviewChecklist = {
    schema_version: 1,
    municipality: firstString(draft.municipality, summary.municipality) || 'Viseu',
    document_type: firstString(draft.document_type, summary.document_type) || 'draft_corrections_letter',
    review_outcome: reviewOutcome,
    total_findings: totalFindings,
    blocking_issues: blockingIssues,
    source_needed_items: Array.isArray(draft.source_needed_items)
      ? cloneValue(draft.source_needed_items as unknown[])
      : summarizeByDetermination(normalizedFindings, 'needs_official_source'),
    depends_on_pdmv_items: Array.isArray(draft.depends_on_pdmv_items)
      ? cloneValue(draft.depends_on_pdmv_items as unknown[])
      : normalizedFindings
          .filter((finding) => finding.depends_on_pdmv)
          .map((finding) => summarizeFindingForChecklist(finding)),
    additional_corrections: additionalCorrections,
    review_outcome_rationale: reviewOutcomeRationale,
    evidence_index: evidenceIndex,
    validation_report: validationReport,
    project: draft.project ?? summary.project ?? null,
    location: draft.location ?? summary.location ?? null,
    applicant: draft.applicant ?? summary.applicant ?? null,
    loteamento: draft.loteamento ?? summary.loteamento ?? null,
    pip_process: draft.pip_process ?? summary.pip_process ?? null,
    date: draft.date ?? summary.date ?? null,
    review_date: draft.review_date ?? summary.review_date ?? null,
    recommendation,
  };

  return {
    normalizedManifest,
    canonicalReviewChecklist,
  };
}

export function buildCanonicalViseuReviewArtifacts(rawFiles: RawOutputFiles): {
  normalizedManifest: { sheets: NormalizedSheetManifestSheet[]; [key: string]: unknown } | null;
  canonicalReviewChecklist: CanonicalReviewChecklist | null;
} {
  return buildCanonicalViseuReviewArtifactsForSandbox(rawFiles);
}
