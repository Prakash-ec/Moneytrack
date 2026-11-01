import { useCallback, useState } from 'react'

const STORAGE_KEY = 'moneytrack-type-learnings'

export interface TypeLearning {
  merchant: string
  typeId: number
  typeName: string
  category: string | null
  count: number
  lastConfirmed: string
}

function loadLearnings(): TypeLearning[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
  } catch {
    // ignore storage errors
  }
  return []
}

function saveLearnings(learnings: TypeLearning[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(learnings))
  } catch {
    // ignore storage errors
  }
}

export function useTypeLearnings() {
  const [learnings, setLearnings] = useState<TypeLearning[]>(() => loadLearnings())

  const findByMerchant = useCallback(
    (merchant: string) => {
      if (!merchant) return undefined
      const key = merchant.trim().toLowerCase()
      return learnings.find((l) => l.merchant.trim().toLowerCase() === key)
    },
    [learnings],
  )

  const record = useCallback(
    (merchant: string, typeId: number, typeName: string, category: string | null) => {
      if (!merchant) return
      const key = merchant.trim().toLowerCase()
      setLearnings((current) => {
        const existing = current.find((l) => l.merchant.trim().toLowerCase() === key)
        const now = new Date().toISOString()
        let next: TypeLearning[]
        if (existing) {
          next = current.map((l) =>
            l.merchant.trim().toLowerCase() === key
              ? {
                  ...l,
                  typeId,
                  typeName,
                  category,
                  count: existing.count + 1,
                  lastConfirmed: now,
                }
              : l
          )
        } else {
          next = [
            ...current,
            {
              merchant: merchant.trim(),
              typeId,
              typeName,
              category,
              count: 1,
              lastConfirmed: now,
            },
          ]
        }
        saveLearnings(next)
        return next
      })
    },
    [],
  )

  const getSuggestedTypeId = useCallback(
    (merchant: string) => {
      const match = findByMerchant(merchant)
      return match ? match.typeId : undefined
    },
    [findByMerchant],
  )

  return { learnings, record, findByMerchant, getSuggestedTypeId }
}
