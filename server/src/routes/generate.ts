import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import {
  updateProjectStatus,
  getProjectFiles,
  getApplicantAnswers,
  getPhase1Outputs,
  getProject,
  insertMessage,
  processingStatusForFlow,
  startProjectProcessingHeartbeat,
  tryStartProjectProcessing,
} from '../services/supabase.js';
import { runCrossBeamFlow } from '../services/sandbox.js';
import { assertExtractionArtifactsReady, extractPdfForProject } from '../services/extract.js';
import { validateMunicipalCorpusForFlow } from '../services/municipal-corpus.js';
import { postProcessLatestOutput } from '../services/output-postprocess.js';
import { generateResponseLetterPdfForProject } from '../services/response-pdf.js';
import {
  assertSupportedRuntimeCity,
  type InternalFlowType,
} from '../utils/config.js';

export const generateRouter = Router();

const generateRequestSchema = z.object({
  project_id: z.string().uuid(),
  user_id: z.string().uuid(),
  flow_type: z.enum(['city-review', 'corrections-analysis', 'corrections-response']),
});

function resolveCallbackBaseUrl(req: Request): string {
  const configured = process.env.CROSSBEAM_CALLBACK_BASE_URL
    || process.env.CLOUD_RUN_URL
    || process.env.CROSSBEAM_SERVER_URL;
  if (configured?.trim()) {
    return configured.trim().replace(/\/+$/, '');
  }

  const host = (req.get('x-forwarded-host') || req.get('host'))?.split(',')[0]?.trim();
  if (!host) {
    throw new Error('Sandbox callback URL is not configured');
  }

  const proto = (req.get('x-forwarded-proto') || req.protocol || 'https')
    .split(',')[0]
    .trim();
  return `${proto}://${host}`.replace(/\/+$/, '');
}

generateRouter.post('/', async (req, res) => {
  console.log('Generate request received:', req.body);

  // Validate request
  const parseResult = generateRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid request', details: parseResult.error });
  }

  const { project_id, user_id, flow_type } = parseResult.data;
  const processingStatus = processingStatusForFlow(flow_type);
  let callbackBaseUrl: string;
  try {
    callbackBaseUrl = resolveCallbackBaseUrl(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sandbox callback URL is not configured';
    return res.status(503).json({ error: message });
  }

  let runId: string;
  try {
    const claim = await tryStartProjectProcessing(project_id, processingStatus);
    if (!claim.started) {
      if (!claim.currentStatus) {
        return res.status(404).json({ error: 'Project not found' });
      }
      return res.status(409).json({
        error: 'already_processing',
        current_status: claim.currentStatus,
      });
    }
    runId = claim.runId;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not claim project processing status';
    return res.status(500).json({ error: message });
  }

  // Respond immediately - processing continues async
  res.json({ status: processingStatus, project_id });

  // Start async processing
  const stopHeartbeat = startProjectProcessingHeartbeat(project_id, runId);
  processGeneration(project_id, user_id, flow_type, callbackBaseUrl)
    .catch((error) => {
      console.error('Generation failed:', error);
    })
    .finally(stopHeartbeat);
});

export function resolveSupportedProjectCity(project: { city: string | null | undefined }): string {
  const city = project.city?.trim() || null;
  assertSupportedRuntimeCity(city);
  return city;
}

async function processGeneration(
  projectId: string,
  userId: string,
  flowType: InternalFlowType,
  callbackBaseUrl: string,
) {
  const startTime = Date.now();

  try {
    console.log(`Starting generation for project ${projectId}, flow: ${flowType}`);

    // Get project details (city, address)
    const project = await getProject(projectId);
    const city = resolveSupportedProjectCity(project);
    const address = project.project_address || undefined;

    validateMunicipalCorpusForFlow(city, flowType);

    // Pre-extract PDF → PNGs/text before launching the sandbox.
    // For review/analysis this is a hard gate: the agent prompt assumes these artifacts exist.
    if (flowType !== 'corrections-response') {
      await insertMessage(projectId, 'system', 'Pre-extracting submitted PDFs before review...');
      await extractPdfForProject(projectId);
      await assertExtractionArtifactsReady(projectId);
      await insertMessage(projectId, 'system', 'Pre-extraction artifacts verified.');
    }

    // Get files to download into sandbox (re-fetch to include any new archives)
    const fileRecords = await getProjectFiles(projectId);
    console.log(`Found ${fileRecords.length} project files`);

    if (fileRecords.length === 0) {
      throw new Error('No files found for project');
    }

    const files = fileRecords.map((r: { filename: string; storage_path: string; file_type: string }) => ({
      filename: r.filename,
      storage_path: r.storage_path,
      file_type: r.file_type,
    }));

    // For corrections-response: also need Phase 1 outputs + applicant answers
    let applicantAnswersJson: string | undefined;
    let phase1Artifacts: Record<string, unknown> | undefined;

    if (flowType === 'corrections-response') {
      const answers = await getApplicantAnswers(projectId);
      applicantAnswersJson = JSON.stringify(answers, null, 2);
      const phase1 = await getPhase1Outputs(projectId);
      phase1Artifacts = phase1?.raw_artifacts as Record<string, unknown> | undefined;
    }

    // Required env vars
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
    if (!supabaseUrl || !supabaseKey) throw new Error('Supabase not configured');

    // Run the agent
    await runCrossBeamFlow({
      files,
      flowType,
      city,
      address,
      apiKey,
      callbackBaseUrl,
      projectId,
      userId,
      contractorAnswersJson: applicantAnswersJson,
      phase1Artifacts,
    });

    try {
      const postProcessResult = await postProcessLatestOutput(projectId, flowType);
      if (!postProcessResult.updated && postProcessResult.reason) {
        await insertMessage(projectId, 'system', `Skipped output post-processing: ${postProcessResult.reason}`);
      }
    } catch (postProcessError) {
      const postProcessMessage = postProcessError instanceof Error ? postProcessError.message : 'Unknown output post-processing error';
      console.warn(`Output post-process failed for project ${projectId}:`, postProcessError);
      await insertMessage(
        projectId,
        'system',
        `Output post-processing failed; raw artifacts were preserved. Reason: ${postProcessMessage}`,
      );
    }

    if (flowType === 'corrections-response') {
      try {
        const pdfResult = await generateResponseLetterPdfForProject(projectId, userId);
        if (!pdfResult.generated && pdfResult.reason) {
          await insertMessage(projectId, 'system', `Skipped response_letter.pdf generation: ${pdfResult.reason}`);
        }
      } catch (pdfError) {
        const pdfMessage = pdfError instanceof Error ? pdfError.message : 'Unknown PDF rendering error';
        console.warn(`Response PDF post-process failed for project ${projectId}:`, pdfError);
        await insertMessage(
          projectId,
          'system',
          `response_letter.pdf post-process failed; markdown artifacts were preserved. Reason: ${pdfMessage}`,
        );
      }
    }

    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log(`Generation completed for project ${projectId} in ${duration} minutes`);
  } catch (error) {
    console.error(`Generation failed for project ${projectId}:`, error);
    try {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      await updateProjectStatus(projectId, 'failed', msg);
    } catch (statusErr) {
      console.log('Could not update status (sandbox may have already set it)');
    }
  }
}
