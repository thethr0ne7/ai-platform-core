import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export function useFactoryHealth() {
  const [health, setHealth] = useState<any>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('factory_runs').select('*').order('started_at', { ascending: false }).limit(5),
      supabase.from('gi_ingestion_runs').select('*').order('started_at', { ascending: false }).limit(5)
    ]).then(([factory, ingestion]) => {
      setHealth({
        factory: factory.data ?? [],
        ingestion: ingestion.data ?? []
      })
    })
  }, [])

  return health
}
