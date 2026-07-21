import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export function useCoverage() {
  const [coverage, setCoverage] = useState<any>(null)

  useEffect(() => {
    supabase
      .from('coverage_snapshots')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => setCoverage(data))
  }, [])

  return coverage
}
