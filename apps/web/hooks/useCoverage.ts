'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

type CoverageSnapshot = Record<string, unknown>

type CoverageState = {
  data: CoverageSnapshot | null
  loading: boolean
  error: string | null
}

export function useCoverage(): CoverageState {
  const [state, setState] = useState<CoverageState>({
    data: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let active = true

    async function load() {
      const { data, error } = await supabase
        .from('coverage_snapshots')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!active) return

      setState({
        data: (data as CoverageSnapshot | null) ?? null,
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
