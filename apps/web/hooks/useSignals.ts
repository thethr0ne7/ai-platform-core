'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

type Signal = Record<string, unknown>

type SignalsState = {
  data: Signal[]
  loading: boolean
  error: string | null
}

export function useSignals(): SignalsState {
  const [state, setState] = useState<SignalsState>({
    data: [],
    loading: true,
    error: null,
  })

  useEffect(() => {
    let active = true

    async function load() {
      const { data, error } = await supabase
        .from('gi_analytic_signals')
        .select('*')
        .order('confidence', { ascending: false })
        .limit(20)

      if (!active) return

      setState({
        data: (data ?? []) as Signal[],
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
