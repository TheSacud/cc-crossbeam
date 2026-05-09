'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Building2Icon,
  Loader2Icon,
  InboxIcon,
  CheckCircle2Icon,
  ClockIcon,
  AlertCircleIcon,
  CircleDotIcon,
  ChevronRightIcon,
} from 'lucide-react'
import { getStatusConfig, relativeTime, getAduImage } from '@/lib/status-utils'
import { cn } from '@/lib/utils'
import type { Project } from '@/types/database'

export function CityDashboard() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    supabase
      .schema('crossbeam')
      .from('projects')
      .select('*')
      .eq('is_demo', true)
      .eq('flow_type', 'city-review')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setProjects(data as Project[])
        setLoading(false)
      })
  }, [supabase])

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2Icon className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3">
        <InboxIcon className="w-10 h-10 text-muted-foreground/40" />
        <p className="text-muted-foreground font-body">Ainda não existem revisões municipais.</p>
      </div>
    )
  }

  const completed = projects.filter(p => p.status === 'completed').length
  const inReview = projects.filter(p =>
    ['processing', 'processing-phase1', 'processing-phase2'].includes(p.status)
  ).length
  const pending = projects.filter(p => ['ready', 'uploading', 'awaiting-answers'].includes(p.status)).length
  const failed = projects.filter(p => p.status === 'failed').length

  const stats = [
    { label: 'Concluídos', count: completed, icon: CheckCircle2Icon, color: 'text-primary' },
    { label: 'Em análise', count: inReview, icon: ClockIcon, color: 'text-amber-600' },
    { label: 'Prontos', count: pending, icon: CircleDotIcon, color: 'text-muted-foreground' },
    { label: 'Falhados', count: failed, icon: AlertCircleIcon, color: 'text-destructive' },
  ].filter(s => s.count > 0)

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Building2Icon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="heading-card text-foreground">Pedidos municipais</h2>
          <p className="text-sm text-muted-foreground font-body">
            {projects.length} processo{projects.length !== 1 ? 's' : ''} em carteira
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {stats.map(stat => (
          <div
            key={stat.label}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/50 border border-border/50"
          >
            <stat.icon className={cn('w-3.5 h-3.5', stat.color)} />
            <span className="text-xs font-semibold font-body text-foreground">{stat.count}</span>
            <span className="text-xs font-body text-muted-foreground">{stat.label}</span>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {projects.map(project => {
          const status = getStatusConfig(project.status)
          return (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="hover-lift shadow-[0_4px_16px_rgba(28,25,23,0.06)] border-border/50 cursor-pointer transition-all">
                <CardContent className="p-0">
                  <div className="flex items-center gap-4 px-5 py-4">
                    <div className="w-16 h-16 flex-shrink-0 flex items-center justify-center">
                      <Image
                        src={getAduImage(project.id)}
                        alt={project.project_name}
                        width={64}
                        height={64}
                        className="object-contain drop-shadow-sm"
                        quality={75}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-semibold text-foreground font-body truncate">
                          {project.project_name}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground font-body">
                        {project.project_address}{project.city ? `, ${project.city}` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground/70 font-body mt-0.5">
                        {project.applicant_name ? `Requerente: ${project.applicant_name}` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-4 flex-shrink-0">
                      <Badge
                        variant={status.variant}
                        className={cn('rounded-sm text-[10px] whitespace-nowrap', status.className)}
                      >
                        {status.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-body whitespace-nowrap w-16 text-right">
                        {relativeTime(project.created_at)}
                      </span>
                      <ChevronRightIcon className="w-4 h-4 text-muted-foreground/40" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
