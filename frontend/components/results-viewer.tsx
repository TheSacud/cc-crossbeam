'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { AduMiniature } from '@/components/adu-miniature'
import { Loader2Icon, ClockIcon, CpuIcon, DollarSignIcon, ArrowLeftIcon, FileSearchIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Output, FlowType, Json } from '@/types/database'

interface ResultsViewerProps {
  projectId: string
  flowType: FlowType
  pinnedOutputId?: string
}

type TabKey = string

type JsonRecord = { [key: string]: Json | undefined }

interface EvidenceEntry {
  id: string
  page: number | null
  desenho: number | null
  title: string
  description: string | null
  extracted_text: string | null
  evidence_type: string
  quote: string | null
  page_png_path: string | null
  title_block_png_path: string | null
  crop_path: string | null
  crop_storage_bucket: string | null
  crop_storage_path: string | null
}

interface EvidenceLinkedItem {
  title: string
  description: string | null
  determination_status: string | null
  source_reference: string | null
  evidence_refs: string[]
}

function asRecord(value: Json | null | undefined): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
}

function asArray(value: Json | null | undefined): Json[] {
  return Array.isArray(value) ? value : []
}

function asString(value: Json | null | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asNumber(value: Json | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function stringArray(value: Json | null | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : []
}

function statusLabel(value: string): string {
  const labels: Record<string, string> = {
    confirmed_non_compliance: 'Incumprimento confirmado',
    document_missing_or_incomplete: 'Documento em falta/incompleto',
    needs_official_source: 'Requer fonte oficial',
    inconclusive: 'Inconclusivo',
  }
  return labels[value] || value
}

function evidenceFromRecord(value: Json): EvidenceEntry | null {
  const record = asRecord(value)
  if (!record) return null
  const id = asString(record.id)
  if (!id) return null
  const page = asNumber(record.page)
  return {
    id,
    page,
    desenho: asNumber(record.desenho),
    title: asString(record.title) || (page ? `Página ${page}` : id),
    description: asString(record.description),
    extracted_text: asString(record.extracted_text),
    evidence_type: asString(record.evidence_type) || 'documento',
    quote: asString(record.quote),
    page_png_path: asString(record.page_png_path),
    title_block_png_path: asString(record.title_block_png_path),
    crop_path: asString(record.crop_path),
    crop_storage_bucket: asString(record.crop_storage_bucket),
    crop_storage_path: asString(record.crop_storage_path),
  }
}

function linkedItemFromRecord(value: Json): EvidenceLinkedItem | null {
  const record = asRecord(value)
  if (!record) return null
  const title = asString(record.title) || asString(record.description) || asString(record.topic) || asString(record.ref)
  if (!title) return null
  return {
    title,
    description: asString(record.description) || asString(record.topic),
    determination_status: asString(record.determination_status),
    source_reference: asString(record.source_reference),
    evidence_refs: stringArray(record.evidence_refs),
  }
}

function collectEvidence(output: Output | null): { evidence: EvidenceEntry[]; linkedItems: EvidenceLinkedItem[] } {
  if (!output) return { evidence: [], linkedItems: [] }

  const checklist = asRecord(output.review_checklist_json)
  const understanding = asRecord(output.project_understanding_json)
  const rawArtifacts = asRecord(output.raw_artifacts)
  const rawUnderstanding = asRecord(rawArtifacts?.['project_understanding.json'])
  const rawDraft = asRecord(rawArtifacts?.['draft_corrections.json'])

  const evidenceSource =
    asArray(checklist?.evidence_index).length > 0
      ? checklist?.evidence_index
      : asArray(understanding?.evidence_index).length > 0
        ? understanding?.evidence_index
        : rawUnderstanding?.evidence_index

  const evidence = asArray(evidenceSource)
    .map(evidenceFromRecord)
    .filter((entry): entry is EvidenceEntry => entry !== null)

  const linkedItems = [
    ...asArray(checklist?.blocking_issues),
    ...asArray(checklist?.additional_corrections),
    ...asArray(output.corrections_analysis_json),
    ...asArray(rawDraft?.blocking_issues),
  ]
    .map(linkedItemFromRecord)
    .filter((entry): entry is EvidenceLinkedItem => entry !== null)

  return { evidence, linkedItems }
}

function EvidencePanel({ output }: { output: Output }) {
  const { evidence, linkedItems } = useMemo(() => collectEvidence(output), [output])
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const evidenceById = new Map(evidence.map((entry) => [entry.id, entry]))

  useEffect(() => {
    const entries = evidence.filter((entry) => entry.crop_storage_bucket && entry.crop_storage_path)
    if (entries.length === 0) return
    let cancelled = false

    async function loadUrls() {
      const next: Record<string, string> = {}
      for (const entry of entries) {
        const res = await fetch('/api/storage/signed-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: output.project_id,
            bucket: entry.crop_storage_bucket,
            path: entry.crop_storage_path,
          }),
        })
        if (!res.ok) continue
        const data = await res.json()
        if (typeof data.signedUrl === 'string') {
          next[entry.id] = data.signedUrl
        }
      }
      if (!cancelled) setSignedUrls(next)
    }

    loadUrls().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [evidence, output.project_id])

  if (evidence.length === 0 && linkedItems.length === 0) {
    return <div className="text-sm text-muted-foreground font-body">Sem índice de evidência estruturado neste output.</div>
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <FileSearchIcon className="w-4 h-4 text-primary" />
          <h2 className="heading-card text-foreground">Evidências documentais</h2>
        </div>
        <div className="grid gap-3">
          {evidence.map((entry) => (
            <div key={entry.id} className="rounded-md border border-border/60 bg-background/60 p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm font-body">
                <span className="font-semibold text-foreground">{entry.id}</span>
                <span className="text-muted-foreground">{entry.evidence_type}</span>
                {entry.page && <span className="text-muted-foreground">Página {entry.page}</span>}
                {entry.desenho && <span className="text-muted-foreground">Desenho {entry.desenho}</span>}
              </div>
              <div className="mt-1 font-body text-sm text-foreground">{entry.title}</div>
              {entry.description && <p className="mt-2 text-sm text-muted-foreground font-body">{entry.description}</p>}
              {signedUrls[entry.id] && (
                <div className="mt-3 overflow-hidden rounded-md border border-border/60 bg-muted/20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={signedUrls[entry.id]} alt={entry.title} className="max-h-72 w-full object-contain" />
                </div>
              )}
              {entry.quote && <p className="mt-2 text-sm text-muted-foreground font-body">{entry.quote}</p>}
              {!entry.quote && entry.extracted_text && (
                <p className="mt-2 text-sm text-muted-foreground font-body">{entry.extracted_text}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-mono text-muted-foreground">
                {entry.crop_path && <span>{entry.crop_path}</span>}
                {!entry.crop_path && entry.page_png_path && <span>{entry.page_png_path}</span>}
                {entry.title_block_png_path && <span>{entry.title_block_png_path}</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {linkedItems.length > 0 && (
        <section className="space-y-3">
          <h2 className="heading-card text-foreground">Conclusões ligadas</h2>
          <div className="space-y-3">
            {linkedItems.map((item, index) => (
              <div key={`${item.title}-${index}`} className="rounded-md border border-border/60 bg-muted/20 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-body text-sm font-semibold text-foreground">{item.title}</h3>
                  {item.determination_status && (
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                      {statusLabel(item.determination_status)}
                    </span>
                  )}
                </div>
                {item.description && <p className="mt-2 text-sm text-muted-foreground font-body">{item.description}</p>}
                {item.source_reference && <p className="mt-2 text-xs text-muted-foreground font-body">{item.source_reference}</p>}
                {item.evidence_refs.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.evidence_refs.map((ref) => {
                      const linked = evidenceById.get(ref)
                      return (
                        <span key={ref} className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-body text-primary">
                          {linked ? `${ref} - ${linked.title}` : ref}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export function ResultsViewer({ projectId, flowType, pinnedOutputId }: ResultsViewerProps) {
  const [output, setOutput] = useState<Output | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('')
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    const query = pinnedOutputId
      ? supabase.schema('crossbeam').from('outputs').select('*').eq('id', pinnedOutputId).single()
      : supabase.schema('crossbeam').from('outputs').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).single()

    query.then(({ data }) => {
      if (data) {
        setOutput(data as Output)
        if (flowType === 'city-review') {
          setActiveTab('corrections_letter_md')
        } else {
          setActiveTab('response_letter_md')
        }
      }
      setLoading(false)
    })
  }, [projectId, flowType, supabase, pinnedOutputId])

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2Icon className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  if (!output) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground font-body">Ainda não existem resultados.</p>
      </div>
    )
  }

  const evidenceSummary = collectEvidence(output)
  const hasEvidence = evidenceSummary.evidence.length > 0 || evidenceSummary.linkedItems.length > 0
  const tabs = flowType === 'city-review'
    ? [
        { key: 'corrections_letter_md', label: 'Minuta municipal' },
        ...(hasEvidence ? [{ key: 'evidence', label: 'Evidências' }] : []),
      ]
    : [
        { key: 'response_letter_md', label: 'Resposta ao município' },
        { key: 'professional_scope_md', label: 'Scope técnico' },
        { key: 'corrections_report_md', label: 'Relatório de correções' },
        { key: 'sheet_annotations_json', label: 'Anotações' },
      ]

  if (hasEvidence && !tabs.some((tab) => tab.key === 'evidence')) {
    tabs.push({ key: 'evidence', label: 'Evidências' })
  }

  const getContent = (key: string): string | null => {
    const value = output[key as keyof Output]
    if (typeof value === 'string') return value
    if (value && typeof value === 'object') return JSON.stringify(value, null, 2)
    return null
  }

  const formatDuration = (ms: number | null) => {
    if (!ms) return '--'
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}m ${seconds}s`
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="animate-fade-up">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground font-body transition-colors mb-4"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Voltar aos cenários
        </Link>

        <div className="text-center">
          <div className="flex justify-center">
            <AduMiniature variant="accent" />
          </div>
          <h1 className="heading-display text-foreground -mt-3">
            {flowType === 'city-review'
              ? 'Revisão concluída'
              : 'Pacote de resposta pronto'}
          </h1>
        </div>
      </div>

      <div className="flex items-center justify-center gap-6 py-3 px-6 rounded-full bg-muted/40 border border-border/50 max-w-lg mx-auto">
        <div className="flex items-center gap-2 text-sm font-body">
          <ClockIcon className="w-4 h-4 text-primary" />
          <span className="text-muted-foreground">Duração</span>
          <span className="text-foreground font-semibold">{formatDuration(output.agent_duration_ms)}</span>
        </div>
        <div className="w-px h-4 bg-border/50" />
        <div className="flex items-center gap-2 text-sm font-body">
          <CpuIcon className="w-4 h-4 text-primary" />
          <span className="text-muted-foreground">Turnos</span>
          <span className="text-foreground font-semibold">{output.agent_turns ?? '--'}</span>
        </div>
        <div className="w-px h-4 bg-border/50" />
        <div className="flex items-center gap-2 text-sm font-body">
          <DollarSignIcon className="w-4 h-4 text-primary" />
          <span className="text-muted-foreground">Custo</span>
          <span className="text-foreground font-semibold">
            {output.agent_cost_usd ? `$${output.agent_cost_usd.toFixed(2)}` : '--'}
          </span>
        </div>
      </div>

      {tabs.length > 1 && (
        <div className="flex gap-1 border-b border-border/50">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-4 py-2.5 text-sm font-body font-semibold transition-colors',
                activeTab === tab.key
                  ? 'text-foreground border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <Card className="shadow-[0_8px_32px_rgba(28,25,23,0.08)] border-border/50">
        <CardContent className="p-8">
          {activeTab === 'evidence' ? (
            <EvidencePanel output={output} />
          ) : (
          <div className="prose-crossbeam">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {getContent(activeTab) || 'Sem conteúdo disponível para este separador.'}
            </ReactMarkdown>
          </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
