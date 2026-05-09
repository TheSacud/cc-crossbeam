import type { ProjectStatus } from '@/types/database'

interface StatusConfig {
  label: string
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
  className?: string
}

export function getStatusConfig(status: ProjectStatus): StatusConfig {
  switch (status) {
    case 'completed':
      return { label: 'Concluido', variant: 'default' }
    case 'processing':
    case 'processing-phase1':
    case 'processing-phase2':
      return { label: 'Em analise', variant: 'secondary', className: 'bg-amber-100 text-amber-800 border-amber-200' }
    case 'awaiting-answers':
      return { label: 'A aguardar elementos', variant: 'secondary', className: 'bg-blue-100 text-blue-800 border-blue-200' }
    case 'ready':
    case 'uploading':
      return { label: 'Pronto', variant: 'outline' }
    case 'failed':
      return { label: 'Falhou', variant: 'destructive' }
    default:
      return { label: status, variant: 'outline' }
  }
}

export function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `ha ${diffMin} min`
  if (diffHr < 24) return `ha ${diffHr} h`
  if (diffDays === 1) return 'ontem'
  if (diffDays < 30) return `ha ${diffDays} d`
  return new Date(dateStr).toLocaleDateString()
}

const DEMO_IMAGE_POOL = [
  '/images/viseu/review-board.svg',
  '/images/viseu/corrections-stack.svg',
  '/images/viseu/response-package.svg',
]

export function getAduImage(projectId: string): string {
  let hash = 0
  for (let i = 0; i < projectId.length; i++) {
    hash = ((hash << 5) - hash) + projectId.charCodeAt(i)
    hash |= 0
  }
  const index = Math.abs(hash) % DEMO_IMAGE_POOL.length
  return DEMO_IMAGE_POOL[index]
}
