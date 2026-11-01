import { useEffect } from 'react'

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} · MoneyTrack` : 'MoneyTrack'
  }, [title])
}
