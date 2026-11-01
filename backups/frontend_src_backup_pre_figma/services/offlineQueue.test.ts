import { describe, expect, it, vi, beforeEach } from 'vitest'

// Provide an in-memory localStorage polyfill for Node test environment
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    get length() {
      return store.size
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
  }
}

import {
  enqueueOfflineExpense,
  getOfflineQueue,
  removeOfflineExpense,
  flushOfflineQueue,
} from './offlineQueue'
import { api } from './api'

describe('offlineQueue', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('queues an expense locally with a stable idempotency key', () => {
    const payload = {
      expense_type_id: 1,
      amount_paise: 5000,
      expense_date: '2026-10-28',
      note: 'Offline chai',
    }
    const item = enqueueOfflineExpense(payload)
    expect(item.idempotency_key).toMatch(/^client-/)
    expect(item.payload.amount_paise).toBe(5000)

    const queue = getOfflineQueue()
    expect(queue.length).toBe(1)
    expect(queue[0].client_id).toBe(item.client_id)
  })

  it('removes an item from the queue by clientId', () => {
    const item = enqueueOfflineExpense({
      expense_type_id: 1,
      amount_paise: 1000,
      expense_date: '2026-10-28',
    })
    expect(getOfflineQueue().length).toBe(1)
    removeOfflineExpense(item.client_id)
    expect(getOfflineQueue().length).toBe(0)
  })

  it('flushes queued expenses and removes synced ones', async () => {
    enqueueOfflineExpense({
      expense_type_id: 1,
      amount_paise: 2500,
      expense_date: '2026-10-28',
    })
    const createSpy = vi.spyOn(api, 'createExpense').mockResolvedValue({
      id: 101,
      expense_type_id: 1,
      amount_paise: 2500,
      expense_date: '2026-10-28',
      note: null,
      merchant: null,
      payment_method: null,
      created_at: '2026-10-28T12:00:00Z',
      updated_at: '2026-10-28T12:00:00Z',
      expense_type: {
        id: 1,
        name: 'Food',
        icon: 'utensils',
        color: '#10b981',
        category: 'Food',
        is_archived: false,
      },
    })

    const result = await flushOfflineQueue()
    expect(result.synced).toBe(1)
    expect(result.failed).toBe(0)
    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(getOfflineQueue().length).toBe(0)
  })
})
