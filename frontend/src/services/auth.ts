import { Capacitor } from '@capacitor/core'
import type { SetupStatus, TokenResponse, User } from '@/types/api'
import { ApiError, getApiBase } from './api'
import { SmsPlugin } from './sms'

const TOKEN_STORAGE_KEY = 'moneytrack_auth_token'
const USER_STORAGE_KEY = 'moneytrack_auth_user'

/**
 * Retrieves the currently active JWT authentication token.
 * Note on security trade-offs:
 * - In browsers, localStorage is susceptible to XSS if malicious scripts execute.
 *   However, because MoneyTrack has strict CSP headers, no third-party CDNs,
 *   and no cookies/sessions across origins, localStorage provides a balance
 *   of reliable SPA session persistence without CORS cookie restrictions.
 * - On Android Capacitor, tokens are additionally mirrored to Keystore-backed
 *   hardware storage via SmsPlugin.setAuthToken for background native sync workers.
 */
export function getStoredToken(): string | null {
  if (typeof localStorage === 'undefined') return null
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

export function setStoredToken(token: string | null): void {
  if (typeof localStorage === 'undefined') return
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token)
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY)
    }
  } catch {
    // ignore quota errors
  }

  // Sync to native Android Keystore if running natively
  if (Capacitor.isNativePlatform()) {
    try {
      if (token && typeof SmsPlugin.setAuthToken === 'function') {
        void SmsPlugin.setAuthToken({ token }).catch(() => {
          // background sync fallback
        })
      } else if (!token && typeof SmsPlugin.clearAuthToken === 'function') {
        void SmsPlugin.clearAuthToken().catch(() => {
          // ignore
        })
      }
    } catch {
      // ignore bridge initialization errors
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('moneytrack:auth-changed', { detail: { token } }))
  }
}

export function getStoredUser(): User | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

export function setStoredUser(user: User | null): void {
  if (typeof localStorage === 'undefined') return
  try {
    if (user) {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user))
    } else {
      localStorage.removeItem(USER_STORAGE_KEY)
    }
  } catch {
    // ignore quota errors
  }
}

export async function loginUser(credentials: { email: string; password: string }): Promise<User> {
  const base = getApiBase()
  const response = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      email: credentials.email.trim().toLowerCase(),
      password: credentials.password,
    }),
  })

  const text = await response.text()
  let data: any = null
  try {
    data = JSON.parse(text)
  } catch {
    // non-json response
  }

  if (!response.ok) {
    const detail = data?.detail || 'Invalid email or password.'
    throw new ApiError(detail, response.status, data)
  }

  const tokenResp = data as TokenResponse
  setStoredToken(tokenResp.access_token)
  setStoredUser(tokenResp.user)
  return tokenResp.user
}

export async function registerUser(payload: {
  email: string
  password: string
  full_name?: string
}): Promise<User> {
  const base = getApiBase()
  const response = await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
      full_name: payload.full_name?.trim() || null,
    }),
  })

  const text = await response.text()
  let data: any = null
  try {
    data = JSON.parse(text)
  } catch {
    // non-json response
  }

  if (!response.ok) {
    const detail = data?.detail || 'Registration failed.'
    throw new ApiError(detail, response.status, data)
  }

  const tokenResp = data as TokenResponse
  setStoredToken(tokenResp.access_token)
  setStoredUser(tokenResp.user)
  return tokenResp.user
}

export async function fetchCurrentUser(): Promise<User> {
  const token = getStoredToken()
  if (!token) {
    throw new ApiError('Not authenticated', 401)
  }

  const base = getApiBase()
  const response = await fetch(`${base}/auth/me`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    if (response.status === 401) {
      setStoredToken(null)
      setStoredUser(null)
    }
    const text = await response.text()
    let data = null
    try {
      data = JSON.parse(text)
    } catch {}
    throw new ApiError(data?.detail || 'Failed to authenticate.', response.status, data)
  }

  const user = (await response.json()) as User
  setStoredUser(user)
  return user
}

export async function fetchSetupStatus(): Promise<SetupStatus> {
  const base = getApiBase()
  const response = await fetch(`${base}/auth/setup-status`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    return { is_configured: true, user_count: 1, allow_registration: false }
  }

  return (await response.json()) as SetupStatus
}

export function logoutUser(): void {
  setStoredToken(null)
  setStoredUser(null)
}
