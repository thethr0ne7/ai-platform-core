'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export type IntelligenceOverview = {
  engine_version?: string
  epistemic_contract?: Record<string, boolean>
  totals?: Record<string, number>
  run_statuses?: Array<Record<string, unknown>>
  entity_types?: Array<Record<string, unknown>>
  signal_types?: Array<Record<string, unknown>>
  relation_types?: Array<Record<string, unknown>>
  trajectories?: Array<Record<string, unknown>>
  narratives?: Array<Record<string, unknown>>
  forecasts?: Array<Record<string, unknown>>
  decision_cards?: Array<Record<string, unknown>>
  latest_runs?: Array<Record<string, unknown>>
  generated_at?: string
}

export function useGovernmentIntelligence() {
  const [data, setData] = useState<IntelligenceOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      const result = await supabase.rpc('get_government_intelligence_overview')
      if (!active) return
      if (result.error) {
        setError('Не удалось получить состояние аналитического ядра.')
        setLoading(false)
        return
      }
      setData((result.data ?? {}) as IntelligenceOverview)
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [])

  return { data, loading, error }
}
