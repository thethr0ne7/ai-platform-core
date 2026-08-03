'use client'

import { useEffect, useState } from 'react'
import {
  getReviewerIntelligenceOverview,
  type IntelligenceOverview,
} from '@/lib/reviewer-intelligence'

export function useGovernmentIntelligence() {
  const [data, setData] = useState<IntelligenceOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const overview = await getReviewerIntelligenceOverview()
        if (!active) return
        setData(overview)
        setError(null)
      } catch (requestError) {
        if (!active) return
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Не удалось получить состояние аналитического ядра.',
        )
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [])

  return { data, loading, error }
}
