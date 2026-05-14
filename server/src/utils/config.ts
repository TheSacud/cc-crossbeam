import ms from 'ms';

// --- Sandbox & Agent Defaults ---

function parseDuration(value: string): number {
  const parsed = ms(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid SANDBOX_TIMEOUT duration: ${value}`);
  }
  return parsed;
}

const configuredSandboxTimeout = parseDuration(process.env.SANDBOX_TIMEOUT || '45m');

export const CONFIG = {
  SANDBOX_TIMEOUT: configuredSandboxTimeout,
  SANDBOX_VCPUS: 4,
  RUNTIME: 'node22' as const,
  MODEL: 'claude-opus-4-6',
};

export const SKIP_FILES = ['.DS_Store', 'Thumbs.db', '.gitkeep'];

// --- Paths inside the Vercel Sandbox ---

export const SANDBOX_FILES_PATH = '/vercel/sandbox/project-files';
export const SANDBOX_OUTPUT_PATH = '/vercel/sandbox/project-files/output';
export const SANDBOX_SKILLS_BASE = '/vercel/sandbox/.claude/skills';
export const VISEU_OPERATIONAL_INDEX_PATH = `${SANDBOX_SKILLS_BASE}/viseu-municipal-regulations/references/viseu-operational-index.json`;
export const VISEU_CORPUS_MANIFEST_PATH = `${SANDBOX_SKILLS_BASE}/viseu-municipal-regulations/references/official-corpus.manifest.json`;
export const FUTURE_PORTUGAL_MUNICIPAL_RESEARCH_PATH = `${SANDBOX_SKILLS_BASE}/portugal-municipal-research`;

// --- Flow Types ---

export type InternalFlowType = 'city-review' | 'corrections-analysis' | 'corrections-response';
export type JurisdictionKey = 'viseu-urbanism';

interface JurisdictionProfile {
  label: string;
  baseSkill: string;
  reviewSkill: string;
  correctionsSkill: string;
  responseSkill: string;
}

interface CityProfile {
  jurisdiction: JurisdictionKey;
  skillName: string;
  preloadedManifest?: string;
}

// --- Budget per Flow ---

export const FLOW_BUDGET: Record<InternalFlowType, { maxTurns: number; maxBudgetUsd: number }> = {
  'city-review': { maxTurns: 180, maxBudgetUsd: 25.0 },
  'corrections-analysis': { maxTurns: 180, maxBudgetUsd: 25.0 },
  'corrections-response': { maxTurns: 60, maxBudgetUsd: 6.0 },
};

export const JURISDICTION_PROFILES: Record<JurisdictionKey, JurisdictionProfile> = {
  'viseu-urbanism': {
    label: 'Viseu Urbanism',
    baseSkill: 'portugal-urban-planning',
    reviewSkill: 'viseu-plan-review',
    correctionsSkill: 'viseu-corrections-flow',
    responseSkill: 'viseu-corrections-complete',
  },
};

export const ONBOARDED_CITIES: Record<string, CityProfile> = {
  viseu: {
    jurisdiction: 'viseu-urbanism',
    skillName: 'viseu-municipal-regulations',
  },
};

export const ACTIVE_RUNTIME_CITY = 'Viseu';
export const ACTIVE_RUNTIME_CITY_SLUG = 'viseu';

export const VISEU_REVIEW_GROUPS = [
  'arquitetura-urbanismo',
  'especialidades',
  'acessibilidades-seguranca',
  'instrucao-administrativa',
  'legalizacao',
] as const;

export const VISEU_FINDING_CATEGORIES = [
  'MISSING_DOCUMENT',
  'MISSING_DRAWING_OR_ELEMENT',
  'REGULATORY_NON_COMPLIANCE',
  'MUNICIPAL_PROCEDURE_MISMATCH',
  'NEEDS_SPECIALTY_INPUT',
  'NEEDS_APPLICANT_INPUT',
  'LEGALIZATION_GAP',
  'SOURCE_NEEDED',
] as const;

export const VISEU_SOURCE_SCOPES = [
  'national',
  'municipal-viseu',
  'procedure-instruction',
] as const;

export const VISEU_EVIDENCE_STATUSES = [
  'confirmed',
  'missing-from-submission',
  'depends-on-pdmv',
  'needs-human-validation',
  'source-needed',
] as const;

const VISEU_REVIEW_GROUP_LINES = VISEU_REVIEW_GROUPS.map((group) => `- ${group}`).join('\n');
const VISEU_FINDING_CATEGORY_LINES = VISEU_FINDING_CATEGORIES.map((category) => `- ${category}`).join('\n');
const VISEU_SOURCE_SCOPE_LINES = VISEU_SOURCE_SCOPES.map((scope) => `- ${scope}`).join('\n');
const VISEU_EVIDENCE_STATUS_LINES = VISEU_EVIDENCE_STATUSES.map((status) => `- ${status}`).join('\n');

// --- City helpers ---

export function citySlug(city: string): string {
  return city.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export function getCityProfile(city: string): CityProfile | null {
  return ONBOARDED_CITIES[citySlug(city)] ?? null;
}

export function getJurisdictionKey(_city: string): JurisdictionKey {
  return 'viseu-urbanism';
}

export function getJurisdictionProfile(city: string): JurisdictionProfile {
  return JURISDICTION_PROFILES[getJurisdictionKey(city)];
}

export function isCityOnboarded(city: string): boolean {
  return citySlug(city) in ONBOARDED_CITIES;
}

export function getCitySkillName(city: string): string | null {
  return getCityProfile(city)?.skillName ?? null;
}

export function getPreloadedManifest(city: string): string | null {
  return getCityProfile(city)?.preloadedManifest ?? null;
}

export function isSupportedRuntimeCity(city: string | null | undefined): boolean {
  return citySlug(city ?? '') === ACTIVE_RUNTIME_CITY_SLUG;
}

export function getUnsupportedCityMessage(city: string | null | undefined): string {
  const displayCity = city?.trim() ? city : 'Unknown';
  return `Unsupported city: only ${ACTIVE_RUNTIME_CITY} is enabled in this runtime (received: ${displayCity})`;
}

export function assertSupportedRuntimeCity(city: string | null | undefined): asserts city is string {
  if (!isSupportedRuntimeCity(city)) {
    throw new Error(getUnsupportedCityMessage(city));
  }
}

// --- Skills per Flow ---

export function getFlowSkills(flowType: InternalFlowType, city: string): string[] {
  assertSupportedRuntimeCity(city);
  const jurisdiction = getJurisdictionProfile(city);
  const citySkill = getCitySkillName(city);
  const skills = [
    jurisdiction.baseSkill,
    flowType === 'city-review'
      ? jurisdiction.reviewSkill
      : flowType === 'corrections-analysis'
        ? jurisdiction.correctionsSkill
        : jurisdiction.responseSkill,
  ];

  if (flowType === 'corrections-response') {
    skills.push('viseu-corrections-pdf');
  }

  if (flowType !== 'corrections-response') {
    skills.push('adu-targeted-page-viewer');
  }

  if (citySkill) {
    skills.push(citySkill);
  }

  return skills;
}

// --- Prompt Builders ---

function buildPreExtractedNotice(preExtracted?: boolean): string {
  if (!preExtracted) return '';

  return `
PRE-EXTRACTED DATA:
- Page PNGs are ALREADY extracted at full DPI in ${SANDBOX_FILES_PATH}/pages-png/
- Title block crops are ALREADY in ${SANDBOX_FILES_PATH}/title-blocks/
- Native PDF text, when available, is already in ${SANDBOX_FILES_PATH}/page-text.json
- OCR text from title block crops may be available in ${SANDBOX_FILES_PATH}/title-block-text.json
- Text extracted from every submitted PDF, including supporting documents, may be available in ${SANDBOX_FILES_PATH}/document-text.json
- A deterministic preliminary sheet manifest may already be loaded at ${SANDBOX_OUTPUT_PATH}/sheet-manifest.json
- Preflight extraction metadata may be available at ${SANDBOX_FILES_PATH}/preflight-summary.json
- If ${SANDBOX_OUTPUT_PATH}/sheet-manifest.json is absent but ${SANDBOX_FILES_PATH}/sheet-manifest.json exists, treat the latter as a machine-generated hint and verify it against title-block-text.json plus page images/title blocks before writing the authoritative manifest.
- Do NOT run extract-pages.sh or crop-title-blocks.sh - they are already done.
- Go straight to reading the cover sheet and building the sheet manifest.
`;
}

function buildViseuOperationalPrompt(
  flowType: InternalFlowType,
  city: string,
  address?: string,
  contractorAnswersJson?: string,
  preExtracted?: boolean,
): string {
  const addressLine = address ? `LOCAL/IMOVEL: ${address}` : '';
  const preExtractedNotice = buildPreExtractedNotice(preExtracted);

  if (flowType === 'city-review') {
    return `You are the ORCHESTRATOR for a municipal urban licensing review for ${city}, Portugal.

PROJECT FILES: ${SANDBOX_FILES_PATH}/
OUTPUT DIRECTORY: ${SANDBOX_OUTPUT_PATH}/
MUNICIPALITY: ${city}
${addressLine}
${preExtractedNotice}

AVAILABLE SOURCES:
- portugal-urban-planning: national legal and process context
- viseu-plan-review: review workflow and checklist taxonomy for municipal screening
- viseu-municipal-regulations: municipality-specific references and official source registry
- page-viewer skill: page extraction and targeted plan reading
- Operational index: ${VISEU_OPERATIONAL_INDEX_PATH}
- Validated corpus manifest: ${VISEU_CORPUS_MANIFEST_PATH}
- Reserved namespace for future PT municipal live research: ${FUTURE_PORTUGAL_MUNICIPAL_RESEARCH_PATH}

YOUR JOB:
- Coordinate subagents; do NOT read full-size plan images in the main context.
- The server has already validated the mandatory Viseu corpus before this run started.
- Use ONLY municipal/PDMV/NIP requirements whose verification_status is official_verified in the loaded corpus.
- Treat any municipal topic outside the validated corpus as out of scope instead of inventing a rule.
- Separate each finding into one source scope: national, municipal-viseu, or procedure-instruction.
- Separate confirmed violations from documental gaps, source-needed items, and inconclusive items.
- If legal basis or project evidence is insufficient, do NOT state a confirmed violation.

REVIEW GROUPS:
${VISEU_REVIEW_GROUP_LINES}

REQUIRED METADATA FOR EVERY JSON ITEM:
- process_type
- review_area
- finding_category
- source_scope
- source_doc
- article_or_section
- source_reference
- verification_status
- evidence_status
- evidence_refs[] when the finding depends on any project fact, drawing condition, declared area, typology, implantation, parking, scale, table, or missing sheet/document evidence
- Optional for visually grounded findings: sheet_refs[] with page/desenho/title/page_png_path/title_block_png_path/visual_note
- Add determination_status using one of: confirmed_non_compliance, document_missing_or_incomplete, needs_official_source, inconclusive

ALLOWED finding_category values:
${VISEU_FINDING_CATEGORY_LINES}

ALLOWED source_scope values:
${VISEU_SOURCE_SCOPE_LINES}

ALLOWED evidence_status values:
${VISEU_EVIDENCE_STATUS_LINES}

PHASE 1 - Manifest:
- Reuse ${SANDBOX_OUTPUT_PATH}/sheet-manifest.json when present.
- Otherwise build it from the cover sheet and title blocks.
- If only ${SANDBOX_FILES_PATH}/sheet-manifest.json exists, use it as a machine-generated hint, not as final ground truth; verify it against ${SANDBOX_FILES_PATH}/title-block-text.json plus page images/title blocks and write a corrected authoritative manifest to ${SANDBOX_OUTPUT_PATH}/sheet-manifest.json.
- Use ${SANDBOX_FILES_PATH}/document-text.json to ground facts from supporting PDFs such as PIP approvals, descriptive memoranda, notices, advertisements, and other non-plan-binder documents.

PHASE 1.5 - Project Understanding:
- Write ${SANDBOX_OUTPUT_PATH}/project_understanding.json before discipline review.
- Ground every high-impact statement with evidence_index entries sourced from sheet-manifest.json and, when useful, ${SANDBOX_FILES_PATH}/page-text.json.
- Use confidence high/medium/low on all summary claims.
- For every numeric/area/distance/slope/count value, include value_type using one of: declared, cotated, measured_estimate, inferred, unknown.
- Set usable_for_compliance=true only for declared or cotated values; measured_estimate, inferred, and unknown values are advisory only.
- When a claim depends on a specific visual region, add crop_box to its evidence_index entry using page PNG pixel coordinates or percentage coordinates; the server will generate the actual crop image.

PHASE 2 - Discipline Review:
- arquitetura-urbanismo -> ${SANDBOX_OUTPUT_PATH}/findings-arquitetura-urbanismo.json
- especialidades -> ${SANDBOX_OUTPUT_PATH}/findings-especialidades.json
- acessibilidades-seguranca -> ${SANDBOX_OUTPUT_PATH}/findings-acessibilidades-seguranca.json
- instrucao-administrativa -> ${SANDBOX_OUTPUT_PATH}/findings-instrucao-administrativa.json
- legalizacao -> ${SANDBOX_OUTPUT_PATH}/findings-legalizacao.json when the dossier or notice exposes legalization issues

PHASE 3 - Compliance Cross-Check:
- National/legal cross-check -> ${SANDBOX_OUTPUT_PATH}/national_compliance.json
- Municipal/procedural cross-check -> ${SANDBOX_OUTPUT_PATH}/municipal_compliance.json

PHASE 4 - Merge & Draft:
- ${SANDBOX_OUTPUT_PATH}/draft_corrections.json
- ${SANDBOX_OUTPUT_PATH}/draft_corrections.md
- ${SANDBOX_OUTPUT_PATH}/review_summary.json
- validation_report.json is generated by the server post-processor; do not hand-author it unless explicitly repairing validation artifacts.
- Prefer the canonical Viseu checklist shape in draft_corrections.json with: schema_version, review_outcome, total_findings, blocking_issues, source_needed_items, depends_on_pdmv_items, additional_corrections, review_outcome_rationale.
- Each blocking_issue should include: title, description, priority, source_scope, source_findings, optional visual_note_summary, and 1-3 sheet_refs when grounded.
- Each blocking_issue should include evidence_refs[] copied from its supporting findings when project evidence is involved.
- Each sheet_ref should include: page, desenho, title, page_png_path, title_block_png_path, visual_note.
- Promote an item to blocking_issue only when it has both legal support and concrete project evidence; otherwise keep it outside blockers.

CRITICAL RULES:
- For parking, soil class/category, PDMV constraints, and current NIP packaging, do NOT use SOURCE_NEEDED or depends-on-pdmv. Those topics are pre-validated and must cite official_verified corpus sources.
- Keep SOURCE_NEEDED and depends-on-pdmv only for municipal topics outside the validated corpus.
- Never invent sheet/page mappings. Use sheet-manifest.json as the only ground truth for page, desenho, title, and title-block paths.
- project_understanding.json is mandatory and must exist before Phase 2 findings or Phase 4 merge.
- Every project-dependent finding must cite project_understanding.json evidence_index ids in evidence_refs; legal source citations alone are not project evidence.
- The server will demote project-dependent findings without valid evidence_refs to inconclusive, even if evidence_status says confirmed.
- Do not present inferred measurements as facts. Use only declared/cotated values with evidence_refs, or mark the item inconclusive / needs-human-validation.
- Missing support is not a confirmed violation; classify it as inconclusive or needs_official_source.
- Finish only when all required files exist.`;
  }

  if (flowType === 'corrections-analysis') {
    return `You are analyzing municipal corrections for an urban licensing process in ${city}, Portugal.

PROJECT FILES: ${SANDBOX_FILES_PATH}/
OUTPUT DIRECTORY: ${SANDBOX_OUTPUT_PATH}/
MUNICIPALITY: ${city}
${addressLine}
${preExtractedNotice}

AVAILABLE SOURCES:
- portugal-urban-planning
- viseu-corrections-flow
- viseu-municipal-regulations
- page-viewer skill
- Operational index: ${VISEU_OPERATIONAL_INDEX_PATH}
- Validated corpus manifest: ${VISEU_CORPUS_MANIFEST_PATH}
- Reserved namespace for future PT municipal live research: ${FUTURE_PORTUGAL_MUNICIPAL_RESEARCH_PATH}

OBJECTIVE:
1. Read the municipal correction notice or dispatch.
2. Reuse or build the sheet manifest.
3. Write project_understanding.json.
4. Cross-check each item against national, municipal, and procedural sources.
5. Categorize each item with the Viseu taxonomy and required metadata.
6. Generate clarification questions for the requerente / project team.

MANIFEST AND TEXT INPUTS:
- Reuse ${SANDBOX_OUTPUT_PATH}/sheet-manifest.json when present.
- If only ${SANDBOX_FILES_PATH}/sheet-manifest.json exists, use it as a machine-generated hint, not as final ground truth; verify it against ${SANDBOX_FILES_PATH}/title-block-text.json plus page images/title blocks and write a corrected authoritative manifest to ${SANDBOX_OUTPUT_PATH}/sheet-manifest.json.
- Use ${SANDBOX_FILES_PATH}/document-text.json to ground facts from supporting PDFs such as correction notices, PIP approvals, descriptive memoranda, advertisements, and other non-plan-binder documents.

The server has already validated the mandatory Viseu corpus for this run.
Use only official_verified municipal/PDMV/NIP sources for the mandatory Viseu topics.
Do not reopen those topics as SOURCE_NEEDED or depends-on-pdmv.
Separate confirmed violations from documental gaps, source-needed items, and inconclusive items.

REQUIRED METADATA FOR EVERY JSON ITEM:
- process_type
- review_area
- finding_category
- source_scope
- source_doc
- article_or_section
- source_reference
- verification_status
- evidence_status
- evidence_refs[] when the item depends on project facts, drawing content, declared values, missing sheets/documents, typology, parking, implantation, scale, or area tables
- Optional for visually grounded findings: sheet_refs[] with page/desenho/title/page_png_path/title_block_png_path/visual_note
- determination_status using one of: confirmed_non_compliance, document_missing_or_incomplete, needs_official_source, inconclusive

Use only these finding categories:
${VISEU_FINDING_CATEGORY_LINES}

Use only these source scopes:
${VISEU_SOURCE_SCOPE_LINES}

Do NOT generate the final response package in this phase.
validation_report.json is generated by the server post-processor; focus on producing well-grounded source artifacts.
If legal basis or project evidence is insufficient, do NOT state a confirmed violation.
project_understanding.json is mandatory and should ground program, typology, implantation, parking, legends, and area tables before categorization.
Numeric, area, distance, slope, and count values in project_understanding.json must carry value_type and usable_for_compliance.
When a finding depends on a specific visual region, its project_understanding evidence entry should include crop_box so the server can create a real preview crop.
When a finding is likely to support a blocking issue, preserve the relevant sheet/page reference from sheet-manifest.json.
Every project-dependent finding must cite one or more project_understanding.json evidence_index ids in evidence_refs. Do not use source_reference as a substitute for project evidence.
The server will demote project-dependent findings without valid evidence_refs to inconclusive, even if evidence_status says confirmed.
Never invent measurements or cite visual impressions as measured values. If a distance, area, slope, or count is not declared/cotated in the submitted documents, mark it inconclusive or ask a clarification question.
Write clarification prompts to applicant_questions.json. If you need backward compatibility with older artifacts, contractor_questions.json may also be present, but applicant_questions.json is canonical.`;
  }

  return `You have a session directory with analysis artifacts for a municipal licensing process in ${city}, Portugal.

PROJECT FILES: ${SANDBOX_FILES_PATH}/
OUTPUT DIRECTORY: ${SANDBOX_OUTPUT_PATH}/
MUNICIPALITY: ${city}
${addressLine}

The output directory contains the analysis artifacts plus clarification answers from the requerente / project team.
Use project_understanding.json whenever response scoping depends on program, typology, implantation, parking, or area schedules.

${contractorAnswersJson ? `ANSWER SET (also written to applicant_answers.json):
${contractorAnswersJson}` : ''}

Use the viseu-corrections-complete skill to generate:
1. response_letter.md - formal reply to the municipality
2. professional_scope.md - work split by discipline and responsible party
3. corrections_report.md - status table for each correction item
4. sheet_annotations.json - per-sheet change list
Use the viseu-corrections-pdf skill only as a formatting contract for the derived PDF artifact.

Rules:
- Cite official sources wherever available.
- Mark assumptions explicitly.
- Preserve source_scope, source_doc, article_or_section, source_reference, and verification_status traceability for every correction item you address.
- Treat response_letter.md as the authored source document; response_letter.pdf is a server-rendered derivative created after this run.
- Do not author a second letter variant for PDF output.
- Keep the rest of the artifact contract unchanged when response_letter.pdf is added alongside response_letter.md.`;
}

export function buildPrompt(
  flowType: InternalFlowType,
  city: string,
  address?: string,
  contractorAnswersJson?: string,
  preExtracted?: boolean,
): string {
  assertSupportedRuntimeCity(city);
  return buildViseuOperationalPrompt(flowType, city, address, contractorAnswersJson, preExtracted);
}

// --- System Prompt Appends ---

export const VISEU_CITY_REVIEW_SYSTEM_APPEND_V2 = `You are working on CrossBeam for Municipio de Viseu.
You are coordinating a municipal urban licensing review.

CONTEXT MANAGEMENT - MANDATORY:
- Stay in orchestrator mode in the main context.
- Use subagents for plan-page reading and discipline-specific review.
- Never invent legal or municipal requirements.
- The mandatory Viseu corpus was validated before launch; use only official_verified municipal/PDMV/NIP sources for those topics.
- Every JSON artifact item must include process_type, review_area, finding_category, source_scope, source_doc, article_or_section, source_reference, verification_status, and evidence_status.
- Every project-dependent conclusion must cite project_understanding.json evidence_index ids in evidence_refs. Legal citations are not a substitute for project evidence.
- The server will demote project-dependent conclusions without valid evidence_refs to inconclusive, even if evidence_status says confirmed.
- Never invent measurements; use declared/cotated values or mark the item inconclusive / needs-human-validation.`;

export const VISEU_CORRECTIONS_SYSTEM_APPEND_V2 = `You are working on CrossBeam for Municipio de Viseu.
Use the available skills to analyze correction notices, cross-check official sources,
and prepare a response package for an urban licensing process.

MANDATORY:
- Treat official national and municipal sources as the only authority.
- The mandatory Viseu corpus was validated before launch; use only official_verified municipal/PDMV/NIP sources for those topics.
- Mark unsupported statements as [SOURCE NEEDED] only when they are outside the validated corpus.
- Keep large image reading inside subagents.
- Use the Viseu finding categories and metadata schema exactly as instructed in the flow prompt.
- Every project-dependent conclusion must cite project_understanding.json evidence_index ids in evidence_refs. Legal citations are not a substitute for project evidence.
- The server will demote project-dependent conclusions without valid evidence_refs to inconclusive, even if evidence_status says confirmed.
- Never invent measurements; use declared/cotated values or mark the item inconclusive / needs-human-validation.`;

export const VISEU_RESPONSE_SYSTEM_APPEND_V2 = `You are working on CrossBeam for Municipio de Viseu.
Generate a formal and actionable response package for a municipal licensing process.

MANDATORY:
- Cite official sources where available.
- Make assumptions explicit.
- Keep the tone administrative and implementation-ready.
- Preserve source_scope, source_doc, article_or_section, source_reference, and verification_status traceability for every correction item you address.
- Treat response_letter.md as the single authored letter; response_letter.pdf is a rendered derivative.`;

export function getSystemAppend(flowType: InternalFlowType, _city: string): string {
  assertSupportedRuntimeCity(_city);
  switch (flowType) {
    case 'city-review':
      return VISEU_CITY_REVIEW_SYSTEM_APPEND_V2;
    case 'corrections-analysis':
      return VISEU_CORRECTIONS_SYSTEM_APPEND_V2;
    case 'corrections-response':
      return VISEU_RESPONSE_SYSTEM_APPEND_V2;
  }
}
