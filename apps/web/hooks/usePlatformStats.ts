'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

type FactoryRun = {
  id?: string
  run_label?: string
  mode?: string
  status?: string
  started_at?: string
  finished_at?: string
}

type PlatformStats = {
  institutions_total: number
  programs_total: number
  sources_total: number
  ingestion_jobs_total: number
  factory_runs_total: number
  recent_runs: FactoryRun[]
}

type PlatformStatsState = {
  data: PlatformStats | null
  loading: boolean
  error: string | null
}

const emptyStats: PlatformStats = {
  institutions_total: 0,
  programs_total: 0,
  sources_total: 0,
  ingestion_jobs_total: 0,
  factory_runs_total: 0,
  recent_runs: [],
}

export function usePlatformStats(): PlatformStatsState {
  const [state, setState] = useState<PlatformStatsState>({
    data: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let active = true

    async function load() {
      const { data, error } = await supabase.rpc('get_platform_overview')

      if (!active) return

      if (error) {
        setState({ data: null, loading: false, error: 'Не удалось получить общие показатели платформы.' })
        return
      }

      const value = (data ?? {}) as Partial<PlatformStats>
      setState({
        data: {
          ...emptyStats,
          ...value,
          recent_runs: Array.isArray(value.recent_runs) ? value.recent_runs : [],
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
