import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

interface RefreshContextValue {
  version: number
  invalidate: () => void
}

const RefreshContext = createContext<RefreshContextValue | null>(null)

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0)
  const invalidate = useCallback(() => setVersion((current) => current + 1), [])
  const value = useMemo(() => ({ version, invalidate }), [version, invalidate])

  return <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>
}

export function useRefreshVersion(): number {
  const value = useContext(RefreshContext)
  if (!value) throw new Error('useRefreshVersion must be used inside RefreshProvider')
  return value.version
}

export function useDataRefresh(): RefreshContextValue {
  const value = useContext(RefreshContext)
  if (!value) throw new Error('useDataRefresh must be used inside RefreshProvider')
  return value
}
