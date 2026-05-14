import { createClient } from '@supabase/supabase-js';

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
  status: 'ready' | 'uploading' | 'processing' | 'processing-phase1' |
          'awaiting-answers' | 'processing-phase2' | 'completed' | 'failed',
  errorMessage?: string,
) {
  const updateData: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (errorMessage !== undefined) {
    updateData.error_message = errorMessage;
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
