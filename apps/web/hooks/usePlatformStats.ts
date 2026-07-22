'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

type FactoryRun = {
  id?: string
  status?: string
  started_at?: string
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

export function usePlatformStats(): PlatformStatsState {
  const [state, setState] = useState<PlatformStatsState>({
    data: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let active = true

    async function load() {
      const [institutions, programs, sources, jobs, runs] = await Promise.all([
        supabase.from('institutions').select('*', { count: 'exact', head: true }),
        supabase.from('programs').select('*', { count: 'exact', head: true }),
        supabase.from('sources').select('*', { count: 'exact', head: true }),
        supabase.from('ingestion_jobs').select('*', { count: 'exact', head: true }),
        supabase
          .from('factory_runs')
          .select('*', { count: 'exact' })
          .order('started_at', { ascending: false })
          .limit(5),
      ])

      if (!active) return

      const firstError = [institutions, programs, sources, jobs, runs].find(
        (result) => result.error,
      )?.error

      if (firstError) {
        setState({ data: null, loading: false, error: firstError.message })
        return
      }

      setState({
        data: {
          institutions_total: institutions.count ?? 0,
          programs_total: programs.count ?? 0,
          sources_total: sources.count ?? 0,
          ingestion_jobs_total: jobs.count ?? 0,
          factory_runs_total: runs.count ?? 0,
          recent_runs: (runs.data ?? []) as FactoryRun[],
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
