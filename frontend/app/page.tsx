import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AduMiniature } from '@/components/adu-miniature'
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  FileSearchIcon,
  FolderKanbanIcon,
  GitBranchIcon,
  LandmarkIcon,
  MapIcon,
  ShieldCheckIcon,
} from 'lucide-react'

const OPERATING_BLOCKS = [
  {
    title: 'Instrução administrativa',
    body: 'Confere peças escritas, elementos instrutórios, especialidades e pontos de aperfeiçoamento antes do pedido seguir.',
    icon: FolderKanbanIcon,
  },
  {
    title: 'Validação normativa',
    body: 'Cruza o RJUE, o RMUE de Viseu, NIPs municipais e o mínimo operacional do PDMV em artefactos separados e citáveis.',
    icon: ShieldCheckIcon,
  },
  {
    title: 'Resposta a correções',
    body: 'Organiza notificações, perguntas ao requerente e minuta de resposta por disciplina para a equipa projetista.',
    icon: ClipboardListIcon,
  },
]

const PIPELINE = [
  {
    step: '01',
    title: 'Leitura orientada do processo',
    body: 'CrossBeam indexa cadernos, notificações e peças de projeto sem despejar tudo no prompt principal.',
  },
  {
    step: '02',
    title: 'Roteamento por corpus oficial',
    body: 'Os agentes carregam apenas o conjunto relevante de RMUE, NIPs, PDMV e fontes nacionais para cada pergunta.',
  },
  {
    step: '03',
    title: 'Finding com evidência',
    body: 'Cada observação sai com área de revisão, categoria, escopo da fonte e estado de evidência.',
  },
  {
    step: '04',
    title: 'Pacote de saída pronto para equipa',
    body: 'A plataforma devolve minuta municipal, relatório de correções, perguntas em falta e anotações por peça.',
  },
]

export default function LandingPage() {
  return (
    <div className="bg-topo-lines">
      <nav className="relative z-10 mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <span className="heading-card text-primary">CrossBeam</span>
          <Badge variant="outline" className="text-[10px] tracking-wide">
            Viseu Urbanismo
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" className="font-body font-semibold text-primary border-primary/50">
            <Link href="/dashboard">
              Abrir demo
            </Link>
          </Button>
          <Button asChild className="font-body font-semibold">
            <a href="https://github.com/mikeOnBreeze/cc-crossbeam" target="_blank" rel="noopener noreferrer">
              <GitBranchIcon className="mr-2 h-4 w-4" />
              Repositório
            </a>
          </Button>
        </div>
      </nav>

      <section className="relative z-10 mx-auto grid max-w-6xl gap-10 px-4 pb-10 pt-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <div className="space-y-6 animate-fade-up">
          <Badge variant="outline" className="w-fit rounded-full px-4 py-1 text-[11px] tracking-[0.18em]">
            AGENTES PARA LICENCIAMENTO E APERFEIÇOAMENTO
          </Badge>
          <div className="space-y-4">
            <h1 className="heading-display text-foreground">
              Revisão técnica para
              <br />
              processos urbanísticos em Viseu
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground font-body">
              CrossBeam foi reescrito para o contexto municipal português: licenciamento, comunicação prévia,
              legalização e resposta a notificações com base rastreável no corpus oficial de Viseu.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground font-body">
            <span className="rounded-full bg-muted/60 px-4 py-2">
              <strong className="text-foreground">RMUE segmentado</strong> por tema
            </span>
            <span className="rounded-full bg-muted/60 px-4 py-2">
              <strong className="text-foreground">NIPs + PDMV</strong> como camada operacional
            </span>
            <span className="rounded-full bg-muted/60 px-4 py-2">
              <strong className="text-foreground">Outputs citados</strong> por escopo de fonte
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="rounded-full px-8 py-5 font-body font-bold">
              <Link href="/dashboard">
                Abrir cenários Viseu
                <ArrowRightIcon className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full px-8 py-5 font-body font-bold">
              <Link href="/login">
                Entrar
              </Link>
            </Button>
          </div>
        </div>

        <div className="animate-fade-up stagger-1">
          <div className="rounded-[2rem] border border-border/50 bg-[linear-gradient(160deg,rgba(255,253,248,0.98),rgba(244,239,231,0.94))] p-6 shadow-[0_20px_60px_rgba(28,25,23,0.08)]">
            <AduMiniature variant="hero" />
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-white/80 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground font-body">Gate atual</p>
                <p className="mt-1 text-sm font-semibold text-foreground font-body">Correções end-to-end</p>
              </div>
              <div className="rounded-2xl bg-white/80 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground font-body">Município</p>
                <p className="mt-1 text-sm font-semibold text-foreground font-body">Viseu</p>
              </div>
              <div className="rounded-2xl bg-white/80 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground font-body">Modelo</p>
                <p className="mt-1 text-sm font-semibold text-foreground font-body">Claude Opus 4.6</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8 flex items-center gap-3">
          <LandmarkIcon className="h-5 w-5 text-primary" />
          <h2 className="heading-section text-foreground">O que o produto faz agora</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {OPERATING_BLOCKS.map((block) => (
            <Card key={block.title} className="border-border/50 shadow-[0_8px_32px_rgba(28,25,23,0.06)]">
              <CardContent className="space-y-4 p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
                  <block.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="space-y-2">
                  <h3 className="heading-card text-foreground">{block.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground font-body">{block.body}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8 flex items-center gap-3">
          <MapIcon className="h-5 w-5 text-primary" />
          <h2 className="heading-section text-foreground">Pipeline Viseu</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-4">
          {PIPELINE.map((item) => (
            <Card key={item.step} className="border-border/50 shadow-[0_8px_32px_rgba(28,25,23,0.06)]">
              <CardContent className="space-y-4 p-6">
                <span className="inline-flex rounded-full bg-muted px-3 py-1 text-xs font-semibold text-primary">
                  {item.step}
                </span>
                <h3 className="heading-card text-foreground">{item.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground font-body">{item.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-6 lg:grid-cols-[1fr_1.05fr]">
          <Card className="border-border/50 shadow-[0_8px_32px_rgba(28,25,23,0.06)]">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center gap-3">
                <FileSearchIcon className="h-5 w-5 text-primary" />
                <h2 className="heading-card text-foreground">Corpus operacional</h2>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground font-body">
                O sandbox carrega camadas separadas para direito nacional, regulamentação municipal e
                requisitos operativos. Quando um fundamento ainda não existe no corpus, o sistema assume isso
                explicitamente com <code className="rounded bg-muted px-1.5 py-0.5 text-xs">[SOURCE NEEDED]</code>.
              </p>
              <div className="space-y-3">
                <div className="rounded-2xl bg-muted/50 p-4">
                  <p className="text-sm font-semibold text-foreground font-body">RMUE + NIPs</p>
                  <p className="mt-1 text-sm text-muted-foreground font-body">
                    Estruturados por procedimento, instrução documental, casos especiais e legalização.
                  </p>
                </div>
                <div className="rounded-2xl bg-muted/50 p-4">
                  <p className="text-sm font-semibold text-foreground font-body">PDMV mínimo operacional</p>
                  <p className="mt-1 text-sm text-muted-foreground font-body">
                    Estacionamento, classes de solo, condicionantes, enquadramento urbanístico e parâmetros de triagem.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-[0_8px_32px_rgba(28,25,23,0.06)]">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center gap-3">
                <CheckCircle2Icon className="h-5 w-5 text-primary" />
                <h2 className="heading-card text-foreground">Saídas de demo</h2>
              </div>
              <ul className="space-y-3 text-sm text-muted-foreground font-body">
                <li className="rounded-2xl bg-muted/50 p-4">
                  <strong className="text-foreground">Revisão municipal:</strong> minuta de ofício, findings por área e checklist com fontes.
                </li>
                <li className="rounded-2xl bg-muted/50 p-4">
                  <strong className="text-foreground">Aperfeiçoamento/correções:</strong> categorização, perguntas pendentes e relatório por disciplina.
                </li>
                <li className="rounded-2xl bg-muted/50 p-4">
                  <strong className="text-foreground">Resposta final:</strong> minuta ao município, scope técnico e anotações por peça.
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
