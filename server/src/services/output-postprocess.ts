import type { InternalFlowType } from '../utils/config.js';
import {
  buildAnalysisPhaseOutputData,
  buildResponsePhaseOutputData,
  buildReviewPhaseOutputData,
} from './sandbox.js';
import {
  getProject,
  getLatestOutputForPhase,
  insertMessage,
  updateOutputRecord,
} from './supabase.js';
import { attachEvidenceCropsForProject } from './evidence-crops.js';

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

  const patch = flowType === 'city-review'
    ? buildReviewPhaseOutputData(rawArtifacts)
    : flowType === 'corrections-analysis'
      ? buildAnalysisPhaseOutputData(rawArtifacts)
      : buildResponsePhaseOutputData(rawArtifacts);

  await updateOutputRecord(latestOutput.id as string, patch);
  await insertMessage(projectId, 'system', `Post-processed ${flowPhase} output fields from raw_artifacts.`);
  return { updated: true };
}
