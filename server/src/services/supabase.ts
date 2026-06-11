import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export type OutputFlowPhase = 'review' | 'analysis' | 'response';
export type ProjectStatus =
  | 'ready'
  | 'uploading'
  | 'processing'
  | 'processing-phase1'
  | 'awaiting-answers'
  | 'processing-phase2'
  | 'completed'
  | 'failed';

export const PROCESSING_PROJECT_STATUSES: readonly ProjectStatus[] = [
  'processing',
  'processing-phase1',
  'processing-phase2',
];

export const DEFAULT_STALE_RUN_TIMEOUT_MS = 60 * 60 * 1000;

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export async function updateProjectStatus(
  projectId: string,
  status: ProjectStatus,
  errorMessage?: string,
) {
  const isProcessingStatus = PROCESSING_PROJECT_STATUSES.includes(status);
  const updateData: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (errorMessage !== undefined) {
    updateData.error_message = errorMessage;
  }
  if (!isProcessingStatus) {
    updateData.processing_started_at = null;
    updateData.processing_heartbeat_at = null;
    updateData.processing_run_id = null;
  }

  const { error } = await supabase
    .schema('crossbeam')
    .from('projects')
    .update(updateData)
    .eq('id', projectId);

  if (error) {
    console.error('Failed to update project status:', error);
    throw error;
  }
}

export async function getProject(projectId: string) {
  const { data, error } = await supabase
    .schema('crossbeam')
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single();

  if (error) {
    console.error('Failed to get project:', error);
    throw error;
  }
  return data;
}

export async function getProjectFiles(projectId: string) {
  const { data, error } = await supabase
    .schema('crossbeam')
    .from('files')
    .select('*')
    .eq('project_id', projectId);

  if (error) {
    console.error('Failed to get project files:', error);
    throw error;
  }
  return data || [];
}

export async function getApplicantAnswers(projectId: string) {
  const { data, error } = await supabase
    .schema('crossbeam')
    .from('applicant_answers')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to get applicant answers:', error);
    throw error;
  }
  return data || [];
}

export const getContractorAnswers = getApplicantAnswers;

export async function getPhase1Outputs(projectId: string) {
  const { data, error } = await supabase
    .schema('crossbeam')
    .from('outputs')
    .select('*')
    .eq('project_id', projectId)
    .eq('flow_phase', 'analysis')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    console.error('Failed to get Phase 1 outputs:', error);
    throw error;
  }
  return data;
}

export async function getLatestOutputForPhase(
  projectId: string,
  flowPhase: 'review' | 'analysis' | 'response',
) {
  const { data, error } = await supabase
    .schema('crossbeam')
    .from('outputs')
    .select('*')
    .eq('project_id', projectId)
    .eq('flow_phase', flowPhase)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(`Failed to get latest ${flowPhase} output:`, error);
    throw error;
  }
  return data;
}

export async function getRecentOutputsForPhase(
  projectId: string,
  flowPhase: 'review' | 'analysis' | 'response',
  limit = 10,
) {
  const { data, error } = await supabase
    .schema('crossbeam')
    .from('outputs')
    .select('*')
    .eq('project_id', projectId)
    .eq('flow_phase', flowPhase)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error(`Failed to get recent ${flowPhase} outputs:`, error);
    throw error;
  }
  return data || [];
}

export async function updateOutputRecord(
  outputId: string,
  patch: Record<string, unknown>,
) {
  const { error } = await supabase
    .schema('crossbeam')
    .from('outputs')
    .update(patch)
    .eq('id', outputId);

  if (error) {
    console.error('Failed to update output record:', error);
    throw error;
  }
}

export function processingStatusForFlow(
  flowType: 'city-review' | 'corrections-analysis' | 'corrections-response',
): ProjectStatus {
  if (flowType === 'corrections-analysis') return 'processing-phase1';
  if (flowType === 'corrections-response') return 'processing-phase2';
  return 'processing';
}

export async function tryStartProjectProcessing(
  projectId: string,
  nextStatus: ProjectStatus,
): Promise<
  | { started: true; previousStatus: ProjectStatus; runId: string }
  | { started: false; currentStatus: ProjectStatus | null }
> {
  const { data: current, error: currentError } = await supabase
    .schema('crossbeam')
    .from('projects')
    .select('status')
    .eq('id', projectId)
    .maybeSingle();

  if (currentError) {
    console.error('Failed to read project status before processing claim:', currentError);
    throw currentError;
  }

  if (!current) {
    return { started: false, currentStatus: null };
  }

  const currentStatus = current.status as ProjectStatus;
  if (PROCESSING_PROJECT_STATUSES.includes(currentStatus)) {
    return { started: false, currentStatus };
  }

  const runId = crypto.randomUUID();
  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabase
    .schema('crossbeam')
    .from('projects')
    .update({
      status: nextStatus,
      error_message: null,
      processing_started_at: now,
      processing_heartbeat_at: now,
      processing_run_id: runId,
      updated_at: now,
    })
    .eq('id', projectId)
    .eq('status', currentStatus)
    .select('id')
    .maybeSingle();

  if (claimError) {
    console.error('Failed to claim project processing status:', claimError);
    throw claimError;
  }

  if (!claimed) {
    const { data: latest, error: latestError } = await supabase
      .schema('crossbeam')
      .from('projects')
      .select('status')
      .eq('id', projectId)
      .maybeSingle();

    if (latestError) {
      console.error('Failed to read project status after processing claim race:', latestError);
      throw latestError;
    }

    return {
      started: false,
      currentStatus: latest ? latest.status as ProjectStatus : null,
    };
  }

  return { started: true, previousStatus: currentStatus, runId };
}

export async function touchProjectProcessingHeartbeat(
  projectId: string,
  runId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .schema('crossbeam')
    .from('projects')
    .update({
      processing_heartbeat_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId)
    .eq('processing_run_id', runId)
    .in('status', PROCESSING_PROJECT_STATUSES as ProjectStatus[])
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Failed to update project processing heartbeat:', error);
    throw error;
  }

  return Boolean(data);
}

export function startProjectProcessingHeartbeat(
  projectId: string,
  runId: string,
  intervalMs = 2 * 60 * 1000,
): () => void {
  const timer = setInterval(() => {
    touchProjectProcessingHeartbeat(projectId, runId).catch((error) => {
      console.warn(`Failed to update heartbeat for project ${projectId}:`, error);
    });
  }, intervalMs);

  timer.unref?.();
  return () => clearInterval(timer);
}

export async function failStaleProcessingProjects(
  staleAfterMs = DEFAULT_STALE_RUN_TIMEOUT_MS,
): Promise<Array<{ id: string; status: ProjectStatus; processing_run_id: string | null }>> {
  const staleBefore = new Date(Date.now() - staleAfterMs).toISOString();
  const message = `Processing run timed out after ${Math.round(staleAfterMs / 60000)} minutes without heartbeat.`;

  const { data, error } = await supabase
    .schema('crossbeam')
    .from('projects')
    .update({
      status: 'failed',
      error_message: message,
      processing_started_at: null,
      processing_heartbeat_at: null,
      processing_run_id: null,
      updated_at: new Date().toISOString(),
    })
    .in('status', PROCESSING_PROJECT_STATUSES as ProjectStatus[])
    .or(`processing_heartbeat_at.is.null,processing_heartbeat_at.lt.${staleBefore}`)
    .select('id, status, processing_run_id');

  if (error) {
    console.error('Failed to reconcile stale processing projects:', error);
    throw error;
  }

  return (data || []) as Array<{ id: string; status: ProjectStatus; processing_run_id: string | null }>;
}

export async function createOutputRecord(
  projectId: string,
  flowPhase: OutputFlowPhase,
  data: Record<string, unknown>,
): Promise<string> {
  const { data: existing, error: existingError } = await supabase
    .schema('crossbeam')
    .from('outputs')
    .select('version')
    .eq('project_id', projectId)
    .eq('flow_phase', flowPhase)
    .order('version', { ascending: false })
    .limit(1);

  if (existingError) {
    console.error('Failed to read output versions:', existingError);
    throw existingError;
  }

  const nextVersion = (existing?.[0]?.version || 0) + 1;
  const { data: inserted, error } = await supabase
    .schema('crossbeam')
    .from('outputs')
    .insert({
      ...data,
      project_id: projectId,
      flow_phase: flowPhase,
      version: nextVersion,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to create output record:', error);
    throw error;
  }

  return inserted.id as string;
}

export async function insertApplicantQuestions(
  projectId: string,
  questions: Array<Record<string, unknown>>,
  outputId: string | null = null,
): Promise<void> {
  if (questions.length === 0) {
    return;
  }

  const { error: deleteError } = await supabase
    .schema('crossbeam')
    .from('applicant_answers')
    .delete()
    .eq('project_id', projectId)
    .eq('is_answered', false);

  if (deleteError) {
    console.error('Failed to delete old unanswered questions:', deleteError);
  }

  const rows = questions.map((q) => ({
    project_id: projectId,
    question_key: String(
      q.question_id || q.key || q.question_key || q.id || `q_${crypto.randomUUID()}`,
    ),
    question_text: String(q.context || q.question || q.question_text || q.text || ''),
    question_type: q.options ? 'select' : String(q.type || 'text'),
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
    console.error('Failed to insert applicant questions:', error);
    throw error;
  }
}

export async function uploadOutputArtifact(
  userId: string,
  projectId: string,
  filename: string,
  content: Buffer,
  contentType: string,
) {
  const storagePath = `${userId}/${projectId}/${filename}`;

  const { error } = await supabase.storage
    .from('crossbeam-outputs')
    .upload(storagePath, content, { upsert: true, contentType });

  if (error) {
    console.error('Failed to upload output artifact:', error);
    throw error;
  }

  return storagePath;
}

export async function createStorageSignedUrl(
  bucket: string,
  storagePath: string,
  expiresInSeconds: number,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    console.error('Failed to create storage signed URL:', error);
    throw error || new Error('No signed URL returned from Supabase');
  }

  return data.signedUrl;
}

export async function insertMessage(
  projectId: string,
  role: 'system' | 'assistant' | 'tool',
  content: string,
): Promise<void> {
  const { error } = await supabase
    .schema('crossbeam')
    .from('messages')
    .insert({ project_id: projectId, role, content });

  if (error) {
    console.error('Failed to insert message:', error);
    // Don't throw - message logging shouldn't break the generation flow
  }
}
