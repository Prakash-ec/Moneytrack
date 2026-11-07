import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchCurrentUser,
  fetchSetupStatus,
  getStoredToken,
  getStoredUser,
  loginUser,
  logoutUser,
  registerUser,
  setStoredToken,
  setStoredUser,
} from './auth'

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

describe('Frontend Authentication Service', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('manages token and user in storage correctly', () => {
    expect(getStoredToken()).toBeNull()
    expect(getStoredUser()).toBeNull()

    setStoredToken('test-jwt-token-123')
    expect(getStoredToken()).toBe('test-jwt-token-123')

    const user = {
      id: 1,
      email: 'user@example.com',
      full_name: 'Test User',
      is_active: true,
      is_superuser: true,
      created_at: new Date().toISOString(),
    }
    setStoredUser(user)
    expect(getStoredUser()).toEqual(user)

    logoutUser()
    expect(getStoredToken()).toBeNull()
    expect(getStoredUser()).toBeNull()
  })

  it('handles login successfully and persists session', async () => {
    const mockUser = {
      id: 1,
      email: 'test@example.com',
      is_active: true,
      is_superuser: true,
      created_at: '2026-11-06T00:00:00Z',
    }
    const mockResponse = {
      access_token: 'jwt-token-xyz',
      token_type: 'bearer',
      expires_in_seconds: 3600,
      user: mockUser,
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(mockResponse),
      json: async () => mockResponse,
    } as Response)

    const user = await loginUser({ email: 'test@example.com', password: 'password123' })
    expect(user.email).toBe('test@example.com')
    expect(getStoredToken()).toBe('jwt-token-xyz')
    expect(getStoredUser()?.id).toBe(1)
  })

  it('handles registration successfully', async () => {
    const mockUser = {
      id: 2,
      email: 'newuser@example.com',
      is_active: true,
      is_superuser: false,
      created_at: '2026-11-06T00:00:00Z',
    }
    const mockResponse = {
      access_token: 'jwt-new-token',
      token_type: 'bearer',
      expires_in_seconds: 3600,
      user: mockUser,
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(mockResponse),
      json: async () => mockResponse,
    } as Response)

    const user = await registerUser({
      email: 'newuser@example.com',
      password: 'password123',
      full_name: 'New User',
    })
    expect(user.email).toBe('newuser@example.com')
    expect(getStoredToken()).toBe('jwt-new-token')
  })

  it('handles setup status retrieval', async () => {
    const mockStatus = {
      is_configured: true,
      user_count: 1,
      allow_registration: false,
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockStatus,
    } as Response)

    const status = await fetchSetupStatus()
    expect(status.is_configured).toBe(true)
    expect(status.allow_registration).toBe(false)
  })

  it('fetches current user profile with token', async () => {
    setStoredToken('valid-token-abc')
    const mockUser = {
      id: 1,
      email: 'current@example.com',
      is_active: true,
      is_superuser: true,
      created_at: '2026-11-06T00:00:00Z',
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockUser,
    } as Response)

    const profile = await fetchCurrentUser()
    expect(profile.email).toBe('current@example.com')
  })

  it('throws ApiError on failed login with sanitized message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ detail: 'Invalid email or password.' }),
    } as Response)

    await expect(
      loginUser({ email: 'wrong@example.com', password: 'wrongpassword' })
    ).rejects.toThrow('Invalid email or password.')
    expect(getStoredToken()).toBeNull()
  })
})
