import { describe, expect, it, beforeEach } from 'vitest'

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
  } as unknown as Storage
}

import {
  DEFAULT_QUICK_CHIPS,
  QUICK_CHIPS_STORAGE_KEY,
  getStoredQuickChips,
  saveStoredQuickChips,
} from './quickChips'

describe('quickChips utility', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns default quick chips when none are stored', () => {
    const chips = getStoredQuickChips()
    expect(chips).toHaveLength(5)
    expect(chips[0].label).toContain('Chai')
    expect(chips[0].amount).toBe('40')
  })

  it('saves and retrieves customized quick chips', () => {
    const custom = [
      { id: 'custom-1', label: '☕ Espresso ₹80', amount: '80', merchant: 'Coffee Shop', note: 'Coffee' },
      { id: 'custom-2', label: '🚕 Taxi ₹200', amount: '200', merchant: 'Uber', note: 'Ride' },
    ]
    saveStoredQuickChips(custom)

    const loaded = getStoredQuickChips()
    expect(loaded).toHaveLength(2)
    expect(loaded[0].label).toBe('☕ Espresso ₹80')
    expect(loaded[0].amount).toBe('80')
    expect(loaded[1].amount).toBe('200')
  })

  it('handles invalid or corrupted storage gracefully', () => {
    localStorage.setItem(QUICK_CHIPS_STORAGE_KEY, 'invalid-json')
    const chips = getStoredQuickChips()
    expect(chips).toEqual(DEFAULT_QUICK_CHIPS)
  })
})
