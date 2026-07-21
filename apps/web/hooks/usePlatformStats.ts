import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export function usePlatformStats() {
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    async function load() {
      const [institutions, programs, sources, jobs, runs] = await Promise.all([
        supabase.from('institutions').select('*', { count: 'exact', head: true }),
        supabase.from('programs').select('*', { count: 'exact', head: true }),
        supabase.from('sources').select('*', { count: 'exact', head: true }),
        supabase.from('ingestion_jobs').select('*', { count: 'exact', head: true }),
        supabase.from('factory_runs').select('*').order('started_at', { ascending: false }).limit(5)
      ])

      setData({
        institutions: institutions.count ?? 0,
        programs: programs.count ?? 0,
        sources: sources.count ?? 0,
        jobs: jobs.count ?? 0,
        runs: runs.data ?? []
      })
    }

    load()
  }, [])

  return data
}
