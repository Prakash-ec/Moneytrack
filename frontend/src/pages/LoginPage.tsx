import { AlertCircle, ArrowLeft, Check, ShieldCheck } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'

import { BrandLogo } from '@/components/BrandLogo'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/FormControls'
import { Panel } from '@/components/ui/Panel'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useAuth } from '@/providers/AuthProvider'

interface LoginPageProps {
  initialMode?: 'login' | 'register'
}

export function LoginPage({ initialMode }: LoginPageProps) {
  const [searchParams] = useSearchParams()
  const isRegisterFromQuery = searchParams.get('mode') === 'register' || initialMode === 'register'
  useDocumentTitle(isRegisterFromQuery ? 'Create Account' : 'Sign In')
  const { isAuthenticated, isLoading, setupStatus, login, register } = useAuth()
  const navigate = useNavigate()

  // Determine initial mode: if instance is brand new (not configured), show register
  const isInitialSetup = setupStatus ? !setupStatus.is_configured : false
  const [isRegisterMode, setIsRegisterMode] = useState<boolean>(
    () => isInitialSetup || isRegisterFromQuery,
  )

  useEffect(() => {
    if (isInitialSetup || isRegisterFromQuery) {
      setIsRegisterMode(true)
    }
  }, [isInitialSetup, isRegisterFromQuery])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!isLoading && isAuthenticated) {
    return <Navigate to="/" replace />
  }

  const allowRegistration = setupStatus
    ? !setupStatus.is_configured || setupStatus.allow_registration
    : false

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

    if (isRegisterMode && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
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
        await login({ email: cleanEmail, password })
      }
      navigate('/', { replace: true })
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Authentication failed. Please verify your credentials.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const switchMode = (register: boolean) => {
    setError(null)
    setIsRegisterMode(register)
  }

  const heading = isInitialSetup
    ? 'Set up this instance'
    : isRegisterMode
      ? 'Create your account'
      : 'Sign in to your ledger'

  return (
    <div className="min-h-dvh bg-bg text-text">
      <div className="mx-auto grid min-h-dvh w-full max-w-6xl lg:grid-cols-[1fr_0.9fr]">
        <aside className="hidden flex-col justify-between border-r border-border px-10 py-10 lg:flex">
          <div className="flex items-center gap-2.5">
            <BrandLogo variant="squircle" size={36} />
            <span className="font-display text-[15px] font-semibold tracking-[-0.02em]">
              MoneyTrack
            </span>
          </div>

          <div className="max-w-md">
            <p className="text-[11px] font-medium text-muted">Private personal ledger</p>
            <h1 className="mt-2 font-display text-[34px] font-semibold leading-[1.12] tracking-[-0.03em]">
              Your figures stay exact, and your history stays yours.
            </h1>
            <ul className="mt-6 space-y-3 text-[13px] leading-6 text-muted">
              <li className="flex items-start gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                Amounts are stored in integer paise, not floating point.
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                Unclear bank messages wait for your confirmation.
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                Every read is scoped to the account that signed in.
              </li>
            </ul>
          </div>

          <p className="flex items-center gap-2 text-[11px] text-muted">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            No third-party analytics are embedded in this app.
          </p>
        </aside>

        <main className="flex flex-col px-4 py-6 sm:px-6 lg:px-10">
          <div className="flex items-center justify-between gap-3 lg:justify-end">
            <button
              type="button"
              onClick={() => navigate('/welcome')}
              className="inline-flex items-center gap-1.5 rounded-lg py-1.5 pl-1 pr-2 text-[12px] font-medium text-muted transition-colors hover:text-text lg:hidden"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Welcome
            </button>
            <button
              type="button"
              onClick={() => navigate('/welcome')}
              className="hidden text-[12px] font-medium text-muted transition-colors hover:text-text lg:inline"
            >
              What is MoneyTrack?
            </button>
          </div>

          <div className="flex flex-1 items-center justify-center py-8">
            <div className="w-full max-w-[400px]">
              <div className="flex items-center gap-2.5 lg:hidden">
                <BrandLogo variant="squircle" size={36} />
                <span className="font-display text-[15px] font-semibold tracking-[-0.02em]">
                  MoneyTrack
                </span>
              </div>

              <h2 className="mt-5 font-display text-[24px] font-semibold leading-tight tracking-[-0.025em] lg:mt-0">
                {heading}
              </h2>
              <p className="mt-1 text-[13px] leading-5 text-muted">
                {isInitialSetup
                  ? 'The first account becomes the instance administrator and claims existing local records.'
                  : isRegisterMode
                    ? 'Use an email address and a password of at least 8 characters.'
                    : 'Enter the credentials for this instance.'}
              </p>

              <Panel className="mt-5 p-5">
                {isInitialSetup ? (
                  <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-primary-border bg-primary-soft p-3 text-[12px] leading-5 text-primary-ink">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <p>
                      This looks like a fresh instance. The account you create now will own the
                      existing local ledger.
                    </p>
                  </div>
                ) : null}

                {error ? (
                  <div
                    className="mb-5 flex items-start gap-2.5 rounded-lg border border-danger-border bg-danger-soft p-3 text-[12px] leading-5 text-danger"
                    role="alert"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{error}</span>
                  </div>
                ) : null}

                {!isInitialSetup && allowRegistration ? (
                  <div
                    className="mb-5 grid grid-cols-2 rounded-lg border border-border bg-surface-raised p-1"
                    role="tablist"
                    aria-label="Authentication mode"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={!isRegisterMode}
                      onClick={() => switchMode(false)}
                      className={
                        !isRegisterMode
                          ? 'h-8 rounded-md bg-surface text-[12px] font-semibold text-text shadow-sm'
                          : 'h-8 rounded-md text-[12px] font-medium text-muted transition-colors hover:text-text'
                      }
                    >
                      Sign in
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={isRegisterMode}
                      onClick={() => switchMode(true)}
                      className={
                        isRegisterMode
                          ? 'h-8 rounded-md bg-surface text-[12px] font-semibold text-text shadow-sm'
                          : 'h-8 rounded-md text-[12px] font-medium text-muted transition-colors hover:text-text'
                      }
                    >
                      Create account
                    </button>
                  </div>
                ) : null}

                <form className="space-y-4" onSubmit={handleSubmit}>
                  {isRegisterMode ? (
                    <Field label="Full name" optional>
                      <Input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        autoComplete="name"
                        disabled={submitting}
                      />
                    </Field>
                  ) : null}

                  <Field label="Email address" required>
                    <Input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      inputMode="email"
                      disabled={submitting}
                    />
                  </Field>

                  <Field
                    label="Password"
                    required
                    hint={isRegisterMode ? 'At least 8 characters.' : undefined}
                  >
                    <Input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
                      disabled={submitting}
                    />
                  </Field>

                  {isRegisterMode ? (
                    <Field label="Confirm password" required>
                      <Input
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                        disabled={submitting}
                      />
                    </Field>
                  ) : null}

                  <Button
                    type="submit"
                    size="lg"
                    loading={submitting}
                    className="mt-1 w-full justify-center"
                  >
                    {isInitialSetup
                      ? 'Create administrator account'
                      : isRegisterMode
                        ? 'Create account'
                        : 'Sign in'}
                  </Button>
                </form>
              </Panel>

              {!isInitialSetup && allowRegistration ? (
                <p className="mt-4 text-center text-[12px] text-muted">
                  {isRegisterMode ? 'Already registered?' : 'Need an account?'}{' '}
                  <button
                    type="button"
                    onClick={() => switchMode(!isRegisterMode)}
                    className="font-medium text-primary hover:underline"
                  >
                    {isRegisterMode ? 'Sign in' : 'Create one'}
                  </button>
                </p>
              ) : null}

              {!isInitialSetup && !allowRegistration ? (
                <p className="mt-4 text-center text-[12px] leading-5 text-muted">
                  Registration is closed on this instance. Ask the administrator for access.
                </p>
              ) : null}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
