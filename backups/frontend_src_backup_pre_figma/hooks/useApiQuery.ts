import { useCallback, useEffect, useRef, useState } from 'react'

import { useRefreshVersion } from '@/providers/RefreshProvider'

interface UseApiQueryResult<T> {
  data: T | null
  error: Error | null
  loading: boolean
  refreshing: boolean
  refetch: () => void
}

export function useApiQuery<T>(
  key: unknown[],
  loader: () => Promise<T>,
  options: { enabled?: boolean } = {},
): UseApiQueryResult<T> {
  const enabled = options.enabled ?? true
  const version = useRefreshVersion()
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [refreshing, setRefreshing] = useState(false)
  const [localVersion, setLocalVersion] = useState(0)
  const loaderRef = useRef(loader)
  loaderRef.current = loader
  const keyString = JSON.stringify(key)
  const previousKey = useRef<string | null>(null)
  const hasData = useRef(false)

  const refetch = useCallback(() => setLocalVersion((current) => current + 1), [])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }

    const keyChanged = previousKey.current !== keyString
    previousKey.current = keyString
    if (keyChanged) {
      hasData.current = false
      setData(null)
      setError(null)
      setLoading(true)
    } else if (hasData.current) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    let active = true
    loaderRef
      .current()
      .then((result) => {
        if (!active) return
        hasData.current = true
        setData(result)
        setError(null)
      })
      .catch((caught: unknown) => {
        if (!active) return
        setError(caught instanceof Error ? caught : new Error('Something went wrong.'))
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
        setRefreshing(false)
      })

    return () => {
      active = false
    }
  }, [keyString, enabled, version, localVersion])

  return { data, error, loading, refreshing, refetch }
}
