'use client'

import { PersonaCard } from '@/components/persona-card'
import { useAppMode } from '@/hooks/use-app-mode'
import { useRandomAdu } from '@/hooks/use-random-adu'
import {
  DEMO_CITY_PROJECT_ID,
  DEMO_CONTRACTOR_PROJECT_ID,
} from '@/lib/dev-fixtures'
import {
  JUDGE_CITY_PROJECT_ID,
  JUDGE_CONTRACTOR_PROJECT_ID,
  SHOWCASE_CITY_OUTPUT_ID,
  SHOWCASE_CONTRACTOR_OUTPUT_ID,
} from '@/lib/app-mode'
import { RocketIcon } from 'lucide-react'

const PERSONA_POOL = [
  '/images/viseu/review-board.svg',
  '/images/viseu/corrections-stack.svg',
  '/images/viseu/response-package.svg',
]

export default function DashboardPage() {
  const mode = useAppMode()

  const cityId = mode === 'dev-test' ? DEMO_CITY_PROJECT_ID : JUDGE_CITY_PROJECT_ID
  const contractorId = mode === 'dev-test' ? DEMO_CONTRACTOR_PROJECT_ID : JUDGE_CONTRACTOR_PROJECT_ID

  const cityAdu = useRandomAdu(PERSONA_POOL)
  const contractorAdu = useRandomAdu(PERSONA_POOL)

  if (mode === 'real') {
    return (
      <div className="space-y-6 animate-fade-up">
        <div className="text-center space-y-2 pt-2">
          <h1 className="heading-display text-foreground">Os seus processos</h1>
          <p className="text-muted-foreground text-lg font-body">
            Carregue um processo e arranque uma nova análise
          </p>
        </div>
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <RocketIcon className="w-12 h-12 text-muted-foreground/40" />
          <p className="text-muted-foreground font-body text-center max-w-md">
            A criação completa de processos ainda está a ser preparada.
            Mude para <span className="font-semibold text-foreground">Judge Demo</span> para testar os
            cenários Viseu já pré-carregados.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="text-center space-y-2 pt-2">
        <h1 className="heading-display text-foreground">Escolha a perspetiva</h1>
        <p className="text-muted-foreground text-lg font-body">
          {mode === 'dev-test'
            ? 'Modo de desenvolvimento com dados simulados'
            : 'Escolha um cenário Viseu para executar o agente'}
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-2 max-w-4xl mx-auto">
        <PersonaCard
          aduImage={cityAdu}
          title="Município"
          description="Estou a fazer a triagem de um pedido urbanístico. Quero uma revisão orientada por RMUE, PDMV e instrução administrativa."
          projectName="Pedido de licenciamento - Rua do Serrado 14"
          projectCity="Viseu"
          projectId={cityId}
          ctaText="Executar revisão"
          showcaseOutputId={mode === 'judge-demo' ? SHOWCASE_CITY_OUTPUT_ID : undefined}
        />
        <PersonaCard
          aduImage={contractorAdu}
          title="Equipa projetista"
          description="Recebi uma notificação de aperfeiçoamento. Quero perceber o que falta, o que exige revisão técnica e como responder ao município."
          projectName="Resposta a aperfeiçoamento - Quinta das Regadas"
          projectCity="Viseu"
          projectId={contractorId}
          ctaText="Analisar notificação"
          showcaseOutputId={mode === 'judge-demo' ? SHOWCASE_CONTRACTOR_OUTPUT_ID : undefined}
        />
      </div>
    </div>
  )
}
