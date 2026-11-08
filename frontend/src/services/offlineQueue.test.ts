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
  enqueueOfflineIncome,
  getOfflineQueue,
  removeOfflineExpense,
  removeOfflineIncome,
  clearOfflineQueue,
  flushOfflineQueue,
} from './offlineQueue'
import { api, ApiError } from './api'
import * as auth from './auth'
import type { User } from '@/types/api'

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
    const item = enqueueOfflineExpense(payload, 1)
    expect(item.idempotency_key).toMatch(/^client-/)
    expect(item.payload.amount_paise).toBe(5000)
    expect(item.user_id).toBe(1)

    const queue = getOfflineQueue(1)
    expect(queue.length).toBe(1)
    expect(queue[0].client_id).toBe(item.client_id)
  })

  it('queues an income locally with a stable idempotency key', () => {
    const payload = {
      income_type_id: 2,
      amount_paise: 1200000,
      income_date: '2026-11-08',
      payer: 'Freelance Client',
      note: 'Offline project payout',
    }
    const item = enqueueOfflineIncome(payload, 1)
    expect(item.type).toBe('income')
    expect(item.idempotency_key).toMatch(/^client-inc-/)
    expect(item.payload.amount_paise).toBe(1200000)
    expect(item.user_id).toBe(1)

    const queue = getOfflineQueue(1)
    expect(queue.length).toBe(1)
    expect(queue[0].client_id).toBe(item.client_id)
  })

  it('removes an item from the queue by clientId', () => {
    const item = enqueueOfflineExpense({
      expense_type_id: 1,
      amount_paise: 1000,
      expense_date: '2026-10-28',
    }, 1)
    expect(getOfflineQueue(1).length).toBe(1)
    removeOfflineExpense(item.client_id, 1)
    expect(getOfflineQueue(1).length).toBe(0)

    const incItem = enqueueOfflineIncome({
      income_type_id: 2,
      amount_paise: 50000,
      income_date: '2026-11-08',
    }, 1)
    expect(getOfflineQueue(1).length).toBe(1)
    removeOfflineIncome(incItem.client_id, 1)
    expect(getOfflineQueue(1).length).toBe(0)
  })

  it('clears offline queue for a specific user', () => {
    enqueueOfflineExpense({
      expense_type_id: 1,
      amount_paise: 1000,
      expense_date: '2026-10-28',
    }, 1)
    expect(getOfflineQueue(1).length).toBe(1)
    clearOfflineQueue(1)
    expect(getOfflineQueue(1).length).toBe(0)
  })

  it('handles HTTP 201 Created on fresh expense/income sync and removes items', async () => {
    enqueueOfflineExpense({
      expense_type_id: 1,
      amount_paise: 2500,
      expense_date: '2026-10-28',
    }, 1)
    enqueueOfflineIncome({
      income_type_id: 3,
      amount_paise: 80000,
      income_date: '2026-11-08',
    }, 1)

    const expSpy = vi.spyOn(api, 'createExpense').mockResolvedValue({
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

    const incSpy = vi.spyOn(api, 'createIncome').mockResolvedValue({
      id: 201,
      income_type_id: 3,
      account_id: null,
      amount_paise: 80000,
      income_date: '2026-11-08',
      payer: null,
      payment_method: null,
      reference: null,
      note: null,
      created_at: '2026-11-08T12:00:00Z',
      updated_at: '2026-11-08T12:00:00Z',
      income_type: {
        id: 3,
        name: 'Salary',
        category: 'Work',
        icon: 'briefcase',
        color: '#10b981',
        is_archived: false,
        total_paise: 80000,
        transaction_count: 1,
        created_at: '2026-11-08T12:00:00Z',
        updated_at: '2026-11-08T12:00:00Z',
      },
      account: null,
    })

    const result = await flushOfflineQueue(1)
    expect(result.synced).toBe(2)
    expect(result.failed).toBe(0)
    expect(expSpy).toHaveBeenCalledTimes(1)
    expect(incSpy).toHaveBeenCalledTimes(1)
    expect(getOfflineQueue(1).length).toBe(0)
  })

  it('handles HTTP 200 OK idempotent replay (server already committed) and removes item', async () => {
    enqueueOfflineExpense({
      expense_type_id: 1,
      amount_paise: 4000,
      expense_date: '2026-10-29',
    }, 1)

    // Replay response returns HTTP 200 with existing resource
    vi.spyOn(api, 'createExpense').mockResolvedValue({
      id: 102,
      expense_type_id: 1,
      amount_paise: 4000,
      expense_date: '2026-10-29',
      note: null,
      merchant: null,
      payment_method: null,
      created_at: '2026-10-29T12:00:00Z',
      updated_at: '2026-10-29T12:00:00Z',
      expense_type: {
        id: 1,
        name: 'Food',
        icon: 'utensils',
        color: '#10b981',
        category: 'Food',
        is_archived: false,
      },
    })

    const result = await flushOfflineQueue(1)
    expect(result.synced).toBe(1)
    expect(result.failed).toBe(0)
    expect(getOfflineQueue(1).length).toBe(0)
  })

  it('handles HTTP 400 Client Error and retains transaction in queue with error and retry count', async () => {
    const item = enqueueOfflineExpense({
      expense_type_id: 999,
      amount_paise: 2500,
      expense_date: '2026-10-28',
    }, 1)
    const initialClientId = item.client_id
    const initialIdempotencyKey = item.idempotency_key

    vi.spyOn(api, 'createExpense').mockRejectedValue(
      new ApiError('Invalid expense type id', 400)
    )

    const result = await flushOfflineQueue(1)
    expect(result.synced).toBe(0)
    expect(result.failed).toBe(1)

    const queue = getOfflineQueue(1)
    expect(queue.length).toBe(1)
    expect(queue[0].client_id).toBe(initialClientId)
    expect(queue[0].idempotency_key).toBe(initialIdempotencyKey)
    expect(queue[0].retry_count).toBe(1)
    expect(queue[0].last_error).toBe('Invalid expense type id')
  })

  it('handles HTTP 500 Server Error and retains transaction without changing idempotency key', async () => {
    const item = enqueueOfflineIncome({
      income_type_id: 2,
      amount_paise: 150000,
      income_date: '2026-11-01',
    }, 1)
    const initialClientId = item.client_id
    const initialIdempotencyKey = item.idempotency_key

    vi.spyOn(api, 'createIncome').mockRejectedValue(
      new ApiError('Internal Server Error', 500)
    )

    const result = await flushOfflineQueue(1)
    expect(result.synced).toBe(0)
    expect(result.failed).toBe(1)

    const queue = getOfflineQueue(1)
    expect(queue.length).toBe(1)
    expect(queue[0].client_id).toBe(initialClientId)
    expect(queue[0].idempotency_key).toBe(initialIdempotencyKey)
    expect(queue[0].retry_count).toBe(1)
    expect(queue[0].last_error).toBe('Internal Server Error')
  })

  it('simulates application restart and verifies queued items persist unchanged', () => {
    const item = enqueueOfflineExpense({
      expense_type_id: 1,
      amount_paise: 7500,
      expense_date: '2026-11-05',
    }, 1)

    // Simulate restart by re-reading directly from storage
    const recovered = getOfflineQueue(1)
    expect(recovered.length).toBe(1)
    expect(recovered[0].client_id).toBe(item.client_id)
    expect(recovered[0].idempotency_key).toBe(item.idempotency_key)
    expect(recovered[0].payload.amount_paise).toBe(7500)
  })

  it('enforces strict multi-user queue isolation across logout and account switching', async () => {
    const aliceUser: User = {
      id: 1,
      email: 'alice@example.com',
      full_name: 'Alice',
      is_active: true,
      is_superuser: true,
      created_at: '2026-01-01T00:00:00Z',
    }
    const bobUser: User = {
      id: 2,
      email: 'bob@example.com',
      full_name: 'Bob',
      is_active: true,
      is_superuser: false,
      created_at: '2026-01-01T00:00:00Z',
    }

    // User 1 (Alice, id=1) creates an offline expense
    vi.spyOn(auth, 'getStoredUser').mockReturnValue(aliceUser)

    const aliceItem = enqueueOfflineExpense({
      expense_type_id: 1,
      amount_paise: 3000,
      expense_date: '2026-11-02',
      note: 'Alice coffee',
    })
    expect(getOfflineQueue().length).toBe(1)
    expect(getOfflineQueue()[0].user_id).toBe(1)

    // User 1 logs out (stored user becomes null)
    vi.spyOn(auth, 'getStoredUser').mockReturnValue(null)
    expect(getOfflineQueue(1).length).toBe(1) // Alice's queue is preserved intact in storage!

    // User 2 (Bob, id=2) logs in
    vi.spyOn(auth, 'getStoredUser').mockReturnValue(bobUser)

    // Bob's queue is completely empty
    expect(getOfflineQueue().length).toBe(0)

    // Bob enqueues an expense
    const bobItem = enqueueOfflineExpense({
      expense_type_id: 2,
      amount_paise: 9000,
      expense_date: '2026-11-03',
      note: 'Bob fuel',
    })
    expect(getOfflineQueue().length).toBe(1)
    expect(getOfflineQueue()[0].user_id).toBe(2)

    // Flushing Bob's queue only flushes Bob's item, never touches Alice's item
    const expSpy = vi.spyOn(api, 'createExpense').mockResolvedValue({
      id: 999,
      expense_type_id: 2,
      amount_paise: 9000,
      expense_date: '2026-11-03',
      note: null,
      merchant: null,
      payment_method: null,
      created_at: '2026-11-03T12:00:00Z',
      updated_at: '2026-11-03T12:00:00Z',
      expense_type: {
        id: 2,
        name: 'Transport',
        icon: 'car',
        color: '#3b82f6',
        category: 'Travel',
        is_archived: false,
      },
    })

    const bobFlush = await flushOfflineQueue()
    expect(bobFlush.synced).toBe(1)
    expect(getOfflineQueue().length).toBe(0) // Bob's queue is now empty
    expect(expSpy).toHaveBeenCalledWith(bobItem.payload, bobItem.idempotency_key)

    // Switch back to Alice: Alice's queue is STILL preserved!
    vi.spyOn(auth, 'getStoredUser').mockReturnValue(aliceUser)

    const aliceRecovered = getOfflineQueue()
    expect(aliceRecovered.length).toBe(1)
    expect(aliceRecovered[0].client_id).toBe(aliceItem.client_id)
    expect(aliceRecovered[0].payload.amount_paise).toBe(3000)
  })

  it('migrates legacy un-partitioned queue without loss of financial data', () => {
    // Put legacy item in old key
    const legacyItem = {
      type: 'expense' as const,
      client_id: 'legacy-1',
      idempotency_key: 'client-legacy-1',
      payload: {
        expense_type_id: 1,
        amount_paise: 1100,
        expense_date: '2026-10-25',
      },
      created_at: '2026-10-25T10:00:00Z',
      retry_count: 0,
    }
    localStorage.setItem('moneytrack_offline_queue', JSON.stringify([legacyItem]))

    // Retrieve with active user ID 1
    const items = getOfflineQueue(1)
    expect(items.length).toBe(1)
    expect(items[0].client_id).toBe('legacy-1')
    expect(items[0].user_id).toBe(1)
    expect(localStorage.getItem('moneytrack_offline_queue')).toBeNull() // Cleared after migration
  })
})
