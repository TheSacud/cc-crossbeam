type GateStatus = 'pass' | 'warn' | 'fail';

interface QualityCheck {
  id: string;
  status: GateStatus;
  label: string;
  details?: unknown;
}

interface TopicCheck {
  id: string;
  label: string;
  status: GateStatus;
  in_blockers: boolean;
  in_additional: boolean;
  hits: number;
}

interface OutputSnapshot {
  id?: string;
  created_at?: string;
  agent_turns?: number;
  agent_cost_usd?: number;
  agent_duration_ms?: number;
  project_understanding_json?: unknown;
  review_checklist_json?: unknown;
  raw_artifacts?: unknown;
}

const MANDATORY_TOPICS: Array<{ id: string; label: string; pattern: RegExp }> = [
  { id: 'loteamento_pip', label: 'Loteamento / PIP prerequisites', pattern: /(pip|loteamento|alvar[aá])/i },
  { id: 'quadro_sinoptico', label: 'Quadro sinoptico', pattern: /quadro\s+sin[oó]ptico|sinoptico/i },
  { id: 'pdmv', label: 'PDMV ordering, constraints, or soil class', pattern: /pdmv|ordenamento|condicionantes|classe\s+.*solo|categoria\s+.*solo/i },
  { id: 'estacionamento', label: 'Parking / estacionamento', pattern: /estacionamento|parking|garagem/i },
  { id: 'scie', label: 'SCIE / fire safety', pattern: /scie|inc[eê]ndio|seguran[cç]a\s+contra\s+inc[eê]ndio|ficha\s+de\s+seguran/i },
  { id: 'implantacao_cotada', label: 'Cotated implantation / dimensions', pattern: /implanta[cç][aã]o\s+cotad|planta\s+.*cotad|cotas|afastamento|recuo/i },
  { id: 'administrative_documents', label: 'Administrative documents', pattern: /documentos?\s+administrativos?|termo|certid[aã]o|estimativa|calendariza[cç][aã]o|ficha\s+estat/i },
  { id: 'typology', label: 'Typology / T3-T4 consistency', pattern: /tipologia|t3|t4|quartos|fra[cç][aã]o/i },
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function jsonText(value: unknown): string {
  try {
    return JSON.stringify(value || {});
  } catch {
    return '';
  }
}

function countArray(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function statusFromChecks(checks: QualityCheck[]): GateStatus {
  if (checks.some((check) => check.status === 'fail')) return 'fail';
  if (checks.some((check) => check.status === 'warn')) return 'warn';
  return 'pass';
}

function scoreFromChecks(checks: QualityCheck[]): number {
  if (checks.length === 0) return 0;
  const points = checks.reduce((sum, check) => {
    if (check.status === 'pass') return sum + 1;
    if (check.status === 'warn') return sum + 0.5;
    return sum;
  }, 0);
  return Math.round((points / checks.length) * 100);
}

function getManifestMetrics(rawArtifacts: Record<string, unknown> | null) {
  const manifest = asRecord(rawArtifacts?.['sheet-manifest.json']);
  const sheets = asArray(manifest?.sheets).map((entry) => asRecord(entry)).filter(Boolean) as Array<Record<string, unknown>>;
  return {
    sheets: sheets.length,
    titles: sheets.filter((sheet) => asString(sheet.title ?? sheet.sheet_title)).length,
    desenhos: sheets.filter((sheet) => sheet.desenho != null || sheet.drawing_number != null).length,
    scales: sheets.filter((sheet) => asString(sheet.scale ?? sheet.escala)).length,
  };
}

function getReviewChecklist(snapshot: OutputSnapshot): Record<string, unknown> | null {
  return asRecord(snapshot.review_checklist_json)
    || asRecord(asRecord(snapshot.raw_artifacts)?.['draft_corrections.json']);
}

function getProjectUnderstanding(snapshot: OutputSnapshot): Record<string, unknown> | null {
  return asRecord(snapshot.project_understanding_json)
    || asRecord(asRecord(snapshot.raw_artifacts)?.['project_understanding.json']);
}

function getTotalFindings(checklist: Record<string, unknown> | null): number | null {
  const totalFindings = asRecord(checklist?.total_findings);
  return asNumber(totalFindings?.total)
    ?? asNumber(checklist?.total_findings)
    ?? asNumber(asRecord(checklist?.validation_report)?.summary && asRecord(asRecord(checklist?.validation_report)?.summary)?.total_findings);
}

function getDeterminationCounts(checklist: Record<string, unknown> | null): Record<string, number> {
  const counts = asRecord(asRecord(checklist?.total_findings)?.determination_counts);
  return {
    confirmed_non_compliance: asNumber(counts?.confirmed_non_compliance) ?? 0,
    document_missing_or_incomplete: asNumber(counts?.document_missing_or_incomplete) ?? 0,
    needs_official_source: asNumber(counts?.needs_official_source) ?? countArray(checklist?.source_needed_items),
    inconclusive: asNumber(counts?.inconclusive) ?? 0,
  };
}

function hasIssueSupport(issue: Record<string, unknown>): boolean {
  const evidenceRefs = countArray(issue.evidence_refs);
  const sheetRefs = countArray(issue.sheet_refs);
  const sourceFindings = countArray(issue.source_findings);
  return evidenceRefs > 0 || sheetRefs > 0 || sourceFindings > 0;
}

function unsupportedBlockers(checklist: Record<string, unknown> | null): unknown[] {
  return asArray(checklist?.blocking_issues).filter((entry) => {
    const issue = asRecord(entry);
    if (!issue) return true;
    return !hasIssueSupport(issue);
  });
}

function normalizeFindingText(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getFindingEntries(checklist: Record<string, unknown> | null): Array<Record<string, unknown>> {
  return [
    ...asArray(checklist?.blocking_issues),
    ...asArray(checklist?.additional_corrections),
  ].map((entry) => asRecord(entry)).filter(Boolean) as Array<Record<string, unknown>>;
}

function countDuplicateFindings(entries: Array<Record<string, unknown>>): { unique: number; duplicates: number } {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const [index, entry] of entries.entries()) {
    const title = asString(entry.title) || asString(entry.summary) || jsonText(entry);
    const key = normalizeFindingText(title) || `finding-${index}`;
    if (seen.has(key)) {
      duplicates += 1;
    } else {
      seen.add(key);
    }
  }
  return { unique: seen.size, duplicates };
}

function ratio(numerator: number, denominator: number | null): number | null {
  if (denominator == null || denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

function costPerUnit(cost: number | null, units: number): number | null {
  if (cost == null || units <= 0) return null;
  return Math.round((cost / units) * 1000) / 1000;
}

function getReviewValueMetrics(snapshot: OutputSnapshot, checklist: Record<string, unknown> | null) {
  const entries = getFindingEntries(checklist);
  const duplicateStats = countDuplicateFindings(entries);
  const totalFindings = getTotalFindings(checklist) ?? entries.length;
  const determinationCounts = getDeterminationCounts(checklist);
  const unsupported = unsupportedBlockers(checklist).length;
  const sourceNeeded = countArray(checklist?.source_needed_items);
  const dependsOnPdmv = countArray(checklist?.depends_on_pdmv_items);
  const supportedEntries = entries.filter(hasIssueSupport).length;
  const actionableFindings = determinationCounts.confirmed_non_compliance
    + determinationCounts.document_missing_or_incomplete;
  const unresolvedFindings = determinationCounts.needs_official_source
    + determinationCounts.inconclusive
    + sourceNeeded
    + dependsOnPdmv;
  const usefulFindings = Math.max(actionableFindings, supportedEntries - duplicateStats.duplicates);
  const noiseFindings = Math.max(0, unresolvedFindings + unsupported + duplicateStats.duplicates);
  const cost = asNumber(snapshot.agent_cost_usd);
  const turns = asNumber(snapshot.agent_turns);

  return {
    total_findings: totalFindings,
    issue_entries: entries.length,
    unique_issue_entries: duplicateStats.unique,
    duplicate_issue_entries: duplicateStats.duplicates,
    supported_issue_entries: supportedEntries,
    unsupported_blockers: unsupported,
    actionable_findings: actionableFindings,
    unresolved_findings: unresolvedFindings,
    useful_findings: usefulFindings,
    noise_findings: noiseFindings,
    useful_ratio: ratio(usefulFindings, totalFindings),
    noise_ratio: ratio(noiseFindings, totalFindings),
    agent_cost_usd: cost,
    cost_per_useful_finding: costPerUnit(cost, usefulFindings),
    agent_turns: turns,
    turns_per_useful_finding: costPerUnit(turns, usefulFindings),
  };
}

function topicText(checklist: Record<string, unknown> | null): string {
  return jsonText({
    blocking_issues: checklist?.blocking_issues,
    additional_corrections: checklist?.additional_corrections,
    review_outcome_rationale: checklist?.review_outcome_rationale,
    total_findings: checklist?.total_findings,
  });
}

function topicBucketText(checklist: Record<string, unknown> | null, key: 'blocking_issues' | 'additional_corrections'): string {
  return jsonText(checklist?.[key]);
}

function evaluateMandatoryTopics(checklist: Record<string, unknown> | null): TopicCheck[] {
  const allText = topicText(checklist);
  const blockerText = topicBucketText(checklist, 'blocking_issues');
  const additionalText = topicBucketText(checklist, 'additional_corrections');
  return MANDATORY_TOPICS.map((topic) => {
    const inBlockers = topic.pattern.test(blockerText);
    const inAdditional = topic.pattern.test(additionalText);
    const allMatches = allText.match(new RegExp(topic.pattern.source, topic.pattern.flags.includes('g') ? topic.pattern.flags : `${topic.pattern.flags}g`));
    return {
      id: topic.id,
      label: topic.label,
      status: inBlockers || inAdditional ? 'pass' : 'fail',
      in_blockers: inBlockers,
      in_additional: inAdditional,
      hits: allMatches?.length || 0,
    };
  });
}

export function evaluateReviewOutputQuality(snapshot: OutputSnapshot) {
  const checklist = getReviewChecklist(snapshot);
  const rawArtifacts = asRecord(snapshot.raw_artifacts);
  const projectUnderstanding = getProjectUnderstanding(snapshot);
  const manifest = getManifestMetrics(rawArtifacts);
  const sourceNeeded = countArray(checklist?.source_needed_items);
  const dependsOnPdmv = countArray(checklist?.depends_on_pdmv_items);
  const blockers = countArray(checklist?.blocking_issues);
  const additionalCorrections = countArray(checklist?.additional_corrections);
  const unsupported = unsupportedBlockers(checklist);
  const topicChecks = evaluateMandatoryTopics(checklist);
  const puEvidence = countArray(projectUnderstanding?.evidence_index);
  const puStatus = asString(projectUnderstanding?.understanding_status);
  const valueMetrics = getReviewValueMetrics(snapshot, checklist);

  const checks: QualityCheck[] = [
    {
      id: 'project_understanding_complete',
      label: 'project_understanding_json is complete',
      status: puStatus === 'complete' ? 'pass' : 'fail',
      details: { understanding_status: puStatus, evidence_index: puEvidence },
    },
    {
      id: 'no_source_needed',
      label: 'No SOURCE_NEEDED remains for mandatory Viseu topics',
      status: sourceNeeded === 0 ? 'pass' : 'fail',
      details: { source_needed_items: sourceNeeded },
    },
    {
      id: 'no_depends_on_pdmv',
      label: 'No depends_on_pdmv remains after official corpus validation',
      status: dependsOnPdmv === 0 ? 'pass' : 'fail',
      details: { depends_on_pdmv_items: dependsOnPdmv },
    },
    {
      id: 'manifest_titles_drawings_complete',
      label: 'Sheet manifest has titles and drawing numbers for every sheet',
      status: manifest.sheets > 0 && manifest.titles === manifest.sheets && manifest.desenhos === manifest.sheets ? 'pass' : 'fail',
      details: manifest,
    },
    {
      id: 'manifest_scales',
      label: 'Sheet manifest includes scales when extractable',
      status: manifest.sheets > 0 && manifest.scales >= Math.ceil(manifest.sheets / 2) ? 'pass' : 'warn',
      details: manifest,
    },
    {
      id: 'blockers_have_support',
      label: 'Blocking issues are linked to support',
      status: unsupported.length === 0 ? 'pass' : 'fail',
      details: { unsupported_blockers: unsupported.length, blockers },
    },
    ...topicChecks.map((topic): QualityCheck => ({
      id: `mandatory_topic_${topic.id}`,
      label: `Mandatory topic present: ${topic.label}`,
      status: topic.status,
      details: topic,
    })),
  ];

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    status: statusFromChecks(checks),
    score: scoreFromChecks(checks),
    metrics: {
      project_understanding_status: puStatus,
      project_understanding_evidence_count: puEvidence,
      manifest,
      total_findings: getTotalFindings(checklist),
      determination_counts: getDeterminationCounts(checklist),
      blocking_issues: blockers,
      additional_corrections: additionalCorrections,
      source_needed_items: sourceNeeded,
      depends_on_pdmv_items: dependsOnPdmv,
      unsupported_blockers: unsupported.length,
      agent_turns: snapshot.agent_turns ?? null,
      agent_cost_usd: snapshot.agent_cost_usd ?? null,
      agent_duration_ms: snapshot.agent_duration_ms ?? null,
      value: valueMetrics,
    },
    mandatory_topics: topicChecks,
    checks,
  };
}

function topicMap(report: ReturnType<typeof evaluateReviewOutputQuality>): Map<string, TopicCheck> {
  return new Map(report.mandatory_topics.map((topic) => [topic.id, topic]));
}

function regressionStatus(checks: QualityCheck[]): GateStatus {
  return statusFromChecks(checks);
}

function getValueComparison(
  currentQuality: ReturnType<typeof evaluateReviewOutputQuality>,
  baselineQuality: ReturnType<typeof evaluateReviewOutputQuality>,
) {
  const current = currentQuality.metrics.value;
  const baseline = baselineQuality.metrics.value;
  const usefulDelta = current.useful_findings - baseline.useful_findings;
  const noiseDelta = current.noise_findings - baseline.noise_findings;
  const totalDelta = (current.total_findings ?? 0) - (baseline.total_findings ?? 0);
  const costDelta = current.agent_cost_usd != null && baseline.agent_cost_usd != null
    ? Math.round((current.agent_cost_usd - baseline.agent_cost_usd) * 1000) / 1000
    : null;
  const currentCostPerUseful = current.cost_per_useful_finding;
  const baselineCostPerUseful = baseline.cost_per_useful_finding;
  const costPerUsefulDelta = currentCostPerUseful != null && baselineCostPerUseful != null
    ? Math.round((currentCostPerUseful - baselineCostPerUseful) * 1000) / 1000
    : null;
  const usefulRatioDelta = current.useful_ratio != null && baseline.useful_ratio != null
    ? Math.round((current.useful_ratio - baseline.useful_ratio) * 1000) / 1000
    : null;

  let verdict: 'improved' | 'same_value' | 'costlier_same_value' | 'noisier' | 'regressed' = 'same_value';
  if (currentQuality.score < baselineQuality.score || usefulDelta < 0) {
    verdict = 'regressed';
  } else if (usefulDelta > 0 && (costPerUsefulDelta == null || costPerUsefulDelta <= 0 || currentQuality.score > baselineQuality.score)) {
    verdict = 'improved';
  } else if (noiseDelta > usefulDelta && totalDelta > 0) {
    verdict = 'noisier';
  } else if (costDelta != null && costDelta > 0 && usefulDelta === 0) {
    verdict = 'costlier_same_value';
  }

  return {
    verdict,
    current,
    baseline,
    delta: {
      total_findings: totalDelta,
      useful_findings: usefulDelta,
      noise_findings: noiseDelta,
      useful_ratio: usefulRatioDelta,
      agent_cost_usd: costDelta,
      cost_per_useful_finding: costPerUsefulDelta,
    },
  };
}

export function compareReviewOutputRegression(
  current: OutputSnapshot,
  baseline: OutputSnapshot | null,
) {
  const currentQuality = evaluateReviewOutputQuality(current);
  if (!baseline) {
    return {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      status: 'pass' as GateStatus,
      baseline: null,
      current_quality_score: currentQuality.score,
      checks: [{
        id: 'no_baseline',
        label: 'No previous review output available for regression comparison',
        status: 'pass' as GateStatus,
      }],
    };
  }

  const baselineQuality = evaluateReviewOutputQuality(baseline);
  const valueComparison = getValueComparison(currentQuality, baselineQuality);
  const currentTopics = topicMap(currentQuality);
  const baselineTopics = topicMap(baselineQuality);
  const checks: QualityCheck[] = [];

  checks.push({
    id: 'quality_score_not_lower',
    label: 'Quality score is not lower than baseline',
    status: currentQuality.score >= baselineQuality.score ? 'pass' : 'fail',
    details: { current: currentQuality.score, baseline: baselineQuality.score },
  });

  for (const topic of MANDATORY_TOPICS) {
    const before = baselineTopics.get(topic.id);
    const after = currentTopics.get(topic.id);
    if (before?.status === 'pass' && after?.status === 'fail') {
      checks.push({
        id: `topic_missing_${topic.id}`,
        label: `Mandatory topic regressed: ${topic.label}`,
        status: 'fail',
        details: { baseline: before, current: after },
      });
    } else if (before?.in_blockers && after?.in_additional && !after.in_blockers) {
      checks.push({
        id: `topic_downgraded_${topic.id}`,
        label: `Topic moved from blocker to additional correction: ${topic.label}`,
        status: 'warn',
        details: { baseline: before, current: after },
      });
    } else {
      checks.push({
        id: `topic_preserved_${topic.id}`,
        label: `Mandatory topic preserved: ${topic.label}`,
        status: 'pass',
        details: { baseline: before, current: after },
      });
    }
  }

  const currentMetrics = currentQuality.metrics;
  const baselineMetrics = baselineQuality.metrics;
  const currentCost = asNumber(currentMetrics.agent_cost_usd);
  const baselineCost = asNumber(baselineMetrics.agent_cost_usd);
  const currentTurns = asNumber(currentMetrics.agent_turns);
  const baselineTurns = asNumber(baselineMetrics.agent_turns);

  if (currentCost != null && baselineCost != null && currentCost > baselineCost * 1.2) {
    const costPerUseful = valueComparison.delta.cost_per_useful_finding;
    checks.push({
      id: 'cost_increase',
      label: 'Agent cost increased by more than 20%',
      status: currentQuality.score > baselineQuality.score || valueComparison.delta.useful_findings > 0
        ? 'warn'
        : 'fail',
      details: {
        current: currentCost,
        baseline: baselineCost,
        useful_findings_delta: valueComparison.delta.useful_findings,
        cost_per_useful_finding_delta: costPerUseful,
      },
    });
  }

  if (currentTurns != null && baselineTurns != null && currentTurns > baselineTurns * 1.2) {
    checks.push({
      id: 'turn_increase',
      label: 'Agent turns increased by more than 20%',
      status: currentQuality.score > baselineQuality.score ? 'warn' : 'fail',
      details: { current: currentTurns, baseline: baselineTurns },
    });
  }

  const currentFindings = asNumber(currentMetrics.total_findings);
  const baselineFindings = asNumber(baselineMetrics.total_findings);
  if (currentFindings != null && baselineFindings != null && currentFindings > baselineFindings * 1.5) {
    const usefulDelta = valueComparison.delta.useful_findings;
    const noiseDelta = valueComparison.delta.noise_findings;
    const usefulRatioDelta = valueComparison.delta.useful_ratio;
    const volumeStatus: GateStatus = usefulDelta > 0 && noiseDelta <= usefulDelta && (usefulRatioDelta == null || usefulRatioDelta >= -0.1)
      ? 'pass'
      : 'warn';
    checks.push({
      id: 'finding_volume_increase',
      label: 'Finding volume increased by more than 50%',
      status: volumeStatus,
      details: {
        current: currentFindings,
        baseline: baselineFindings,
        useful_findings_delta: usefulDelta,
        noise_findings_delta: noiseDelta,
        useful_ratio_delta: usefulRatioDelta,
      },
    });
  }

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    status: regressionStatus(checks),
    baseline: {
      id: baseline.id ?? null,
      created_at: baseline.created_at ?? null,
      quality_score: baselineQuality.score,
    },
    current_quality_score: currentQuality.score,
    value_comparison: valueComparison,
    checks,
  };
}

export function selectRegressionBaseline(outputs: OutputSnapshot[], currentId?: string): OutputSnapshot | null {
  const candidates = outputs
    .filter((output) => !currentId || output.id !== currentId)
    .map((output) => ({ output, quality: evaluateReviewOutputQuality(output) }))
    .sort((a, b) => {
      if (b.quality.score !== a.quality.score) return b.quality.score - a.quality.score;
      const aCost = asNumber(a.output.agent_cost_usd) ?? Number.POSITIVE_INFINITY;
      const bCost = asNumber(b.output.agent_cost_usd) ?? Number.POSITIVE_INFINITY;
      if (aCost !== bCost) return aCost - bCost;
      return String(b.output.created_at || '').localeCompare(String(a.output.created_at || ''));
    });

  return candidates[0]?.output || null;
}
