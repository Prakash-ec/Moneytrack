import { api } from '@/services/api'
import { getStoredUser } from '@/services/auth'
import type { ExpenseCreateInput, IncomeCreateInput } from '@/types/api'

export interface QueuedExpense {
  type?: 'expense'
  client_id: string
  idempotency_key: string
  user_id?: number | null
  payload: ExpenseCreateInput
  created_at: string
  retry_count: number
  last_error?: string
}

export interface QueuedIncome {
  type: 'income'
  client_id: string
  idempotency_key: string
  user_id?: number | null
  payload: IncomeCreateInput
  created_at: string
  retry_count: number
  last_error?: string
}

export type QueuedTransaction = QueuedExpense | QueuedIncome

const LEGACY_STORAGE_KEY = 'moneytrack_offline_queue'

function getQueueStorageKey(userId?: number | null): string {
  if (userId !== undefined && userId !== null) {
    return `moneytrack_offline_queue_user_${userId}`
  }
  const current = getStoredUser()
  if (current?.id) {
    return `moneytrack_offline_queue_user_${current.id}`
  }
  return 'moneytrack_offline_queue_anon'
}

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

/**
 * Migrates any legacy un-partitioned offline items to the active user's partition.
 */
function migrateLegacyQueue(key: string, activeUserId: number | null): void {
  if (typeof localStorage === 'undefined') return
  try {
    const rawLegacy = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!rawLegacy) return
    const legacyItems = JSON.parse(rawLegacy) as QueuedTransaction[]
    if (Array.isArray(legacyItems) && legacyItems.length > 0) {
      const targetRaw = localStorage.getItem(key)
      const existing = targetRaw ? (JSON.parse(targetRaw) as QueuedTransaction[]) : []
      const merged = [
        ...existing,
        ...legacyItems.map((item) => ({ ...item, user_id: item.user_id ?? activeUserId })),
      ]
      localStorage.setItem(key, JSON.stringify(merged))
    }
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    // ignore parse error
  }
}

export function getOfflineQueue(userId?: number | null): QueuedTransaction[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const activeUserId = userId !== undefined ? userId : (getStoredUser()?.id ?? null)
    const key = getQueueStorageKey(activeUserId)
    migrateLegacyQueue(key, activeUserId)
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const items = JSON.parse(raw) as QueuedTransaction[]
    // Enforce strict user isolation in memory
    return items.filter((item) => {
      if (activeUserId !== null && item.user_id != null) {
        return item.user_id === activeUserId
      }
      return true
    })
  } catch {
    return []
  }
}

export function saveOfflineQueue(items: QueuedTransaction[], userId?: number | null): void {
  if (typeof localStorage === 'undefined') return
  try {
    const activeUserId = userId !== undefined ? userId : (getStoredUser()?.id ?? null)
    const key = getQueueStorageKey(activeUserId)
    localStorage.setItem(key, JSON.stringify(items))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('moneytrack:offline-queue-changed', {
          detail: { userId: activeUserId, items },
        })
      )
    }
  } catch {
    // quota exceeded or disabled
  }
}

export function enqueueOfflineExpense(
  payload: ExpenseCreateInput,
  userId?: number | null
): QueuedExpense {
  const activeUserId = userId !== undefined ? userId : (getStoredUser()?.id ?? null)
  const item: QueuedExpense = {
    type: 'expense',
    client_id: generateUUID(),
    idempotency_key: `client-${generateUUID()}`,
    user_id: activeUserId,
    payload,
    created_at: new Date().toISOString(),
    retry_count: 0,
  }
  const current = getOfflineQueue(activeUserId)
  current.push(item)
  saveOfflineQueue(current, activeUserId)
  return item
}

export function enqueueOfflineIncome(
  payload: IncomeCreateInput,
  userId?: number | null
): QueuedIncome {
  const activeUserId = userId !== undefined ? userId : (getStoredUser()?.id ?? null)
  const item: QueuedIncome = {
    type: 'income',
    client_id: generateUUID(),
    idempotency_key: `client-inc-${generateUUID()}`,
    user_id: activeUserId,
    payload,
    created_at: new Date().toISOString(),
    retry_count: 0,
  }
  const current = getOfflineQueue(activeUserId)
  current.push(item)
  saveOfflineQueue(current, activeUserId)
  return item
}

export function removeOfflineExpense(clientId: string, userId?: number | null): void {
  removeOfflineItem(clientId, userId)
}

export function removeOfflineIncome(clientId: string, userId?: number | null): void {
  removeOfflineItem(clientId, userId)
}

export function removeOfflineItem(clientId: string, userId?: number | null): void {
  const activeUserId = userId !== undefined ? userId : (getStoredUser()?.id ?? null)
  const current = getOfflineQueue(activeUserId)
  const filtered = current.filter((item) => item.client_id !== clientId)
  saveOfflineQueue(filtered, activeUserId)
}

export function clearOfflineQueue(userId?: number | null): void {
  const activeUserId = userId !== undefined ? userId : (getStoredUser()?.id ?? null)
  saveOfflineQueue([], activeUserId)
}

export async function flushOfflineQueue(
  userId?: number | null
): Promise<{ synced: number; failed: number }> {
  const activeUserId = userId !== undefined ? userId : (getStoredUser()?.id ?? null)
  const queue = getOfflineQueue(activeUserId)
  if (queue.length === 0) return { synced: 0, failed: 0 }

  let synced = 0
  let failed = 0
  const remaining: QueuedTransaction[] = []

  for (const item of queue) {
    try {
      if (item.type === 'income') {
        await api.createIncome(item.payload, item.idempotency_key)
      } else {
        await api.createExpense(item.payload, item.idempotency_key)
      }
      synced += 1
    } catch (err: unknown) {
      failed += 1
      const errMsg = err instanceof Error ? err.message : 'Failed to sync'
      // Retrying NEVER changes the original client_id or idempotency_key
      remaining.push({
        ...item,
        retry_count: item.retry_count + 1,
        last_error: errMsg,
      } as QueuedTransaction)
    }
  }

  saveOfflineQueue(remaining, activeUserId)
  return { synced, failed }
}
