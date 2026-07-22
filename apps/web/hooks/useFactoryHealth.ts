'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

type HealthRun = Record<string, unknown>

type FactoryHealthData = {
  factory: HealthRun[]
  ingestion: HealthRun[]
  snapshot?: Record<string, unknown>
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
      const { data, error } = await supabase.rpc('get_factory_health')

      if (!active) return

      if (error) {
        setState({ data: null, loading: false, error: 'Не удалось получить состояние системы.' })
        return
      }

      const value = (data ?? {}) as Partial<FactoryHealthData>
      setState({
        data: {
          factory: Array.isArray(value.factory) ? value.factory : [],
          ingestion: Array.isArray(value.ingestion) ? value.ingestion : [],
          snapshot: value.snapshot ?? {},
        },
        loading: false,
        error: null,
      })
    }

    void load()

    return () => {
      active = false
    }
  }, [])

  return state
}
