import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WELCOME_STORAGE_KEY } from '@/constants/branding'

class LocalStorageMock {
  private store: Record<string, string> = {}
  clear() {
    this.store = {}
  }
  getItem(key: string) {
    return this.store[key] ?? null
  }
  setItem(key: string, value: string) {
    this.store[key] = String(value)
  }
  removeItem(key: string) {
    delete this.store[key]
  }
}

const mockStorage = new LocalStorageMock()
vi.stubGlobal('localStorage', mockStorage)

describe('Brand Identity & Welcome Experience', () => {
  beforeEach(() => {
    mockStorage.clear()
  })

  it('exports correct storage key for welcome tracking', () => {
    expect(WELCOME_STORAGE_KEY).toBe('moneytrack_welcomed')
  })

  it('sets and retrieves welcome state in localStorage', () => {
    expect(localStorage.getItem(WELCOME_STORAGE_KEY)).toBeNull()

    localStorage.setItem(WELCOME_STORAGE_KEY, 'true')
    expect(localStorage.getItem(WELCOME_STORAGE_KEY)).toBe('true')
  })
})
