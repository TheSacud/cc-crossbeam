'use client'

import { useEffect, useState } from 'react'
import { DEMO_CITY_PROJECT_ID, DEMO_CONTRACTOR_PROJECT_ID } from '@/lib/dev-fixtures'

type FlowKey = 'city' | 'contractor'
type DemoStatus = 'ready' | 'processing' | 'processing-phase1' | 'awaiting-answers' | 'processing-phase2' | 'completed' | 'failed'

const FLOW_STATES: Record<FlowKey, DemoStatus[]> = {
  city: ['ready', 'processing', 'completed', 'failed'],
  contractor: ['ready', 'processing-phase1', 'awaiting-answers', 'processing-phase2', 'completed', 'failed'],
}

export function DevTools() {
  const [collapsed, setCollapsed] = useState(false)
  const [flow, setFlow] = useState<FlowKey>('contractor')
  const [stateIndex, setStateIndex] = useState(0)

  const states = FLOW_STATES[flow]
  const currentState = states[stateIndex]

  useEffect(() => {
    setStateIndex(0)
  }, [flow])

  const currentProjectId = flow === 'city' ? DEMO_CITY_PROJECT_ID : DEMO_CONTRACTOR_PROJECT_ID

  const dispatchState = (status: DemoStatus) => {
    window.dispatchEvent(new CustomEvent('devtools-state-change', {
      detail: {
        status,
        projectId: currentProjectId,
      },
    }))
  }

  const stepBack = () => {
    const nextIndex = Math.max(stateIndex - 1, 0)
    setStateIndex(nextIndex)
    dispatchState(states[nextIndex])
  }

  const stepForward = () => {
    const nextIndex = Math.min(stateIndex + 1, states.length - 1)
    setStateIndex(nextIndex)
    dispatchState(states[nextIndex])
  }

  const switchFlow = (nextFlow: FlowKey) => {
    setFlow(nextFlow)
    const nextState = FLOW_STATES[nextFlow][0]
    window.dispatchEvent(new CustomEvent('devtools-state-change', {
      detail: {
        status: nextState,
        projectId: nextFlow === 'city' ? DEMO_CITY_PROJECT_ID : DEMO_CONTRACTOR_PROJECT_ID,
      },
    }))
  }

  const emitPhase = (phase: number) => {
    window.dispatchEvent(new CustomEvent('devtools-phase', {
      detail: { phase },
    }))
  }

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed bottom-4 right-4 z-50 rounded-full bg-foreground px-4 py-2 text-xs font-bold tracking-wide text-primary-foreground shadow-xl"
      >
        DEV
      </button>
    )
  }

  const phaseCount = flow === 'city' ? 4 : 5

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div
        className="w-80 overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        style={{ fontSize: '13px' }}
      >
        <div className="flex items-center justify-between bg-foreground px-3 py-2 text-primary-foreground">
          <span className="text-xs font-bold tracking-wide">DEV TOOLS</span>
          <div className="flex gap-1">
            <button
              onClick={() => setCollapsed(true)}
              className="flex h-5 w-5 items-center justify-center rounded text-xs hover:bg-white/20"
            >
              _
            </button>
            <button
              onClick={() => setCollapsed(true)}
              className="flex h-5 w-5 items-center justify-center rounded text-xs hover:bg-white/20"
            >
              x
            </button>
          </div>
        </div>

        <div className="space-y-3 p-3">
          <div className="flex gap-1">
            <button
              onClick={() => switchFlow('city')}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                flow === 'city'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Revisão municipal
            </button>
            <button
              onClick={() => switchFlow('contractor')}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                flow === 'contractor'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Aperfeiçoamento
            </button>
          </div>

          <div>
            <div className="mb-1 text-xs text-muted-foreground">Estado</div>
            <div className="flex items-center gap-2">
              <button
                onClick={stepBack}
                disabled={stateIndex === 0}
                className="flex h-7 w-7 items-center justify-center rounded-md bg-muted font-bold text-foreground hover:bg-muted/80 disabled:opacity-30"
              >
                &lt;
              </button>
              <div className="flex-1 text-center">
                <span className="font-bold text-foreground">{currentState}</span>
                <span className="ml-1 text-muted-foreground">
                  ({stateIndex + 1}/{states.length})
                </span>
              </div>
              <button
                onClick={stepForward}
                disabled={stateIndex === states.length - 1}
                className="flex h-7 w-7 items-center justify-center rounded-md bg-muted font-bold text-foreground hover:bg-muted/80 disabled:opacity-30"
              >
                &gt;
              </button>
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs text-muted-foreground">Fase</div>
            <div className="grid grid-cols-5 gap-1">
              {Array.from({ length: phaseCount }).map((_, index) => (
                <button
                  key={index}
                  onClick={() => emitPhase(index)}
                  className="rounded-md bg-muted px-2 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/80"
                >
                  {index + 1}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
