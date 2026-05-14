import type { InternalFlowType } from '../utils/config.js';
import {
  buildAnalysisPhaseOutputData,
  buildResponsePhaseOutputData,
  buildReviewPhaseOutputData,
} from './sandbox.js';
import {
  getProject,
  getLatestOutputForPhase,
  getRecentOutputsForPhase,
  insertMessage,
  updateOutputRecord,
} from './supabase.js';
import { attachEvidenceCropsForProject } from './evidence-crops.js';
import {
  compareReviewOutputRegression,
  evaluateReviewOutputQuality,
  selectRegressionBaseline,
} from './output-quality.js';

function flowPhaseFor(flowType: InternalFlowType): 'review' | 'analysis' | 'response' {
  switch (flowType) {
    case 'city-review':
      return 'review';
    case 'corrections-analysis':
      return 'analysis';
    case 'corrections-response':
      return 'response';
  }
}

function asRawArtifactsRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export async function postProcessLatestOutput(
  projectId: string,
  flowType: InternalFlowType,
): Promise<{ updated: boolean; reason?: string }> {
  const flowPhase = flowPhaseFor(flowType);
  const latestOutput = await getLatestOutputForPhase(projectId, flowPhase);
  if (!latestOutput) {
    return { updated: false, reason: `No ${flowPhase} output record found` };
  }

  let rawArtifacts = asRawArtifactsRecord(latestOutput.raw_artifacts);
  if (!rawArtifacts) {
    return { updated: false, reason: 'Latest output has no raw_artifacts payload' };
  }

  if (flowType !== 'corrections-response') {
    try {
      const project = await getProject(projectId);
      rawArtifacts = await attachEvidenceCropsForProject(projectId, project.user_id as string, rawArtifacts);
    } catch (cropError) {
      const cropMessage = cropError instanceof Error ? cropError.message : 'Unknown crop generation error';
      console.warn(`Evidence crop generation failed for project ${projectId}:`, cropError);
      await insertMessage(projectId, 'system', `Evidence crop generation skipped: ${cropMessage}`);
    }
  }

  const patch: Record<string, unknown> = flowType === 'city-review'
    ? buildReviewPhaseOutputData(rawArtifacts)
    : flowType === 'corrections-analysis'
      ? buildAnalysisPhaseOutputData(rawArtifacts)
      : buildResponsePhaseOutputData(rawArtifacts);

  if (flowType === 'city-review') {
    const currentSnapshot = {
      id: latestOutput.id as string,
      created_at: latestOutput.created_at as string | undefined,
      agent_turns: latestOutput.agent_turns as number | undefined,
      agent_cost_usd: latestOutput.agent_cost_usd as number | undefined,
      agent_duration_ms: latestOutput.agent_duration_ms as number | undefined,
      ...patch,
    };
    const qualityGate = evaluateReviewOutputQuality(currentSnapshot);
    const recentOutputs = await getRecentOutputsForPhase(projectId, 'review', 10);
    const baseline = selectRegressionBaseline(
      recentOutputs.map((output) => ({
        id: output.id as string,
        created_at: output.created_at as string | undefined,
        agent_turns: output.agent_turns as number | undefined,
        agent_cost_usd: output.agent_cost_usd as number | undefined,
        agent_duration_ms: output.agent_duration_ms as number | undefined,
        project_understanding_json: output.project_understanding_json,
        review_checklist_json: output.review_checklist_json,
        raw_artifacts: output.raw_artifacts,
      })),
      latestOutput.id as string,
    );
    const regressionReport = compareReviewOutputRegression(currentSnapshot, baseline);
    const patchRawArtifacts = asRawArtifactsRecord(patch.raw_artifacts) || {};
    patch.raw_artifacts = {
      ...patchRawArtifacts,
      'quality_gate.json': qualityGate,
      'regression_report.json': regressionReport,
    };
  }

  await updateOutputRecord(latestOutput.id as string, patch);
  await insertMessage(projectId, 'system', `Post-processed ${flowPhase} output fields from raw_artifacts.`);
  return { updated: true };
}
