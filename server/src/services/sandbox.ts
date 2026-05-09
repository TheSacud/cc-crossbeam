import { Sandbox } from '@vercel/sandbox';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  CONFIG,
  SKIP_FILES,
  SANDBOX_FILES_PATH,
  SANDBOX_OUTPUT_PATH,
  SANDBOX_SKILLS_BASE,
  getFlowSkills,
  getPreloadedManifest,
  FLOW_BUDGET,
  buildPrompt,
  getSystemAppend,
  type InternalFlowType,
} from '../utils/config.js';
import { insertMessage } from './supabase.js';
import {
  buildCanonicalViseuReviewArtifactsForSandbox,
  buildViseuAnalysisArtifactsForSandbox,
  buildViseuValidationReportForSandbox,
} from './viseu-output.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Types ---

interface FileToUpload {
  relativePath: string;
  content: Buffer;
}

interface ProjectFile {
  filename: string;
  storage_path: string;
  file_type: string;
}

interface FileToDownload {
  bucket: string;
  storagePath: string;
  targetFilename: string;
}

interface RunFlowOptions {
  files: ProjectFile[];
  flowType: InternalFlowType;
  city: string;
  address?: string;
  apiKey: string;
  supabaseUrl: string;
  supabaseKey: string;
  projectId: string;
  userId: string;
  contractorAnswersJson?: string;
  phase1Artifacts?: Record<string, unknown>;
}

interface SheetManifestSheet {
  page: number;
  desenho?: number | null;
  title?: string | null;
  notes?: string | null;
  discipline?: string | null;
  title_confirmed?: boolean;
  scale?: string | null;
  sheet_key?: string;
  page_png_path?: string;
  title_block_png_path?: string;
}

interface SheetRef {
  page: number;
  desenho: number | null;
  title: string;
  page_png_path: string;
  title_block_png_path: string;
  visual_note: string | null;
}

interface BlockingIssue extends Record<string, unknown> {
  title?: string;
  source_findings?: unknown[];
  sheet_refs?: SheetRef[];
  visual_note_summary?: string;
}

export function normalizeProjectUnderstandingForOutput(
  allFiles: Record<string, unknown>,
): Record<string, unknown> | null {
  const raw = allFiles['project_understanding.json'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  }

  function asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  function asStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value
          .map((entry) => asString(entry))
          .filter((entry): entry is string => Boolean(entry))
      : [];
  }

  function asNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  function asBooleanOrNull(value: unknown): boolean | null {
    return typeof value === 'boolean' ? value : null;
  }

  function normalizeConfidence(value: unknown): 'high' | 'medium' | 'low' {
    return value === 'high' || value === 'medium' || value === 'low' ? value : 'medium';
  }

  function normalizeValueType(value: unknown): 'declared' | 'cotated' | 'measured_estimate' | 'inferred' | 'unknown' {
    return value === 'declared'
      || value === 'cotated'
      || value === 'measured_estimate'
      || value === 'inferred'
      || value === 'unknown'
      ? value
      : 'unknown';
  }

  function normalizeUnderstandingStatus(
    value: unknown,
    fallback: 'complete' | 'partial' | 'degraded',
  ): 'complete' | 'partial' | 'degraded' {
    return value === 'complete' || value === 'partial' || value === 'degraded' ? value : fallback;
  }

  function normalizeManifest(): Array<Record<string, unknown>> {
    function pagePath(page: number): string {
      return `pages-png/page-${String(page).padStart(2, '0')}.png`;
    }

    function titleBlockPath(page: number): string {
      return `title-blocks/title-block-${String(page).padStart(2, '0')}.png`;
    }

    const manifest = asRecord(allFiles['sheet-manifest.json']);
    if (!manifest || !Array.isArray(manifest.sheets)) {
      return [];
    }

    const sheets = manifest.sheets
      .map((sheet) => {
        const entry = asRecord(sheet);
        const page = asNumber(entry?.page ?? entry?.page_number);
        if (page == null) {
          return null;
        }
        const desenho = asNumber(entry?.desenho ?? entry?.sheet_designation ?? entry?.sheet_id);
        return {
          page,
          desenho,
          title: asString(entry?.title ?? entry?.sheet_title) || `Page ${page}`,
          page_png_path: asString(entry?.page_png_path) || pagePath(page),
          title_block_png_path: asString(entry?.title_block_png_path) || titleBlockPath(page),
        };
      });
    return sheets.filter(Boolean) as Array<Record<string, unknown>>;
  }

  function normalizePageText(): Array<Record<string, unknown>> {
    if (!Array.isArray(allFiles['page-text.json'])) {
      return [];
    }
    const entries = (allFiles['page-text.json'] as unknown[])
      .map((entry) => {
        const item = asRecord(entry);
        const page = asNumber(item?.page);
        if (page == null) {
          return null;
        }
        const text = asString(item?.text) || '';
        const textLength = asNumber(item?.text_length) ?? text.length;
        const hasExtractableText = typeof item?.has_extractable_text === 'boolean'
          ? item.has_extractable_text
          : textLength > 0;
        return {
          page,
          text,
          text_length: textLength,
          has_extractable_text: hasExtractableText,
          source: hasExtractableText ? 'pdf-native' : 'none',
        };
      });
    return entries.filter(Boolean) as Array<Record<string, unknown>>;
  }

  const manifestSheets = normalizeManifest();
  const manifestByPage = new Map<number, Record<string, unknown>>(
    manifestSheets.map((sheet) => [sheet.page as number, sheet]),
  );
  const pageTextEntries = normalizePageText();
  const rawRecord = raw as Record<string, unknown>;
  const pagePath = (page: number) => `pages-png/page-${String(page).padStart(2, '0')}.png`;
  const titleBlockPath = (page: number) => `title-blocks/title-block-${String(page).padStart(2, '0')}.png`;

  const evidenceIndex = (Array.isArray(rawRecord.evidence_index) ? rawRecord.evidence_index : [])
    .map((entry, index) => {
      const item = asRecord(entry);
      const page = asNumber(item?.page);
      if (page == null) {
        return null;
      }
      const manifestSheet = manifestByPage.get(page);
      return {
        id: asString(item?.id) || `evidence_${index + 1}`,
        page,
        desenho: asNumber(item?.desenho ?? manifestSheet?.desenho),
        title: asString(item?.title ?? manifestSheet?.title) || `Page ${page}`,
        page_png_path: asString(item?.page_png_path ?? manifestSheet?.page_png_path) || pagePath(page),
        title_block_png_path: asString(item?.title_block_png_path ?? manifestSheet?.title_block_png_path) || titleBlockPath(page),
        crop_path: asString(item?.crop_path),
        crop_storage_bucket: asString(item?.crop_storage_bucket),
        crop_storage_path: asString(item?.crop_storage_path),
        evidence_type: asString(item?.evidence_type) || 'sheet',
        quote: asString(item?.quote),
      };
    });
  const normalizedEvidenceIndex = evidenceIndex.filter(Boolean) as Array<Record<string, unknown>>;

  if (normalizedEvidenceIndex.length === 0) {
    return null;
  }

  const evidenceIds = new Set(normalizedEvidenceIndex.map((entry) => entry.id as string));
  const rawSummary = asRecord(rawRecord.project_summary);
  const summaryText = asString(rawSummary?.summary_text)
    || [asString(rawSummary?.title), asString(rawSummary?.location)]
      .filter(Boolean)
      .join(' — ')
    || 'Project understanding extracted from submitted documents.';

  const rawDocumentProfile = asRecord(rawRecord.document_profile);
  const hasNativeText = typeof rawDocumentProfile?.has_native_text === 'boolean'
    ? rawDocumentProfile.has_native_text
    : pageTextEntries.some((entry) => entry.has_extractable_text === true);
  const sourcePdf = asString(rawDocumentProfile?.source_pdf)
    || asString(asRecord(allFiles['sheet-manifest.json'])?.source_pdf)
    || 'unknown.pdf';
  const inferredOrigin = sourcePdf.toLowerCase().includes('.dwf')
    ? 'dwf-derived'
    : hasNativeText
      ? 'cad-export'
      : 'scan-like';
  const drawingOriginGuess = rawDocumentProfile?.drawing_origin_guess === 'dwf-derived'
    || rawDocumentProfile?.drawing_origin_guess === 'cad-export'
    || rawDocumentProfile?.drawing_origin_guess === 'scan-like'
    || rawDocumentProfile?.drawing_origin_guess === 'unknown'
    ? rawDocumentProfile.drawing_origin_guess
    : inferredOrigin;
  const totalPages = asNumber(rawDocumentProfile?.total_pages)
    ?? manifestSheets.length
    ?? pageTextEntries.length;

  const normalizeEvidenceRefs = (value: unknown): string[] =>
    asStringArray(value).filter((id) => evidenceIds.has(id));

  const normalizeStatedAreas = (value: unknown): Array<{
    label: string;
    value: string;
    value_type: 'declared' | 'cotated' | 'measured_estimate' | 'inferred' | 'unknown';
    usable_for_compliance: boolean;
  }> =>
    Array.isArray(value)
      ? value
          .map((entry) => {
            const area = asRecord(entry);
            const label = asString(area?.label);
            const areaValue = asString(area?.value);
            if (!label || !areaValue) {
              return null;
            }
            const valueType = normalizeValueType(area?.value_type ?? area?.source_type);
            return {
              label,
              value: areaValue,
              value_type: valueType,
              usable_for_compliance: typeof area?.usable_for_compliance === 'boolean'
                ? area.usable_for_compliance
                : valueType === 'declared' || valueType === 'cotated',
            };
          })
          .filter((entry): entry is {
            label: string;
            value: string;
            value_type: 'declared' | 'cotated' | 'measured_estimate' | 'inferred' | 'unknown';
            usable_for_compliance: boolean;
          } => Boolean(entry))
      : [];

  const buildingProgram = (Array.isArray(rawRecord.building_program) ? rawRecord.building_program : [])
    .map((entry) => {
      const item = asRecord(entry);
      const levelName = asString(item?.level_name);
      if (!levelName) {
        return null;
      }
      return {
        level_name: levelName,
        unit_label: asString(item?.unit_label),
        spaces: asStringArray(item?.spaces),
        stated_areas: normalizeStatedAreas(item?.stated_areas),
        confidence: normalizeConfidence(item?.confidence),
        evidence_refs: normalizeEvidenceRefs(item?.evidence_refs),
      };
    });
  const normalizedBuildingProgram = buildingProgram.filter(Boolean) as Array<Record<string, unknown>>;

  const rawSiteAndMass = asRecord(rawRecord.site_and_mass);
  const rawKeyTables = asRecord(rawRecord.key_tables_and_legends);

  const disciplineCoverage = (Array.isArray(rawRecord.discipline_coverage) ? rawRecord.discipline_coverage : [])
    .map((entry) => {
      const item = asRecord(entry);
      const discipline = asString(item?.discipline);
      if (!discipline) {
        return null;
      }
      return {
        discipline,
        present_pages: Array.isArray(item?.present_pages)
          ? item.present_pages.map((page) => asNumber(page)).filter((page): page is number => page != null)
          : [],
        missing_expected: asStringArray(item?.missing_expected),
        confidence: normalizeConfidence(item?.confidence),
      };
    });
  const normalizedDisciplineCoverage = disciplineCoverage.filter(Boolean) as Array<Record<string, unknown>>;

  const openQuestions = (Array.isArray(rawRecord.open_questions) ? rawRecord.open_questions : [])
    .map((entry) => {
      const item = asRecord(entry);
      const question = asString(item?.question);
      if (!question) {
        return null;
      }
      return {
        question,
        reason: asString(item?.reason) || '',
        related_evidence_ids: normalizeEvidenceRefs(item?.related_evidence_ids),
        confidence: normalizeConfidence(item?.confidence),
      };
    });
  const normalizedOpenQuestions = openQuestions.filter(Boolean) as Array<Record<string, unknown>>;

  const fallbackStatus = normalizedOpenQuestions.length > 0 ? 'partial' : 'complete';

  return {
    schema_version: 1,
    document_profile: {
      source_pdf: sourcePdf,
      total_pages: totalPages,
      has_native_text: hasNativeText,
      drawing_origin_guess: drawingOriginGuess,
    },
    project_summary: {
      project_type: asString(rawSummary?.project_type),
      work_type: asString(rawSummary?.work_type),
      confidence: normalizeConfidence(rawSummary?.confidence),
      summary_text: summaryText,
    },
    building_program: normalizedBuildingProgram,
    site_and_mass: {
      implantation: asString(rawSiteAndMass?.implantation),
      accesses: asStringArray(rawSiteAndMass?.accesses),
      parking: asString(rawSiteAndMass?.parking),
      open_space: asString(rawSiteAndMass?.open_space ?? rawSiteAndMass?.logradouros),
      confidence: normalizeConfidence(rawSiteAndMass?.confidence),
      evidence_refs: normalizeEvidenceRefs(rawSiteAndMass?.evidence_refs),
    },
    key_tables_and_legends: {
      synoptic_table_present: asBooleanOrNull(rawKeyTables?.synoptic_table_present),
      legend_present: asBooleanOrNull(rawKeyTables?.legend_present),
      scales: asStringArray(rawKeyTables?.scales ?? rawKeyTables?.scale_notes),
      north_arrow_present: asBooleanOrNull(rawKeyTables?.north_arrow_present),
      confidence: normalizeConfidence(rawKeyTables?.confidence),
      evidence_refs: normalizeEvidenceRefs(rawKeyTables?.evidence_refs),
    },
    discipline_coverage: normalizedDisciplineCoverage,
    evidence_index: normalizedEvidenceIndex,
    open_questions: normalizedOpenQuestions,
    understanding_status: normalizeUnderstandingStatus(rawRecord.understanding_status, fallbackStatus),
  };
}

export function buildReviewPhaseOutputData(allFiles: Record<string, unknown>): {
  corrections_letter_md: unknown;
  review_checklist_json: unknown;
  project_understanding_json: unknown;
  raw_artifacts: unknown;
} {
  const { canonicalReviewChecklist } = buildCanonicalViseuReviewArtifactsForSandbox(allFiles);
  const validationReport = canonicalReviewChecklist?.validation_report
    || buildViseuValidationReportForSandbox(allFiles);
  return {
    corrections_letter_md: allFiles['draft_corrections.md'] || null,
    review_checklist_json: canonicalReviewChecklist,
    project_understanding_json: normalizeProjectUnderstandingForOutput(allFiles),
    raw_artifacts: {
      ...allFiles,
      'validation_report.json': validationReport,
    },
  };
}

export function buildAnalysisPhaseOutputData(allFiles: Record<string, unknown>): {
  corrections_analysis_json: unknown;
  applicant_questions_json: unknown;
  project_understanding_json: unknown;
  raw_artifacts: unknown;
} {
  const { normalizedFindings, normalizedContractorQuestions } = buildViseuAnalysisArtifactsForSandbox(allFiles);
  const validationReport = buildViseuValidationReportForSandbox(allFiles);
  return {
    corrections_analysis_json: normalizedFindings,
    applicant_questions_json: normalizedContractorQuestions || allFiles['applicant_questions.json'] || allFiles['contractor_questions.json'] || null,
    project_understanding_json: normalizeProjectUnderstandingForOutput(allFiles),
    raw_artifacts: {
      ...allFiles,
      'validation_report.json': validationReport,
    },
  };
}

export function buildResponsePhaseOutputData(allFiles: Record<string, unknown>): {
  response_letter_md: unknown;
  professional_scope_md: unknown;
  corrections_report_md: unknown;
  sheet_annotations_json: unknown;
  project_understanding_json: unknown;
} {
  return {
    response_letter_md: allFiles['response_letter.md'] || null,
    professional_scope_md: allFiles['professional_scope.md'] || null,
    corrections_report_md: allFiles['corrections_report.md'] || null,
    sheet_annotations_json: allFiles['sheet_annotations.json'] || null,
    project_understanding_json: normalizeProjectUnderstandingForOutput(allFiles),
  };
}

// --- Helpers ---

function shouldSkipFile(filename: string): boolean {
  return SKIP_FILES.includes(filename) || filename.startsWith('.');
}

function readSkillFilesFromDisk(skillNames: string[]): Map<string, FileToUpload[]> {
  const result = new Map<string, FileToUpload[]>();

  for (const skillName of skillNames) {
    const skillDir = path.join(__dirname, '../../skills', skillName);
    const files: FileToUpload[] = [];

    if (!fs.existsSync(skillDir)) {
      console.warn(`Skill directory not found: ${skillDir}`);
      continue;
    }

    function walk(currentPath: string, basePath: string) {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        if (shouldSkipFile(entry.name)) continue;
        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(basePath, fullPath);

        if (entry.isDirectory()) {
          walk(fullPath, basePath);
        } else {
          files.push({
            relativePath,
            content: fs.readFileSync(fullPath),
          });
        }
      }
    }

    walk(skillDir, skillDir);
    result.set(skillName, files);
  }

  return result;
}

function toPagePngPath(page: number): string {
  return `pages-png/page-${String(page).padStart(2, '0')}.png`;
}

function toTitleBlockPath(page: number): string {
  return `title-blocks/title-block-${String(page).padStart(2, '0')}.png`;
}

function enrichSheetManifest(allFiles: Record<string, unknown>): void {
  const manifest = allFiles['sheet-manifest.json'] as { sheets?: SheetManifestSheet[] } | undefined;
  if (!manifest || !Array.isArray(manifest.sheets)) {
    return;
  }

  manifest.sheets = manifest.sheets.map((sheet) => {
    const page = Number(sheet.page);
    if (!Number.isFinite(page)) {
      return sheet;
    }

    return {
      ...sheet,
      sheet_key: sheet.desenho != null ? `desenho-${sheet.desenho}` : `page-${page}`,
      page_png_path: sheet.page_png_path || toPagePngPath(page),
      title_block_png_path: sheet.title_block_png_path || toTitleBlockPath(page),
    };
  });
}

function buildSheetRef(sheet: SheetManifestSheet): SheetRef | null {
  const page = Number(sheet.page);
  if (!Number.isFinite(page)) {
    return null;
  }

  return {
    page,
    desenho: sheet.desenho ?? null,
    title: sheet.title || `Page ${page}`,
    page_png_path: sheet.page_png_path || toPagePngPath(page),
    title_block_png_path: sheet.title_block_png_path || toTitleBlockPath(page),
    visual_note: sheet.notes || null,
  };
}

function inferBlockingIssueSheetRefs(allFiles: Record<string, unknown>): void {
  const manifest = allFiles['sheet-manifest.json'] as { sheets?: SheetManifestSheet[]; project?: Record<string, unknown> } | undefined;
  const draft = allFiles['draft_corrections.json'] as { blocking_issues?: BlockingIssue[] } | undefined;
  if (!manifest || !Array.isArray(manifest.sheets) || !draft || !Array.isArray(draft.blocking_issues)) {
    return;
  }

  const sheetByPage = new Map<number, SheetManifestSheet>();
  const sheetByDesenho = new Map<number, SheetManifestSheet>();
  for (const sheet of manifest.sheets) {
    if (Number.isFinite(Number(sheet.page))) {
      sheetByPage.set(Number(sheet.page), sheet);
    }
    if (sheet.desenho != null && Number.isFinite(Number(sheet.desenho))) {
      sheetByDesenho.set(Number(sheet.desenho), sheet);
    }
  }

  const explicitFindings = [
    ...(Array.isArray(allFiles['findings-arquitetura-urbanismo.json']) ? allFiles['findings-arquitetura-urbanismo.json'] as Array<Record<string, unknown>> : []),
    ...(Array.isArray(allFiles['findings-especialidades.json']) ? allFiles['findings-especialidades.json'] as Array<Record<string, unknown>> : []),
    ...(Array.isArray(allFiles['findings-acessibilidades-seguranca.json']) ? allFiles['findings-acessibilidades-seguranca.json'] as Array<Record<string, unknown>> : []),
    ...(Array.isArray(allFiles['findings-instrucao-administrativa.json']) ? allFiles['findings-instrucao-administrativa.json'] as Array<Record<string, unknown>> : []),
    ...(Array.isArray(allFiles['findings-legalizacao.json']) ? allFiles['findings-legalizacao.json'] as Array<Record<string, unknown>> : []),
    ...(Array.isArray(allFiles['municipal_compliance.json']) ? allFiles['municipal_compliance.json'] as Array<Record<string, unknown>> : []),
    ...(Array.isArray(allFiles['national_compliance.json']) ? allFiles['national_compliance.json'] as Array<Record<string, unknown>> : []),
  ];

  const findingById = new Map<string, Record<string, unknown>>();
  for (const finding of explicitFindings) {
    const id = typeof finding.id === 'string' ? finding.id : null;
    if (id) {
      findingById.set(id, finding);
    }
  }

  const issueSheetHints: Array<{ pattern: RegExp; pages?: number[]; desenhos?: number[]; summary: string }> = [
    { pattern: /Typology mismatch|T3 .* T4/i, desenhos: [5, 6], summary: 'Floor plans show the unit typology used to support this blocking issue.' },
    { pattern: /Quadro sinoptico/i, desenhos: [19], summary: 'The synoptic sheet contains the contradictory area and index data supporting this blocking issue.' },
    { pattern: /Exterior colour palette/i, desenhos: [13, 14], summary: 'Elevations show the exterior palette referenced in this blocking issue.' },
    { pattern: /specialty engineering projects absent/i, pages: [1, 20], summary: 'The cover/index and end of the drawing set support the absence of specialty sheets in the submitted binder.' },
    { pattern: /Core administrative documents missing/i, pages: [1], summary: 'The submitted binder content supports the dossier-level incompleteness referenced in this blocking issue.' },
    { pattern: /Procedural sequencing violation/i, pages: [1], summary: 'This blocking issue is primarily documental; the binder itself does not show the required prior loteamento steps.' },
  ];

  for (const issue of draft.blocking_issues) {
    const sourceFindings = Array.isArray(issue.source_findings) ? issue.source_findings as unknown[] : [];
    const matchedSheets = new Map<number, SheetRef>();

    for (const sourceFinding of sourceFindings) {
      const findingId = typeof sourceFinding === 'string' ? sourceFinding : null;
      if (!findingId) {
        continue;
      }
      const finding = findingById.get(findingId);
      if (!finding) {
        continue;
      }

      const candidatePages = new Set<number>();
      const sourceReference = typeof finding.source_reference === 'string' ? finding.source_reference : '';
      for (const match of sourceReference.matchAll(/\b(?:sheet|page|pagina|página)\s*(\d{1,2})\b/gi)) {
        candidatePages.add(Number(match[1]));
      }
      const description = typeof finding.description === 'string' ? finding.description : '';
      for (const match of description.matchAll(/\b(?:sheet|page|pagina|página)\s*(\d{1,2})\b/gi)) {
        candidatePages.add(Number(match[1]));
      }

      for (const page of candidatePages) {
        const sheet = sheetByPage.get(page);
        const ref = sheet ? buildSheetRef(sheet) : null;
        if (ref) {
          matchedSheets.set(ref.page, ref);
        }
      }
    }

    if (matchedSheets.size === 0) {
      const title = typeof issue.title === 'string' ? issue.title : '';
      const hint = issueSheetHints.find((candidate) => candidate.pattern.test(title));
      if (hint?.desenhos) {
        for (const desenho of hint.desenhos) {
          const sheet = sheetByDesenho.get(desenho);
          const ref = sheet ? buildSheetRef(sheet) : null;
          if (ref) {
            ref.visual_note = hint.summary;
            matchedSheets.set(ref.page, ref);
          }
        }
      }
      if (hint?.pages) {
        for (const page of hint.pages) {
          const sheet = sheetByPage.get(page);
          const ref = sheet ? buildSheetRef(sheet) : null;
          if (ref) {
            ref.visual_note = hint.summary;
            matchedSheets.set(ref.page, ref);
          }
        }
      }
      if (hint) {
        issue.visual_note_summary = hint.summary;
      }
    }

    issue.sheet_refs = Array.from(matchedSheets.values())
      .sort((a, b) => a.page - b.page)
      .slice(0, 3);

    if ((!issue.sheet_refs || issue.sheet_refs.length === 0) && !issue.visual_note_summary) {
      issue.visual_note_summary = 'No direct visual sheet reference was resolved for this blocking issue; review remains primarily documental/procedural.';
    }
  }
}

// --- Sandbox Lifecycle ---

async function createSandbox(): Promise<Sandbox> {
  console.log(`Creating Vercel Sandbox (timeout: ${CONFIG.SANDBOX_TIMEOUT}ms, vcpus: ${CONFIG.SANDBOX_VCPUS})...`);
  const sandbox = await Sandbox.create({
    teamId: process.env.VERCEL_TEAM_ID!,
    projectId: process.env.VERCEL_PROJECT_ID!,
    token: process.env.VERCEL_TOKEN!,
    resources: { vcpus: CONFIG.SANDBOX_VCPUS },
    timeout: CONFIG.SANDBOX_TIMEOUT,
    runtime: CONFIG.RUNTIME,
  });
  console.log(`Sandbox created: ${sandbox.sandboxId}, timeout: ${sandbox.timeout}ms`);
  // Extend timeout to ensure we have the full 30 minutes
  if (sandbox.timeout < CONFIG.SANDBOX_TIMEOUT) {
    console.log(`Extending sandbox timeout from ${sandbox.timeout}ms to ${CONFIG.SANDBOX_TIMEOUT}ms`);
    await sandbox.extendTimeout(CONFIG.SANDBOX_TIMEOUT - sandbox.timeout);
    console.log(`Sandbox timeout after extension: ${sandbox.timeout}ms`);
  }
  return sandbox;
}

async function installDependencies(sandbox: Sandbox, projectId?: string): Promise<void> {
  // No system packages needed — PDF extraction happens on Cloud Run before sandbox.
  // The sandbox is pure AI processing.

  console.log('Installing Claude Code CLI...');
  if (projectId) {
    insertMessage(projectId, 'system', 'Installing Claude Code CLI...').catch(() => {});
  }
  const cliResult = await sandbox.runCommand({
    cmd: 'npm',
    args: ['install', '-g', '@anthropic-ai/claude-code'],
    sudo: true,
  });
  if (cliResult.exitCode !== 0) {
    throw new Error('Failed to install Claude Code CLI');
  }

  console.log('Installing Claude Agent SDK, Supabase, and image helpers...');
  const sdkResult = await sandbox.runCommand({
    cmd: 'npm',
    args: ['install', '@anthropic-ai/claude-agent-sdk', '@supabase/supabase-js', 'jimp'],
  });
  if (sdkResult.exitCode !== 0) {
    throw new Error('Failed to install Agent SDK');
  }
}

// --- File Handling ---

function buildDownloadManifest(files: ProjectFile[]): FileToDownload[] {
  return files.map((f) => {
    // Determine the bucket based on storage_path prefix
    let bucket: string;
    let storagePath: string;

    if (f.storage_path.startsWith('crossbeam-demo-assets/')) {
      bucket = 'crossbeam-demo-assets';
      storagePath = f.storage_path.replace('crossbeam-demo-assets/', '');
    } else if (f.storage_path.startsWith('crossbeam-uploads/')) {
      bucket = 'crossbeam-uploads';
      storagePath = f.storage_path.replace('crossbeam-uploads/', '');
    } else {
      // Fallback: treat the whole path as the storage path, use uploads bucket
      bucket = 'crossbeam-uploads';
      storagePath = f.storage_path;
    }

    return {
      bucket,
      storagePath,
      targetFilename: f.filename,
    };
  });
}

async function downloadFilesInSandbox(
  sandbox: Sandbox,
  files: ProjectFile[],
  supabaseUrl: string,
  supabaseKey: string,
): Promise<void> {
  const filesToDownload = buildDownloadManifest(files);
  console.log(`Setting up download of ${filesToDownload.length} files...`);

  const downloadScript = `
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabase = createClient('${supabaseUrl}', '${supabaseKey}');
const files = ${JSON.stringify(filesToDownload)};
const basePath = '${SANDBOX_FILES_PATH}';

async function downloadFiles() {
  console.log('Starting download of ' + files.length + ' files from Supabase...');

  let downloaded = 0;
  let failed = 0;

  for (const file of files) {
    const targetPath = path.join(basePath, file.targetFilename);
    const targetDir = path.dirname(targetPath);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    try {
      const { data, error } = await supabase.storage
        .from(file.bucket)
        .download(file.storagePath);

      if (error) {
        console.error('Error downloading ' + file.targetFilename + ':', error.message);
        failed++;
        continue;
      }

      const buffer = Buffer.from(await data.arrayBuffer());
      fs.writeFileSync(targetPath, buffer);
      downloaded++;
      console.log('Downloaded: ' + file.targetFilename + ' from ' + file.bucket);
    } catch (err) {
      console.error('Failed to download ' + file.targetFilename + ':', err.message);
      failed++;
    }
  }

  console.log('Download complete: ' + downloaded + ' succeeded, ' + failed + ' failed');

  if (failed > 0 && downloaded === 0) {
    process.exit(1);
  }
}

downloadFiles();
`;

  await sandbox.writeFiles([
    { path: '/vercel/sandbox/download-files.mjs', content: Buffer.from(downloadScript) },
  ]);

  console.log('Running file download script in sandbox...');
  const result = await sandbox.runCommand({
    cmd: 'node',
    args: ['download-files.mjs'],
  });

  const stdout = await result.stdout();
  console.log(stdout.toString());

  if (result.exitCode !== 0) {
    const stderr = await result.stderr();
    throw new Error(`Failed to download files: ${stderr.toString()}`);
  }

  console.log('Files downloaded successfully in sandbox');
}

// --- Archive Unpacking (demo projects) ---

async function unpackArchivesInSandbox(
  sandbox: Sandbox,
  projectId?: string,
): Promise<void> {
  // Find and unpack any .tar.gz files in project-files/
  const findResult = await sandbox.runCommand({
    cmd: 'bash',
    args: ['-c', `ls ${SANDBOX_FILES_PATH}/*.tar.gz 2>/dev/null || true`],
  });
  const stdout = await findResult.stdout();
  const archives = stdout.toString().trim().split('\n').filter(Boolean);

  if (archives.length === 0) {
    console.log('No archives to unpack');
    return;
  }

  console.log(`Unpacking ${archives.length} archives...`);
  if (projectId) {
    insertMessage(projectId, 'system', `Unpacking ${archives.length} pre-extracted archives...`).catch(() => {});
  }

  for (const archive of archives) {
    const result = await sandbox.runCommand({
      cmd: 'tar',
      args: ['xzf', archive, '-C', SANDBOX_FILES_PATH],
    });
    if (result.exitCode !== 0) {
      const stderr = await result.stderr();
      console.warn(`Failed to unpack ${archive}: ${stderr.toString()}`);
    } else {
      console.log(`Unpacked: ${archive}`);
      // Delete the archive after unpacking
      await sandbox.runCommand({ cmd: 'rm', args: [archive] });
    }
  }
}

async function preloadDeterministicArtifacts(
  sandbox: Sandbox,
  flowType: InternalFlowType,
  projectId?: string,
): Promise<boolean> {
  if (flowType !== 'city-review' && flowType !== 'corrections-analysis') {
    return false;
  }

  const manifestPath = `${SANDBOX_FILES_PATH}/sheet-manifest.json`;
  const existsResult = await sandbox.runCommand({
    cmd: 'test',
    args: ['-f', manifestPath],
  });
  if (existsResult.exitCode !== 0) {
    return false;
  }

  await sandbox.runCommand({ cmd: 'mkdir', args: ['-p', SANDBOX_OUTPUT_PATH] });
  const copyResult = await sandbox.runCommand({
    cmd: 'cp',
    args: [manifestPath, `${SANDBOX_OUTPUT_PATH}/sheet-manifest.json`],
  });
  if (copyResult.exitCode !== 0) {
    const stderr = await copyResult.stderr();
    console.warn(`Failed to preload deterministic sheet manifest: ${stderr.toString()}`);
    return false;
  }

  if (projectId) {
    insertMessage(projectId, 'system', '[SANDBOX 5.5/7] Preliminary sheet manifest pre-loaded').catch(() => {});
  }
  return true;
}

// --- Skills ---

async function copySkillsToSandbox(
  sandbox: Sandbox,
  skillNames: string[],
): Promise<void> {
  const skillsMap = readSkillFilesFromDisk(skillNames);
  let totalFiles = 0;

  for (const [skillName, files] of skillsMap) {
    const skillPath = `${SANDBOX_SKILLS_BASE}/${skillName}`;
    console.log(`Copying skill ${skillName} (${files.length} files)...`);

    // Get unique directories
    const dirs = new Set<string>();
    for (const file of files) {
      const dir = path.dirname(file.relativePath);
      if (dir !== '.') {
        const parts = dir.split('/');
        for (let i = 1; i <= parts.length; i++) {
          dirs.add(parts.slice(0, i).join('/'));
        }
      }
    }

    // Create skill directory and subdirs
    await sandbox.runCommand({ cmd: 'mkdir', args: ['-p', skillPath] });
    for (const dir of Array.from(dirs).sort()) {
      await sandbox.runCommand({ cmd: 'mkdir', args: ['-p', `${skillPath}/${dir}`] });
    }

    // Upload skill files
    await sandbox.writeFiles(
      files.map((file) => ({
        path: `${skillPath}/${file.relativePath}`,
        content: file.content,
      }))
    );

    totalFiles += files.length;
  }

  console.log(`Copied ${skillsMap.size} skills (${totalFiles} total files) to sandbox`);
}

// --- Phase 1 Artifacts (for corrections-response) ---

async function writePhase1Artifacts(
  sandbox: Sandbox,
  phase1Artifacts: Record<string, unknown>,
  contractorAnswersJson: string,
): Promise<void> {
  // Create output directory
  await sandbox.runCommand({ cmd: 'mkdir', args: ['-p', SANDBOX_OUTPUT_PATH] });

  // Write each artifact as a JSON file
  const filesToWrite: Array<{ path: string; content: Buffer }> = [];

  for (const [filename, content] of Object.entries(phase1Artifacts)) {
    const jsonContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    filesToWrite.push({
      path: `${SANDBOX_OUTPUT_PATH}/${filename}`,
      content: Buffer.from(jsonContent),
    });
  }

  // Also write applicant_answers.json
  filesToWrite.push({
    path: `${SANDBOX_OUTPUT_PATH}/applicant_answers.json`,
    content: Buffer.from(contractorAnswersJson),
  });

  await sandbox.writeFiles(filesToWrite);
  console.log(`Wrote ${filesToWrite.length} Phase 1 artifacts + contractor answers to sandbox`);
}

// --- Agent Execution ---

async function runAgent(
  sandbox: Sandbox,
  options: {
    apiKey: string;
    projectId: string;
    userId: string;
    supabaseUrl: string;
    supabaseKey: string;
    flowType: InternalFlowType;
    city: string;
    address?: string;
    contractorAnswersJson?: string;
    preExtracted?: boolean;
  },
): Promise<{ exitCode: number }> {
  const {
    apiKey, projectId, userId, supabaseUrl, supabaseKey,
    flowType, city, address, contractorAnswersJson, preExtracted,
  } = options;

  const prompt = buildPrompt(flowType, city, address, contractorAnswersJson, preExtracted);
  const budget = FLOW_BUDGET[flowType];
  const systemAppend = getSystemAppend(flowType, city);

  // Determine what status to set on completion
  const completedStatus = flowType === 'corrections-analysis' ? 'awaiting-answers' : 'completed';
  const flowPhase = flowType === 'city-review' ? 'review'
    : flowType === 'corrections-analysis' ? 'analysis'
    : 'response';

  const agentScript = `
import { query } from '@anthropic-ai/claude-agent-sdk';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabase = createClient('${supabaseUrl}', '${supabaseKey}');
const projectId = '${projectId}';
const userId = '${userId}';
const FILES_PATH = '${SANDBOX_FILES_PATH}';
const OUTPUT_PATH = '${SANDBOX_OUTPUT_PATH}';

// Fire-and-forget message logging
function logMessage(role, content) {
  supabase
    .schema('crossbeam')
    .from('messages')
    .insert({ project_id: projectId, role, content })
    .then(() => {})
    .catch(err => console.error('Failed to log message:', err.message));
}

// Upload file to Supabase Storage
async function uploadFile(filename, content) {
  const storagePath = userId + '/' + projectId + '/' + filename;
  const ext = filename.split('.').pop().toLowerCase();
  const mimeTypes = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', json: 'application/json' };
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  const { error } = await supabase.storage
    .from('crossbeam-outputs')
    .upload(storagePath, content, { upsert: true, contentType });
  if (error) {
    console.error('Upload error for', filename, ':', error.message);
    throw error;
  }
  console.log('Uploaded:', storagePath);
  return storagePath;
}

// Read all output files from the output directory (text only — skip binary)
function readOutputFiles() {
  if (!fs.existsSync(OUTPUT_PATH)) return {};
  const binaryExts = new Set(['pdf', 'png', 'jpg', 'jpeg', 'gif', 'zip', 'tar', 'gz']);
  const result = {};
  const files = fs.readdirSync(OUTPUT_PATH);
  for (const file of files) {
    const ext = file.split('.').pop().toLowerCase();
    if (binaryExts.has(ext)) {
      console.log('Skipping binary file:', file);
      continue;
    }
    const filePath = path.join(OUTPUT_PATH, file);
    const stat = fs.statSync(filePath);
    if (stat.isFile()) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        try {
          result[file] = JSON.parse(content);
        } catch {
          result[file] = content;
        }
      } catch {
        console.log('Skipping unreadable file:', file);
      }
    }
  }
  return result;
}

function asRecordOrNull(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function buildReviewPhaseOutputData(allFiles) {
  return {
    corrections_letter_md: allFiles['draft_corrections.md'] || null,
    review_checklist_json: allFiles['draft_corrections.json'] || allFiles['review_summary.json'] || null,
    project_understanding_json: asRecordOrNull(allFiles['project_understanding.json']),
  };
}

function buildAnalysisPhaseOutputData(allFiles) {
  return {
    corrections_analysis_json: allFiles['corrections_categorized.json'] || null,
    applicant_questions_json: allFiles['applicant_questions.json'] || allFiles['contractor_questions.json'] || null,
    project_understanding_json: asRecordOrNull(allFiles['project_understanding.json']),
  };
}

function buildResponsePhaseOutputData(allFiles) {
  return {
    response_letter_md: allFiles['response_letter.md'] || null,
    professional_scope_md: allFiles['professional_scope.md'] || null,
    corrections_report_md: allFiles['corrections_report.md'] || null,
    sheet_annotations_json: allFiles['sheet_annotations.json'] || null,
    project_understanding_json: asRecordOrNull(allFiles['project_understanding.json']),
  };
}

async function runClaudePrompt(promptText, maxTurnsOverride = ${budget.maxTurns}) {
  const result = await query({
    prompt: promptText,
    options: {
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      maxTurns: maxTurnsOverride,
      maxBudgetUsd: ${budget.maxBudgetUsd},
      tools: { type: 'preset', preset: 'claude_code' },
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: ${JSON.stringify(systemAppend)},
      },
      settingSources: ['project'],
      cwd: '/vercel/sandbox',
      model: '${CONFIG.MODEL}',
    },
  });

  let finalResult = null;
  for await (const message of result) {
    if (message.type === 'assistant') {
      const content = message.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && block.text) {
            const text = block.text.length > 200 ? block.text.substring(0, 200) + '...' : block.text;
            console.log('Assistant:', text);
            logMessage('assistant', text);
          } else if (block.type === 'tool_use') {
            console.log('Tool:', block.name);
            logMessage('tool', block.name);
          }
        }
      }
    } else if (message.type === 'result') {
      finalResult = message;
      console.log('Result:', message.subtype);
      console.log('Turns:', message.num_turns);
      console.log('Cost: $' + (message.total_cost_usd || 0).toFixed(4));
      logMessage('system', 'Completed in ' + message.num_turns + ' turns, cost: $' + (message.total_cost_usd || 0).toFixed(4));
    }
  }

  return finalResult;
}

async function ensureProjectUnderstanding(flowPhase) {
  let allFiles = readOutputFiles();
  let normalized = asRecordOrNull(allFiles['project_understanding.json']);

  if (flowPhase === 'response') {
    return { allFiles, normalized };
  }

  if (normalized) {
    return { allFiles, normalized };
  }

  logMessage('system', 'project_understanding.json missing or invalid; attempting one repair pass');
  const repairPrompt = [
    'Repair the output directory by writing a valid project_understanding.json.',
    'Do not redo the full review.',
    'Read the existing artifacts already on disk, especially sheet-manifest.json and any page-text.json available in project-files/.',
    'Produce exactly one valid project_understanding.json that includes document_profile, project_summary, building_program, site_and_mass, key_tables_and_legends, discipline_coverage, evidence_index, open_questions, and understanding_status.',
    'Every high-impact statement must cite evidence via evidence_index and carry confidence high/medium/low.',
  ].join('\\n');
  await runClaudePrompt(repairPrompt, 80);

  allFiles = readOutputFiles();
  normalized = asRecordOrNull(allFiles['project_understanding.json']);
  if (!normalized) {
    throw new Error('project_understanding.json missing or invalid after repair pass');
  }

  return { allFiles, normalized };
}

// Create output record with auto-incrementing version
async function createOutputRecord(data) {
  // Get max version for this project+flow_phase
  const { data: existing } = await supabase
    .schema('crossbeam')
    .from('outputs')
    .select('version')
    .eq('project_id', projectId)
    .eq('flow_phase', '${flowPhase}')
    .order('version', { ascending: false })
    .limit(1);
  const nextVersion = (existing?.[0]?.version || 0) + 1;

  const { data: inserted, error } = await supabase
    .schema('crossbeam')
    .from('outputs')
    .insert({
      project_id: projectId,
      flow_phase: '${flowPhase}',
      version: nextVersion,
      ...data,
    })
    .select('id')
    .single();
  if (error) {
    console.error('Failed to create output record:', error.message);
    throw error;
  }
  console.log('Output record created (version ' + nextVersion + ', id: ' + inserted.id + ')');
  return inserted.id;
}

// Insert applicant questions into applicant_answers table
async function insertApplicantQuestions(questions, outputId = null) {
  if (!questions || !Array.isArray(questions)) {
    console.log('No applicant questions to insert');
    return;
  }

  // Clear old unanswered questions before inserting new ones
  const { error: deleteError } = await supabase
    .schema('crossbeam')
    .from('applicant_answers')
    .delete()
    .eq('project_id', projectId)
    .eq('is_answered', false);
  if (deleteError) {
    console.error('Failed to delete old unanswered questions:', deleteError.message);
  }

  const rows = questions.map(q => ({
    project_id: projectId,
    question_key: q.question_id || q.key || q.question_key || q.id || 'q_' + Math.random().toString(36).slice(2),
    question_text: q.context || q.question || q.question_text || q.text || '',
    question_type: q.options ? 'select' : (q.type || 'text'),
    options: q.options ? (typeof q.options === 'string' ? q.options : JSON.stringify(q.options)) : null,
    context: q.context || q.why || null,
    correction_item_id: q.correction_item_id || q.item_id || null,
    is_answered: false,
    output_id: outputId,
  }));

  const { error } = await supabase
    .schema('crossbeam')
    .from('applicant_answers')
    .insert(rows);

  if (error) {
    console.error('Failed to insert applicant questions:', error.message);
    throw error;
  }
  console.log('Inserted', rows.length, 'applicant questions');
}

// Update project status
async function updateProjectStatus(status, errorMessage = null) {
  const updateData = { status, updated_at: new Date().toISOString() };
  if (errorMessage) updateData.error_message = errorMessage;
  const { error } = await supabase
    .schema('crossbeam')
    .from('projects')
    .update(updateData)
    .eq('id', projectId);
  if (error) {
    console.error('Failed to update project status:', error.message);
    throw error;
  }
  console.log('Project status updated to:', status);
}

async function runAgent() {
  console.log('Agent starting...');
  logMessage('system', 'Agent starting...');

  const startTime = Date.now();

  try {
    const finalResult = await runClaudePrompt(PROMPT_PLACEHOLDER, ${budget.maxTurns});

    logMessage('system', 'Processing outputs...');

    const flowPhase = '${flowPhase}';
    const { allFiles, normalized } = await ensureProjectUnderstanding(flowPhase);
    console.log('Found output files:', Object.keys(allFiles));

    const outputData = {
      raw_artifacts: allFiles,
      agent_cost_usd: finalResult?.total_cost_usd || 0,
      agent_turns: finalResult?.num_turns || 0,
      agent_duration_ms: Date.now() - startTime,
    };

    if (normalized) {
      outputData.project_understanding_json = normalized;
      outputData.raw_artifacts['project_understanding.json'] = normalized;
    }

    if (flowPhase === 'review') {
      Object.assign(outputData, buildReviewPhaseOutputData(allFiles));
      if (fs.existsSync(path.join(OUTPUT_PATH, 'corrections_letter.pdf'))) {
        const pdfContent = fs.readFileSync(path.join(OUTPUT_PATH, 'corrections_letter.pdf'));
        outputData.corrections_letter_pdf_path = await uploadFile('corrections_letter.pdf', pdfContent);
      }
    } else if (flowPhase === 'analysis') {
      Object.assign(outputData, buildAnalysisPhaseOutputData(allFiles));
    } else if (flowPhase === 'response') {
      Object.assign(outputData, buildResponsePhaseOutputData(allFiles));
      if (fs.existsSync(path.join(OUTPUT_PATH, 'response_letter.pdf'))) {
        const pdfContent = fs.readFileSync(path.join(OUTPUT_PATH, 'response_letter.pdf'));
        outputData.response_letter_pdf_path = await uploadFile('response_letter.pdf', pdfContent);
      }
    }

    // Create output record
    const outputRecordId = await createOutputRecord(outputData);

    // Insert applicant questions linked to this output version
	    if (flowPhase === 'analysis' && outputData.applicant_questions_json) {
	      const questions = outputData.applicant_questions_json;
      let questionsList = [];
      if (Array.isArray(questions)) {
        questionsList = questions;
      } else if (questions.question_groups && Array.isArray(questions.question_groups)) {
        for (const group of questions.question_groups) {
          if (group.questions && Array.isArray(group.questions)) {
            questionsList.push(...group.questions);
          }
        }
      } else if (questions.questions && Array.isArray(questions.questions)) {
        questionsList = questions.questions;
      }
      if (questionsList.length > 0) {
        await insertApplicantQuestions(questionsList, outputRecordId);
      } else {
        console.log('No applicant questions found in any known format');
      }
    }

    // Update project status
    await updateProjectStatus('${completedStatus}');
    logMessage('system', 'Processing complete');

    // Output result JSON for server-side parsing
    console.log('\\n__RESULT_JSON__');
    console.log(JSON.stringify({
      success: finalResult?.subtype === 'success',
      cost: finalResult?.total_cost_usd || 0,
      turns: finalResult?.num_turns || 0,
      duration: finalResult?.duration_ms || 0,
      uploadedInSandbox: true,
    }));

    await new Promise(resolve => setTimeout(resolve, 500));

  } catch (error) {
    console.error('Agent error:', error);
    logMessage('system', 'Agent error: ' + error.message);
    try {
      await updateProjectStatus('failed', error.message);
    } catch (statusErr) {
      console.error('Failed to update status:', statusErr.message);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    process.exit(1);
  }
}

runAgent();
`;

  // Inject the server-built prompt into the sandbox runner script.
  const finalScript = agentScript.replace(
    'runClaudePrompt(PROMPT_PLACEHOLDER,',
    `runClaudePrompt(${JSON.stringify(prompt)},`,
  );

  if (finalScript.includes('PROMPT_PLACEHOLDER')) {
    throw new Error('Sandbox agent script prompt injection failed');
  }

  await sandbox.writeFiles([
    { path: '/vercel/sandbox/agent.mjs', content: Buffer.from(finalScript) },
  ]);

  console.log('Running agent in detached mode...');
  const cmd = await sandbox.runCommand({
    cmd: 'node',
    args: ['agent.mjs'],
    env: { ANTHROPIC_API_KEY: apiKey },
    detached: true,
  });
  console.log(`Agent command started: ${cmd.cmdId}`);

  // Resilient wait loop — detached commands survive connection drops
  let attempts = 0;
  const MAX_WAIT_ATTEMPTS = 120; // 120 * 30s = 60 min max
  while (true) {
    try {
      console.log(`Waiting for agent completion (attempt ${attempts + 1})...`);
      const finished = await cmd.wait();
      console.log(`Agent finished with exit code: ${finished.exitCode}`);
      return { exitCode: finished.exitCode };
    } catch (err: unknown) {
      attempts++;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(`Wait attempt ${attempts} failed: ${errMsg}`);

      if (attempts >= MAX_WAIT_ATTEMPTS) {
        throw new Error(`Agent wait failed after ${attempts} attempts: ${errMsg}`);
      }

      // Check if sandbox is still alive before retrying
      try {
        const sandboxStatus = sandbox.status;
        console.log(`Sandbox status: ${sandboxStatus}`);
        if (sandboxStatus !== 'running') {
          throw new Error(`Sandbox is no longer running (status: ${sandboxStatus})`);
        }
      } catch (statusErr: unknown) {
        const statusMsg = statusErr instanceof Error ? statusErr.message : String(statusErr);
        console.log(`Could not check sandbox status: ${statusMsg}`);
      }

      // Wait before retrying
      console.log('Retrying wait in 30 seconds...');
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  }
}

// --- Main Export ---

export async function runCrossBeamFlow(options: RunFlowOptions): Promise<void> {
  let sandbox: Sandbox | null = null;

  try {
    // 1. Create sandbox
    sandbox = await createSandbox();
    await insertMessage(options.projectId, 'system', '[SANDBOX 1/7] Sandbox created');

    // 2. Install dependencies (no system packages — extraction happens on Cloud Run)
    await installDependencies(sandbox, options.projectId);
    await insertMessage(options.projectId, 'system', '[SANDBOX 2/7] Dependencies installed');

    // 3. Download project files (includes pre-extracted .tar.gz archives)
    await downloadFilesInSandbox(
      sandbox,
      options.files,
      options.supabaseUrl,
      options.supabaseKey,
    );
    await insertMessage(options.projectId, 'system', `[SANDBOX 3/7] Downloaded ${options.files.length} files`);

    // 4. Unpack any .tar.gz archives (PNGs from Cloud Run extraction or demo pre-builds)
    await unpackArchivesInSandbox(sandbox, options.projectId);
    await insertMessage(options.projectId, 'system', '[SANDBOX 4/7] Archives unpacked');

    // 5. Copy skills (dynamic based on flow type + city)
    const skillNames = getFlowSkills(options.flowType, options.city);
    await copySkillsToSandbox(sandbox, skillNames);
    await insertMessage(options.projectId, 'system', `[SANDBOX 5/7] Skills copied (${skillNames.length} skills: ${skillNames.join(', ')})`);

    // 5.5 Pre-inject sheet manifest when deterministic extraction or a demo fixture provides one.
    if (options.flowType === 'city-review' || options.flowType === 'corrections-analysis') {
      const manifestFixture = getPreloadedManifest(options.city);
      const deterministicManifestLoaded = await preloadDeterministicArtifacts(
        sandbox,
        options.flowType,
        options.projectId,
      );
      if (!deterministicManifestLoaded && manifestFixture) {
        await sandbox.runCommand({ cmd: 'mkdir', args: ['-p', SANDBOX_OUTPUT_PATH] });
        const manifestPath = path.join(__dirname, `../../fixtures/${manifestFixture}`);
        const manifestContent = fs.readFileSync(manifestPath);
        await sandbox.writeFiles([{
          path: `${SANDBOX_OUTPUT_PATH}/sheet-manifest.json`,
          content: manifestContent,
        }]);
        await insertMessage(options.projectId, 'system', `[SANDBOX 5.5/7] Sheet manifest pre-loaded (${manifestFixture})`);
      }
    }

    // 6. For corrections-response: write Phase 1 artifacts + answers into sandbox
    if (options.flowType === 'corrections-response' && options.phase1Artifacts && options.contractorAnswersJson) {
      await writePhase1Artifacts(sandbox, options.phase1Artifacts, options.contractorAnswersJson);
      await insertMessage(options.projectId, 'system', '[SANDBOX 6/7] Phase 1 artifacts loaded');
    } else {
      await insertMessage(options.projectId, 'system', '[SANDBOX 6/7] Setup complete');
    }

    // 7. Run agent
    const flowLabel = options.flowType === 'city-review' ? 'plan review'
      : options.flowType === 'corrections-analysis' ? 'corrections analysis'
      : 'response generation';
    await insertMessage(options.projectId, 'system', `[SANDBOX 7/7] Launching ${flowLabel} agent...`);

    await insertMessage(options.projectId, 'system', 'Agent running in detached mode (connection-resilient)');
    const result = await runAgent(sandbox, {
      apiKey: options.apiKey,
      projectId: options.projectId,
      userId: options.userId,
      supabaseUrl: options.supabaseUrl,
      supabaseKey: options.supabaseKey,
      flowType: options.flowType,
      city: options.city,
      address: options.address,
      contractorAnswersJson: options.contractorAnswersJson,
      preExtracted: true, // PNGs are always pre-extracted now (demo or not)
    });

    console.log(`Agent completed with exit code: ${result.exitCode}`);
    if (result.exitCode !== 0) {
      throw new Error(`Agent failed inside sandbox with exit code ${result.exitCode}`);
    }

  } finally {
    if (sandbox) {
      console.log('Stopping sandbox...');
      await sandbox.stop();
    }
  }
}
