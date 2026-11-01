import { api } from '@/services/api'
import type { ExpenseCreateInput } from '@/types/api'

export interface QueuedExpense {
  client_id: string
  idempotency_key: string
  payload: ExpenseCreateInput
  created_at: string
  retry_count: number
  last_error?: string
}

const STORAGE_KEY = 'moneytrack_offline_queue'

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function getOfflineQueue(): QueuedExpense[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as QueuedExpense[]
  } catch {
    return []
  }
}

function saveOfflineQueue(items: QueuedExpense[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    window.dispatchEvent(new CustomEvent('moneytrack:offline-queue-changed', { detail: items }))
  } catch {
    // quota exceeded
  }
}

export function enqueueOfflineExpense(payload: ExpenseCreateInput): QueuedExpense {
  const item: QueuedExpense = {
    client_id: generateUUID(),
    idempotency_key: `client-${generateUUID()}`,
    payload,
    created_at: new Date().toISOString(),
    retry_count: 0,
  }
  const current = getOfflineQueue()
  current.push(item)
  saveOfflineQueue(current)
  return item
}

export function removeOfflineExpense(clientId: string): void {
  const current = getOfflineQueue()
  const filtered = current.filter((item) => item.client_id !== clientId)
  saveOfflineQueue(filtered)
}

export async function flushOfflineQueue(): Promise<{ synced: number; failed: number }> {
  const queue = getOfflineQueue()
  if (queue.length === 0) return { synced: 0, failed: 0 }

  let synced = 0
  let failed = 0
  const remaining: QueuedExpense[] = []

  for (const item of queue) {
    try {
      await api.createExpense(item.payload, item.idempotency_key)
      synced += 1
    } catch (err: unknown) {
      failed += 1
      const errMsg = err instanceof Error ? err.message : 'Failed to sync'
      remaining.push({
        ...item,
        retry_count: item.retry_count + 1,
        last_error: errMsg,
      })
    }
  }

  saveOfflineQueue(remaining)
  return { synced, failed }
}
