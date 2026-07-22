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
      const { data, error } = await supabase.rpc('get_analytic_signals', { p_limit: 20 })

      if (!active) return

      setState({
        data: error ? [] : ((data ?? []) as Signal[]),
        loading: false,
        error: error ? 'Не удалось получить новые изменения и сигналы.' : null,
      })
    }

    void load()

    return () => {
      active = false
    }
  }, [])

  return state
}
