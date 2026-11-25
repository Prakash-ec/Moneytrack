import { useCallback, useEffect, useRef, useState } from 'react'

import { useRefreshVersion } from '@/providers/RefreshProvider'

/**
 * Module-level shared cache for API query results.
 * Keys are JSON-stringified query arrays; values are { data, expiry }.
 * Used by useApiQuery for stale-while-revalidate on navigation.
 * Explicit refetch() or invalidate() always bypasses the cache to fetch fresh data.
 */
const apiCache: Map<string, { data: unknown; expiry: number }> = new Map()
const CACHE_TTL_MS = 60_000

interface UseApiQueryResult<T> {
  data: T | null
  error: Error | null
  loading: boolean
  refreshing: boolean
  refetch: () => void
}

/**
 * Clears the entire API cache. Call on user login, registration, logout,
 * or auth revocation to prevent cross-user data leakage.
 */
export function clearApiCache(): void {
  apiCache.clear()
}

export function useApiQuery<T>(
  key: unknown[],
  loader: () => Promise<T>,
  options: { enabled?: boolean; useCache?: boolean } = {},
): UseApiQueryResult<T> {
  const enabled = options.enabled ?? true
  const useCache = options.useCache ?? true
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
  const previousTrigger = useRef<{ version: number; localVersion: number } | null>(null)
  const hasData = useRef(false)

  const refetch = useCallback(() => setLocalVersion((current) => current + 1), [])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      setRefreshing(false)
      return
    }

    const keyChanged = previousKey.current !== keyString
    const triggerChanged =
      previousTrigger.current !== null &&
      (previousTrigger.current.version !== version ||
        previousTrigger.current.localVersion !== localVersion)
    previousKey.current = keyString
    previousTrigger.current = { version, localVersion }

    let active = true
    const now = Date.now()
    const cached = useCache && !triggerChanged ? apiCache.get(keyString) : undefined
    const hasFreshCache = Boolean(cached && now < cached.expiry)

    if (hasFreshCache && cached) {
      hasData.current = true
      setData(cached.data as T)
      setError(null)
      setLoading(false)
      setRefreshing(true)
    } else if (keyChanged) {
      hasData.current = false
      setData(null)
      setError(null)
      setLoading(true)
      setRefreshing(false)
    } else if (hasData.current) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    loaderRef
      .current()
      .then((result) => {
        if (useCache) {
          apiCache.set(keyString, { data: result, expiry: Date.now() + CACHE_TTL_MS })
        }
        if (!active) return
        hasData.current = true
        setData(result)
        setError(null)
      })
      .catch((caught: unknown) => {
        if (!active) return
        if (!hasFreshCache) {
          setError(caught instanceof Error ? caught : new Error('Something went wrong.'))
        }
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
        setRefreshing(false)
      })

    return () => {
      active = false
    }
  }, [keyString, enabled, version, localVersion, useCache])

  return { data, error, loading, refreshing, refetch }
}
