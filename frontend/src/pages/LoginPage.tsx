import { AlertCircle, Lock, Mail, ShieldCheck, User as UserIcon, Wallet } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/FormControls'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useAuth } from '@/providers/AuthProvider'

export function LoginPage() {
  useDocumentTitle('Sign In')
  const { isAuthenticated, isLoading, setupStatus, login, register } = useAuth()
  const navigate = useNavigate()

  // Determine initial mode: if instance is brand new (not configured), show register
  const isInitialSetup = setupStatus ? !setupStatus.is_configured : false
  const [isRegisterMode, setIsRegisterMode] = useState<boolean>(() => isInitialSetup)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Redirect if already authenticated
  if (!isLoading && isAuthenticated) {
    return <Navigate to="/" replace />
  }

  const allowRegistration =
    setupStatus ? !setupStatus.is_configured || setupStatus.allow_registration : false

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Please enter a valid email address.')
      return
    }

    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    if (isRegisterMode) {
      if (password !== confirmPassword) {
        setError('Passwords do not match.')
        return
      }
    }

    setSubmitting(true)
    try {
      if (isRegisterMode) {
        await register({
          email: cleanEmail,
          password,
          full_name: fullName.trim() || undefined,
        })
      } else {
        await login({
          email: cleanEmail,
          password,
        })
      }
      navigate('/', { replace: true })
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Please verify your credentials.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center bg-canvas px-4 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/20">
            <Wallet className="h-7 w-7" />
          </div>
        </div>
        <h2 className="mt-4 text-center text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          MoneyTrack
        </h2>
        <p className="mt-1.5 text-center text-sm text-subtle">
          {isInitialSetup
            ? 'Set up your primary administrator account'
            : isRegisterMode
              ? 'Create a new account'
              : 'Sign in to access your financial dashboard'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <Card className="px-6 py-8 shadow-card sm:rounded-2xl sm:px-10">
          {isInitialSetup && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs text-primary">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Initial Instance Setup</p>
                <p className="mt-0.5 text-subtle">
                  Welcome! This first account will be the instance administrator and will
                  automatically claim existing local records.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-danger/20 bg-danger/5 p-3.5 text-xs text-danger">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            {isRegisterMode && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-subtle">
                  Full Name (Optional)
                </label>
                <div className="relative">
                  <Input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Alex Morgan"
                    autoComplete="name"
                    disabled={submitting}
                  />
                  <UserIcon className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-subtle" />
                </div>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-subtle">
                Email Address
              </label>
              <div className="relative">
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  autoComplete="email"
                  disabled={submitting}
                />
                <Mail className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-subtle" />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-subtle">
                Password
              </label>
              <div className="relative">
                <Input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
                  disabled={submitting}
                />
                <Lock className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-subtle" />
              </div>
            </div>

            {isRegisterMode && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-subtle">
                  Confirm Password
                </label>
                <div className="relative">
                  <Input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    disabled={submitting}
                  />
                  <Lock className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-subtle" />
                </div>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={submitting}
              className="mt-6 w-full justify-center"
            >
              {isInitialSetup
                ? 'Create Admin Account'
                : isRegisterMode
                  ? 'Register Account'
                  : 'Sign In'}
            </Button>
          </form>

          {!isInitialSetup && allowRegistration && (
            <div className="mt-6 border-t border-line pt-4 text-center">
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setIsRegisterMode(!isRegisterMode)
                }}
                className="text-xs font-medium text-primary hover:underline"
              >
                {isRegisterMode
                  ? 'Already have an account? Sign in instead'
                  : "Don't have an account? Register here"}
              </button>
            </div>
          )}

          {!isInitialSetup && !allowRegistration && !isRegisterMode && (
            <div className="mt-6 border-t border-line pt-4 text-center">
              <p className="text-xs text-subtle">
                Registration is closed. Contact the instance administrator if you need access.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
