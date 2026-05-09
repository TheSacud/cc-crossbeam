import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { authenticateRequest, getSupabaseForAuth } from '@/lib/api-auth'

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

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const { data, error } = await service.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 30)

    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: error?.message || 'Could not create signed URL' }, { status: 500 })
    }

    return NextResponse.json({ signedUrl: data.signedUrl })
  } catch (error) {
    console.error('Error creating signed storage URL:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
