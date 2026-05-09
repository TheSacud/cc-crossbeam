'use client'

import { useState, useEffect, useId } from 'react'

/**
 * Returns a random demo visual from the pool.
 * - SSR: deterministic pick based on useId() hash (no hydration mismatch)
 * - Client: randomizes on mount for true per-visit variety
 * - Multiple instances on same page get different images via useId() salt
 */
export function useRandomAdu(pool: string[]): string {
  const id = useId()

  const [selected, setSelected] = useState(() => {
    let hash = 0
    for (let i = 0; i < id.length; i++) {
      hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0
    }
    return pool[Math.abs(hash) % pool.length]
  })

  useEffect(() => {
    setSelected(pool[Math.floor(Math.random() * pool.length)])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return selected
}
