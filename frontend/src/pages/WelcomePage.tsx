import {
  ArrowRight,
  BellRing,
  Check,
  Landmark,
  Lock,
  Moon,
  ReceiptText,
  ShieldCheck,
  Sun,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { BrandLogo } from '@/components/BrandLogo'
import { Button } from '@/components/ui/Button'
import { Panel } from '@/components/ui/Panel'
import { WELCOME_STORAGE_KEY } from '@/constants/branding'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useAuth } from '@/providers/AuthProvider'
import { useTheme } from '@/providers/ThemeProvider'

export { WELCOME_STORAGE_KEY }

const PRINCIPLES = [
  {
    title: 'Exact to the paise',
    body: 'Every amount is stored as an integer. No rounding drift, no floating-point guesses.',
  },
  {
    title: 'Nothing posts by itself',
    body: 'An unclear SMS stays in review until you confirm its direction and amount.',
  },
  {
    title: 'Scoped to your account',
    body: 'Ledger reads and writes are filtered by your user, never shared across tenants.',
  },
]

const FEATURES = [
  {
    icon: ReceiptText,
    title: 'A ledger you can explain',
    body: 'Record expenses, income and transfers with the evidence behind them. Correct a mistake without hiding the history.',
  },
  {
    icon: BellRing,
    title: 'Bank SMS, reviewed',
    body: 'The Android app reads payment messages and presents candidates. You choose what enters the ledger.',
  },
  {
    icon: Landmark,
    title: 'Balances that reconcile',
    body: 'Compare your calculated balance with the last balance your bank reported, and see the difference.',
  },
]

export function WelcomePage() {
  useDocumentTitle('Welcome to MoneyTrack')
  const navigate = useNavigate()
  const { resolvedTheme, setTheme } = useTheme()
  const { isAuthenticated } = useAuth()

  const enter = (target: string) => {
    try {
      localStorage.setItem(WELCOME_STORAGE_KEY, 'true')
    } catch {
      /* storage may be unavailable; the route guard falls back to welcome */
    }
    navigate(target)
  }

  const primaryTarget = isAuthenticated ? '/' : '/login?mode=register'
  const primaryLabel = isAuthenticated ? 'Open your ledger' : 'Create your account'

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-text">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center">
            <BrandLogo variant="squircle" size={36} />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-[15px] font-semibold leading-tight tracking-[-0.02em]">
              MoneyTrack
            </span>
            <span className="block text-[11px] leading-tight text-muted">Private ledger</span>
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-raised hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            aria-label={resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Moon className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
          {!isAuthenticated ? (
            <button
              type="button"
              onClick={() => enter('/login')}
              className="h-9 rounded-lg px-3 text-[13px] font-medium text-muted transition-colors hover:bg-surface-raised hover:text-text"
            >
              Sign in
            </button>
          ) : null}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        <div className="grid items-start gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:pt-8">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[11px] font-medium text-muted">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Local-first personal finance
            </p>

            <h1 className="mt-5 max-w-xl font-display text-[34px] font-semibold leading-[1.08] tracking-[-0.035em] text-text sm:text-[46px]">
              Know where your money goes, down to the last paise.
            </h1>

            <p className="mt-4 max-w-lg text-[15px] leading-7 text-muted">
              MoneyTrack records your expenses, income and account transfers in one exact ledger.
              It never guesses a transaction into existence, and it never hides a balance.
            </p>

            <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button size="lg" onClick={() => enter(primaryTarget)}>
                {primaryLabel}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
              {!isAuthenticated ? (
                <Button variant="secondary" size="lg" onClick={() => enter('/login')}>
                  I already have an account
                </Button>
              ) : (
                <Button variant="secondary" size="lg" onClick={() => enter('/transactions')}>
                  View transactions
                </Button>
              )}
            </div>

            <ul className="mt-6 space-y-2 text-[13px] text-muted">
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                Works offline; queued entries sync when the connection returns.
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                Supports expenses, income, inter-account transfers and bank SMS review.
              </li>
            </ul>
          </div>

          <Panel className="overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <p className="text-[13px] font-semibold text-text">How the ledger behaves</p>
              <p className="mt-0.5 text-[12px] leading-5 text-muted">
                Three rules that decide what you can trust on screen.
              </p>
            </div>
            <ol className="divide-y divide-border">
              {PRINCIPLES.map((principle, index) => (
                <li key={principle.title} className="flex gap-3.5 px-5 py-4">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface-raised font-mono text-[11px] font-medium text-muted">
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-text">
                      {principle.title}
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-5 text-muted">
                      {principle.body}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="flex items-start gap-2.5 border-t border-border bg-surface-raised px-5 py-3.5">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
              <p className="text-[11px] leading-5 text-muted">
                No sample balances are shown here. Your real figures appear only after you sign in.
              </p>
            </div>
          </Panel>
        </div>

        <section className="mt-14 sm:mt-20" aria-labelledby="capabilities-heading">
          <h2
            id="capabilities-heading"
            className="font-display text-[20px] font-semibold tracking-[-0.025em] text-text sm:text-[24px]"
          >
            What you can do with it
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {FEATURES.map((feature) => (
              <Panel key={feature.title} className="p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <feature.icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-[14px] font-semibold leading-snug text-text">
                  {feature.title}
                </h3>
                <p className="mt-1.5 text-[12px] leading-5 text-muted">{feature.body}</p>
              </Panel>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-4 text-[11px] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>&copy; {new Date().getFullYear()} MoneyTrack</span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Your ledger is scoped to your account.
          </span>
        </div>
      </footer>
    </div>
  )
}
