import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { SetupStatus, User } from '@/types/api'
import {
  fetchCurrentUser,
  fetchSetupStatus,
  getStoredToken,
  getStoredUser,
  loginUser,
  logoutUser,
  registerUser,
} from '@/services/auth'

interface AuthContextValue {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  setupStatus: SetupStatus | null
  login: (credentials: { email: string; password: string }) => Promise<void>
  register: (payload: { email: string; password: string; full_name?: string }) => Promise<void>
  logout: () => void
  refreshSetupStatus: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getStoredToken())
  const [user, setUser] = useState<User | null>(() => getStoredUser())
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)

  const refreshSetupStatus = useCallback(async () => {
    try {
      const status = await fetchSetupStatus()
      setSetupStatus(status)
    } catch {
      // Fallback: assume configured
      setSetupStatus({ is_configured: true, user_count: 1, allow_registration: false })
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    async function initialize() {
      setIsLoading(true)
      try {
        await refreshSetupStatus()
        const currentToken = getStoredToken()
        if (currentToken) {
          try {
            const profile = await fetchCurrentUser()
            if (isMounted) {
              setUser(profile)
              setToken(currentToken)
            }
          } catch {
            if (isMounted) {
              setUser(null)
              setToken(null)
            }
          }
        } else {
          if (isMounted) {
            setUser(null)
            setToken(null)
          }
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void initialize()

    const handleUnauthorized = () => {
      setUser(null)
      setToken(null)
    }

    const handleAuthChanged = () => {
      setToken(getStoredToken())
      setUser(getStoredUser())
    }

    window.addEventListener('moneytrack:unauthorized', handleUnauthorized)
    window.addEventListener('moneytrack:auth-changed', handleAuthChanged)

    return () => {
      isMounted = false
      window.removeEventListener('moneytrack:unauthorized', handleUnauthorized)
      window.removeEventListener('moneytrack:auth-changed', handleAuthChanged)
    }
  }, [refreshSetupStatus])

  const login = useCallback(
    async (credentials: { email: string; password: string }) => {
      const loggedUser = await loginUser(credentials)
      setUser(loggedUser)
      setToken(getStoredToken())
      await refreshSetupStatus()
    },
    [refreshSetupStatus]
  )

  const register = useCallback(
    async (payload: { email: string; password: string; full_name?: string }) => {
      const registeredUser = await registerUser(payload)
      setUser(registeredUser)
      setToken(getStoredToken())
      await refreshSetupStatus()
    },
    [refreshSetupStatus]
  )

  const logout = useCallback(() => {
    logoutUser()
    setUser(null)
    setToken(null)
  }, [])

  const value: AuthContextValue = {
    user,
    token,
    isAuthenticated: Boolean(token && user),
    isLoading,
    setupStatus,
    login,
    register,
    logout,
    refreshSetupStatus,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
