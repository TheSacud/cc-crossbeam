'use client'

import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeAuth } from '@/lib/supabase/use-realtime-auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AduMiniature } from '@/components/adu-miniature'
import { AgentStream } from '@/components/agent-stream'
import { ProgressPhases } from '@/components/progress-phases'
import { ContractorQuestionsForm } from '@/components/contractor-questions-form'
import { ResultsViewer } from '@/components/results-viewer'
import type { Project, ProjectFile, ProjectStatus } from '@/types/database'
import {
  FileTextIcon,
  PlayIcon,
  Loader2Icon,
  AlertCircleIcon,
  RotateCcwIcon,
} from 'lucide-react'

interface ProjectDetailClientProps {
  initialProject: Project
  initialFiles: ProjectFile[]
  userId: string
  showcaseOutputId?: string
}

const CITY_PHASES = ['Extrair', 'Pesquisar', 'Rever', 'Gerar']
const CONTRACTOR_P1_PHASES = ['Extrair', 'Analisar', 'Validar fontes', 'Categorizar', 'Preparar']
const CONTRACTOR_P2_PHASES = ['Ler respostas', 'Validar', 'Minutar', 'Fechar']

const PROCESSING_STATUSES: ProjectStatus[] = ['processing', 'processing-phase1', 'processing-phase2']
const TERMINAL_STATUSES: ProjectStatus[] = ['completed', 'failed']

export function ProjectDetailClient({
  initialProject,
  initialFiles,
  userId,
  showcaseOutputId,
}: ProjectDetailClientProps) {
  const [project, setProject] = useState<Project>(initialProject)
  const [starting, setStarting] = useState(false)
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0)
  const supabase = useMemo(() => createClient(), [])
  const realtimeReady = useRealtimeAuth(supabase)

  useEffect(() => {
    setProject(initialProject)
    setStarting(false)
  }, [initialProject.id, initialProject.status])

  useEffect(() => {
    const handler = (e: Event) => {
      const { status, projectId, errorMessage } = (e as CustomEvent).detail
      if (projectId === project.id) {
        setProject(prev => ({
          ...prev,
          status,
          error_message: errorMessage ?? null,
        }))
        setStarting(false)
        setCurrentPhaseIndex(0)
      }
    }
    window.addEventListener('devtools-state-change', handler)
    return () => window.removeEventListener('devtools-state-change', handler)
  }, [project.id])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (typeof detail?.phase === 'number') {
        setCurrentPhaseIndex(detail.phase)
      }
    }
    window.addEventListener('devtools-phase', handler)
    return () => window.removeEventListener('devtools-phase', handler)
  }, [])

  const shouldListenRef = useRef(false)
  useEffect(() => {
    shouldListenRef.current =
      starting || (!TERMINAL_STATUSES.includes(project.status) && project.status !== 'ready')
  }, [project.status, starting])

  useEffect(() => {
    if (!realtimeReady) return

    const channel = supabase
      .channel(`project-status-${project.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'crossbeam',
          table: 'projects',
          filter: `id=eq.${project.id}`,
        },
        (payload) => {
          if (!shouldListenRef.current) return
          const newStatus = payload.new.status as ProjectStatus
          const newError = payload.new.error_message as string | null
          console.log('[Realtime] Project status:', newStatus)
          setProject(prev => ({ ...prev, status: newStatus, error_message: newError }))
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Subscription:', status)
        if (status === 'SUBSCRIBED' && shouldListenRef.current) {
          supabase
            .schema('crossbeam')
            .from('projects')
            .select('status, error_message')
            .eq('id', project.id)
            .single()
            .then(({ data }) => {
              if (data) {
                setProject(prev => ({ ...prev, status: data.status as ProjectStatus, error_message: data.error_message }))
              }
            })
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [project.id, supabase, realtimeReady])

  const getPhases = useCallback(() => {
    if (project.flow_type === 'city-review') return CITY_PHASES
    if (project.status === 'processing-phase2') return CONTRACTOR_P2_PHASES
    return CONTRACTOR_P1_PHASES
  }, [project.flow_type, project.status])

  const handleStartAnalysis = async () => {
    setStarting(true)
    const flowType = project.flow_type === 'city-review'
      ? 'city-review'
      : 'corrections-analysis'

    try {
      await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id,
          user_id: userId,
          flow_type: flowType,
        }),
      })
    } catch {
      // Status polling will detect any transition
    }
  }

  const handleRetry = () => {
    setProject(prev => ({ ...prev, status: 'ready', error_message: null }))
    setStarting(false)
  }

  const [resetting, setResetting] = useState(false)
  const handleReset = async () => {
    setResetting(true)
    try {
      const res = await fetch('/api/reset-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: project.id }),
      })
      if (res.ok) {
        setProject(prev => ({ ...prev, status: 'ready', error_message: null }))
        setStarting(false)
        setCurrentPhaseIndex(0)
      }
    } catch {
      // ignore
    } finally {
      setResetting(false)
    }
  }

  const [preparingLive, setPreparingLive] = useState(false)
  const handleGoLive = async () => {
    setPreparingLive(true)
    try {
      await fetch('/api/reset-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: project.id }),
      })
    } catch {
      // proceed anyway
    }
    window.location.href = `/projects/${project.id}`
  }

  if (showcaseOutputId) {
    return (
      <div className="animate-fade-up space-y-6">
        <ResultsViewer projectId={project.id} flowType={project.flow_type} pinnedOutputId={showcaseOutputId} />
        <div className="flex justify-center pb-8">
          <Button
            onClick={handleGoLive}
            disabled={preparingLive}
            className="rounded-full px-8 font-bold font-body hover:shadow-[0_0_24px_rgba(45,106,79,0.3)] hover:brightness-110"
          >
            {preparingLive ? <Loader2Icon className="w-4 h-4 mr-2 animate-spin" /> : <PlayIcon className="w-4 h-4 mr-2" />}
            {preparingLive ? 'A preparar...' : 'Executar live'}
          </Button>
        </div>
      </div>
    )
  }

  if (project.status === 'ready') {
    return (
      <div className="space-y-4 animate-fade-up">
        <div className="flex justify-center pt-2">
          <AduMiniature variant="card" />
        </div>

        <div className="text-center space-y-2">
          <h1 className="heading-display text-foreground">{project.project_name}</h1>
          <div className="flex items-center justify-center gap-3">
            {project.city && (
              <Badge variant="secondary" className="rounded-full font-body">
                {project.city}
              </Badge>
            )}
            <Badge variant="outline" className="rounded-full font-body">
              {project.flow_type === 'city-review' ? 'Revisão municipal' : 'Análise de aperfeiçoamento'}
            </Badge>
          </div>
        </div>

        {initialFiles.length > 0 && (
          <Card className="shadow-[0_8px_32px_rgba(28,25,23,0.08)] border-border/50 max-w-lg mx-auto">
            <CardContent className="p-6">
              <h3 className="heading-card text-foreground mb-4">Ficheiros</h3>
              <div className="space-y-2">
                {initialFiles.map(file => (
                  <div key={file.id} className="flex items-center gap-3 text-sm font-body">
                    <FileTextIcon className="w-4 h-4 text-primary" />
                    <span className="text-foreground">{file.filename}</span>
                    {file.size_bytes && (
                      <span className="text-muted-foreground ml-auto">
                        {(file.size_bytes / 1024).toFixed(0)} KB
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-center">
          <Button
            onClick={handleStartAnalysis}
            disabled={starting}
            className="rounded-full px-10 py-6 text-lg font-bold font-body hover:shadow-[0_0_24px_rgba(45,106,79,0.3)] hover:brightness-110"
            size="lg"
          >
            {starting ? (
              <Loader2Icon className="w-5 h-5 animate-spin" />
            ) : (
              <PlayIcon className="w-5 h-5" />
            )}
            {starting
              ? 'A iniciar...'
              : project.flow_type === 'city-review'
                ? 'Executar revisão'
                : 'Analisar notificação'
            }
          </Button>
        </div>
      </div>
    )
  }

  if (PROCESSING_STATUSES.includes(project.status)) {
    const phases = getPhases()
    const heading = project.status === 'processing-phase2'
      ? 'A fechar a resposta...'
      : project.flow_type === 'city-review'
        ? 'A rever o processo...'
        : 'A analisar a notificação...'

    return (
      <div className="space-y-4 animate-fade-up">
        <div className="flex justify-center pt-2">
          <AduMiniature variant="card" />
        </div>

        <div className="text-center space-y-1">
          <h1 className="heading-section text-foreground">{heading}</h1>
          <p className="text-muted-foreground font-body">Normalmente demora entre 12 e 18 minutos</p>
        </div>

        <ProgressPhases phases={phases} currentPhaseIndex={currentPhaseIndex} />

        <div className="max-w-2xl mx-auto">
          <AgentStream projectId={project.id} />
        </div>
      </div>
    )
  }

  if (project.status === 'awaiting-answers') {
    return (
      <div className="space-y-6 animate-fade-up">
        <div className="text-center">
          <h1 className="heading-section text-foreground">Faltam alguns elementos</h1>
          <p className="text-muted-foreground font-body mt-2">
            O agente precisa destas respostas para fechar a proposta ao município
          </p>
        </div>
        <ContractorQuestionsForm projectId={project.id} userId={userId} />
      </div>
    )
  }

  if (project.status === 'completed') {
    return (
      <div className="animate-fade-up space-y-6">
        <ResultsViewer projectId={project.id} flowType={project.flow_type} />
        {project.is_demo && (
          <div className="flex justify-center pb-8">
            <Button
              onClick={handleReset}
              disabled={resetting}
              variant="outline"
              className="rounded-full font-body"
            >
              <RotateCcwIcon className="w-4 h-4 mr-2" />
              {resetting ? 'A repor...' : 'Repor e voltar a executar'}
            </Button>
          </div>
        )}
      </div>
    )
  }

  if (project.status === 'failed') {
    return (
      <div className="space-y-6 animate-fade-up max-w-lg mx-auto pt-12">
        <Card className="shadow-[0_8px_32px_rgba(28,25,23,0.08)] border-destructive/30">
          <CardContent className="p-8 text-center space-y-4">
            <AlertCircleIcon className="w-12 h-12 text-destructive mx-auto" />
            <h2 className="heading-section text-foreground">Ocorreu um erro</h2>
            <p className="text-muted-foreground font-body">
              {project.error_message || 'A análise falhou. Tente novamente.'}
            </p>
            <Button
              onClick={project.is_demo ? handleReset : handleRetry}
              disabled={resetting}
              variant="outline"
              className="rounded-full font-body"
            >
              <RotateCcwIcon className="w-4 h-4 mr-2" />
              {resetting ? 'A repor...' : 'Tentar de novo'}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="text-center py-12">
      <p className="text-muted-foreground font-body">A carregar processo...</p>
    </div>
  )
}
