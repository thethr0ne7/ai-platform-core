import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export function useSignals() {
  const [signals, setSignals] = useState<any[]>([])

  useEffect(() => {
    supabase
      .from('gi_analytic_signals')
      .select('*')
      .order('confidence', { ascending: false })
      .limit(20)
      .then(({ data }) => setSignals(data ?? []))
  }, [])

  return signals
}
