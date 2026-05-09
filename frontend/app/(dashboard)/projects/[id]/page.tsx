import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProjectDetailClient } from './project-detail-client'

export const dynamic = 'force-dynamic'

const DEMO_FLOW_BY_ID: Record<string, 'city-review' | 'corrections-analysis'> = {
  'a0000000-0000-0000-0000-000000000001': 'city-review',
  'a0000000-0000-0000-0000-000000000002': 'corrections-analysis',
  'b0000000-0000-0000-0000-000000000001': 'city-review',
  'b0000000-0000-0000-0000-000000000002': 'corrections-analysis',
}

interface ProjectPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ showcase?: string }>
}

export default async function ProjectPage({ params, searchParams }: ProjectPageProps) {
  const { id } = await params
  const { showcase } = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  // Fetch project by requested id first.
  let { data: project, error } = await supabase
    .schema('crossbeam')
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()

  // Local setups often do not have the hard-coded demo/judge ids seeded.
  // In that case, fall back to the first compatible demo project so the
  // persona entrypoints still work against a fresh Supabase project.
  if ((error || !project) && DEMO_FLOW_BY_ID[id]) {
    const fallback = await supabase
      .schema('crossbeam')
      .from('projects')
      .select('*')
      .eq('is_demo', true)
      .eq('flow_type', DEMO_FLOW_BY_ID[id])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    project = fallback.data
    error = fallback.error
  }

  if (error || !project) notFound()

  // Fetch files
  const { data: files } = await supabase
    .schema('crossbeam')
    .from('files')
    .select('*')
    .eq('project_id', id)
    .order('created_at', { ascending: true })

  return (
    <ProjectDetailClient
      initialProject={project}
      initialFiles={files || []}
      userId={user.id}
      showcaseOutputId={showcase}
    />
  )
}
