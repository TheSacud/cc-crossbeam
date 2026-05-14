import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { authenticateRequest, getSupabaseForAuth } from '@/lib/api-auth'

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

function normalizeStoragePath(bucket: string, path: string): string[] {
  const cleanPath = path.replace(/^\/+/, '')
  const withoutBucket = cleanPath.startsWith(`${bucket}/`)
    ? cleanPath.slice(bucket.length + 1)
    : cleanPath
  return [withoutBucket, `${bucket}/${withoutBucket}`]
}

function jsonIncludesStoragePath(value: JsonValue | undefined, allowed: Set<string>): boolean {
  if (typeof value === 'string') return allowed.has(value)
  if (!value || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.some((entry) => jsonIncludesStoragePath(entry, allowed))
  return Object.values(value).some((entry) => jsonIncludesStoragePath(entry, allowed))
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request)
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { project_id, bucket, path } = await request.json()
    if (!project_id || !bucket || !path) {
      return NextResponse.json({ error: 'project_id, bucket, and path are required' }, { status: 400 })
    }
    if (!['crossbeam-outputs', 'crossbeam-uploads', 'crossbeam-demo-assets'].includes(bucket)) {
      return NextResponse.json({ error: 'Unsupported bucket' }, { status: 400 })
    }

    const supabase = await getSupabaseForAuth(auth)
    const { data: project, error: projectError } = await supabase
      .schema('crossbeam')
      .from('projects')
      .select('id, user_id, is_demo')
      .eq('id', project_id)
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    if (!auth.isApiKey && project.user_id !== auth.userId && !project.is_demo) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const allowedPaths = new Set(normalizeStoragePath(bucket, path))

    const { data: files, error: filesError } = await supabase
      .schema('crossbeam')
      .from('files')
      .select('storage_path')
      .eq('project_id', project_id)

    if (filesError) {
      return NextResponse.json({ error: 'Could not verify file access' }, { status: 500 })
    }

    const fileAllowed = (files || []).some((file) => allowedPaths.has(file.storage_path))

    const { data: outputs, error: outputsError } = await supabase
      .schema('crossbeam')
      .from('outputs')
      .select('corrections_letter_pdf_path, response_letter_pdf_path, review_checklist_json, corrections_analysis_json, applicant_questions_json, project_understanding_json, raw_artifacts')
      .eq('project_id', project_id)

    if (outputsError) {
      return NextResponse.json({ error: 'Could not verify output access' }, { status: 500 })
    }

    const outputAllowed = (outputs || []).some((output) => {
      if (
        allowedPaths.has(output.corrections_letter_pdf_path || '') ||
        allowedPaths.has(output.response_letter_pdf_path || '')
      ) {
        return true
      }
      return jsonIncludesStoragePath(output.review_checklist_json as JsonValue, allowedPaths) ||
        jsonIncludesStoragePath(output.corrections_analysis_json as JsonValue, allowedPaths) ||
        jsonIncludesStoragePath(output.applicant_questions_json as JsonValue, allowedPaths) ||
        jsonIncludesStoragePath(output.project_understanding_json as JsonValue, allowedPaths) ||
        jsonIncludesStoragePath(output.raw_artifacts as JsonValue, allowedPaths)
    })

    if (!fileAllowed && !outputAllowed) {
      return NextResponse.json({ error: 'Storage object is not registered for this project' }, { status: 403 })
    }

    const storagePath = normalizeStoragePath(bucket, path)[0]
    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const { data, error } = await service.storage
      .from(bucket)
      .createSignedUrl(storagePath, 60 * 30)

    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: error?.message || 'Could not create signed URL' }, { status: 500 })
    }

    return NextResponse.json({ signedUrl: data.signedUrl })
  } catch (error) {
    console.error('Error creating signed storage URL:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
