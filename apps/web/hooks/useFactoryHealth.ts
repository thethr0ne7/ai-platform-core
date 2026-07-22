'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

type HealthRun = Record<string, unknown>

type FactoryHealthData = {
  factory: HealthRun[]
  ingestion: HealthRun[]
}

type FactoryHealthState = {
  data: FactoryHealthData | null
  loading: boolean
  error: string | null
}

export function useFactoryHealth(): FactoryHealthState {
  const [state, setState] = useState<FactoryHealthState>({
    data: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let active = true

    async function load() {
      const [factory, ingestion] = await Promise.all([
        supabase.from('factory_runs').select('*').order('started_at', { ascending: false }).limit(5),
        supabase.from('gi_ingestion_runs').select('*').order('started_at', { ascending: false }).limit(5),
      ])

      if (!active) return

      const error = factory.error ?? ingestion.error

      setState({
        data: error
          ? null
          : {
              factory: (factory.data ?? []) as HealthRun[],
              ingestion: (ingestion.data ?? []) as HealthRun[],
            },
        loading: false,
        error: error?.message ?? null,
      })
    }

    void load()

    return () => {
      active = false
    }
  }, [])

  return state
}
