import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Lock,
  Moon,
  PieChart,
  Receipt,
  RotateCcw,
  ShieldCheck,
  Sun,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { BrandLogo } from '@/components/BrandLogo'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { WELCOME_STORAGE_KEY } from '@/constants/branding'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useAuth } from '@/providers/AuthProvider'
import { useTheme } from '@/providers/ThemeProvider'

export { WELCOME_STORAGE_KEY }

export function WelcomePage() {
  useDocumentTitle('Welcome to MoneyTrack')
  const navigate = useNavigate()
  const { resolvedTheme, setTheme } = useTheme()
  const { isAuthenticated } = useAuth()

  // Stages: 1 = Brand Reveal, 2 = Tagline & Balance, 3 = 3 Core Features, 4 = Final Welcome Action
  const [stage, setStage] = useState<number>(1)
  const [isPaused, setIsPaused] = useState<boolean>(false)

  // Reduced motion preference
  const prefersReducedMotion = useMemo(() => {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  }, [])

  // Auto-advance timer (only if not reduced motion and not paused)
  useEffect(() => {
    if (prefersReducedMotion || isPaused || stage >= 4) return

    const timer = setTimeout(() => {
      setStage((prev) => Math.min(prev + 1, 4))
    }, 4200)

    return () => clearTimeout(timer)
  }, [stage, isPaused, prefersReducedMotion])

  const handleFinish = (target: string = '/login') => {
    try {
      localStorage.setItem(WELCOME_STORAGE_KEY, 'true')
    } catch {
      /* ignore */
    }
    navigate(isAuthenticated ? '/' : target)
  }

  const handleSkip = () => {
    setStage(4)
  }

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }

  return (
    <div
      className="relative flex min-h-screen flex-col justify-between overflow-x-hidden bg-canvas text-ink transition-colors duration-300"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Background Ambient Lighting (Fintech Obsidian Glow) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-[20%] left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full blur-[140px] opacity-20 dark:opacity-25"
          style={{
            background:
              'radial-gradient(circle, #6366F1 0%, #3B82F6 40%, rgba(11, 15, 25, 0) 80%)',
          }}
        />
        <div
          className="absolute -bottom-[20%] right-[10%] h-[400px] w-[500px] rounded-full blur-[120px] opacity-10 dark:opacity-15"
          style={{
            background: 'radial-gradient(circle, #10B981 0%, rgba(16, 185, 129, 0) 70%)',
          }}
        />
      </div>

      {/* Top Header / Utility Bar */}
      <header className="relative z-20 flex items-center justify-between px-6 pb-5 pt-[max(env(safe-area-inset-top,0px),1.25rem)] sm:px-10">
        <div className="flex items-center gap-3">
          <BrandLogo variant="squircle" size={32} />
          <span className="font-display text-base font-bold tracking-tight text-ink">
            Money<span className="text-primary">Track</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Stage Progress Pills */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface/80 border border-border/60 text-xs font-mono">
            {[1, 2, 3, 4].map((step) => (
              <button
                key={step}
                type="button"
                onClick={() => setStage(step)}
                aria-label={`Jump to stage ${step}`}
                className={`h-2 rounded-full transition-all duration-300 ${
                  stage === step
                    ? 'w-7 bg-primary'
                    : stage > step
                      ? 'w-2 bg-primary/40'
                      : 'w-2 bg-border'
                }`}
              />
            ))}
          </div>

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle visual theme"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/80 bg-surface text-subtle transition-colors hover:text-ink hover:border-border"
          >
            {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* Skip CTA */}
          {stage < 4 && (
            <button
              type="button"
              onClick={handleSkip}
              className="text-xs font-medium text-subtle hover:text-primary transition-colors px-2 py-1"
            >
              Skip
            </button>
          )}
        </div>
      </header>

      {/* Main Hero Container */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-8 sm:px-6">
        <div className="w-full max-w-4xl mx-auto">
          {/* ======================================================== */}
          {/* STAGE 1: Brand Appearance */}
          {/* ======================================================== */}
          {stage === 1 && (
            <div className="flex flex-col items-center text-center animate-fade-in">
              <div className="relative mb-8 group">
                {/* Luminous Ambient Halo */}
                <div className="absolute inset-0 scale-125 rounded-3xl bg-primary/20 blur-2xl transition-all duration-700" />
                <BrandLogo
                  variant="squircle"
                  size={128}
                  className="relative rounded-3xl shadow-2xl ring-1 ring-border/80 transition-transform duration-500 hover:scale-105"
                />
              </div>

              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1 text-xs font-medium text-primary">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Private Financial Intelligence</span>
                </div>

                <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-ink">
                  Money<span className="text-primary">Track</span>
                </h1>

                <p className="max-w-md mx-auto text-base sm:text-lg text-subtle font-sans">
                  The autonomous personal expenditure tracker designed for total control and financial confidence.
                </p>
              </div>

              <div className="mt-10 flex items-center gap-4">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => setStage(2)}
                  className="gap-2 px-6 shadow-lg shadow-primary/20"
                >
                  <span>Explore Capabilities</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* STAGE 2: Tagline & Core Philosophy */}
          {/* ======================================================== */}
          {stage === 2 && (
            <div className="flex flex-col items-center text-center animate-fade-in space-y-8">
              <div className="space-y-4 max-w-2xl mx-auto">
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
                  <Zap className="h-3.5 w-3.5" />
                  <span>Master Your Cashflow</span>
                </div>

                <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-ink leading-tight">
                  Your Money. <br className="hidden sm:inline" />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-indigo-400 to-emerald-400">
                    Your Control.
                  </span>
                </h1>

                <p className="text-base sm:text-xl text-subtle">
                  Track smarter. Save better. Stay financially confident with zero compromise on privacy.
                </p>
              </div>

              {/* High-Fi Mock Fintech Ledger Preview */}
              <div className="w-full max-w-md mx-auto">
                <Card className="p-6 text-left border border-border shadow-2xl bg-surface/90 backdrop-blur-md rounded-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 h-28 w-28 bg-primary/10 rounded-full blur-2xl" />

                  <div className="flex items-center justify-between pb-4 border-b border-border/80">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                        <TrendingUp className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-subtle">Total Net Balance</p>
                        <p className="text-xs font-mono text-emerald-500 font-semibold">+12.4% this month</p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-surface-elevated text-subtle border border-border">
                      INR ₹
                    </span>
                  </div>

                  <div className="my-5">
                    <span className="font-mono text-3xl sm:text-4xl font-bold tracking-tight text-ink">
                      ₹1,48,250.00
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border/60">
                    <div className="p-3 rounded-xl bg-surface-elevated/70 border border-border/50">
                      <p className="text-[11px] uppercase tracking-wider text-subtle font-medium">Income</p>
                      <p className="font-mono text-sm font-semibold text-emerald-500 mt-0.5">+₹85,000</p>
                    </div>
                    <div className="p-3 rounded-xl bg-surface-elevated/70 border border-border/50">
                      <p className="text-[11px] uppercase tracking-wider text-subtle font-medium">Expenses</p>
                      <p className="font-mono text-sm font-semibold text-rose-500 mt-0.5">-₹32,450</p>
                    </div>
                  </div>
                </Card>
              </div>

              <div className="flex items-center gap-3">
                <Button variant="secondary" size="md" onClick={() => setStage(1)} className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back</span>
                </Button>
                <Button variant="primary" size="md" onClick={() => setStage(3)} className="gap-2 px-6 shadow-md shadow-primary/20">
                  <span>See How It Works</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* STAGE 3: Three Core Feature Highlights */}
          {/* ======================================================== */}
          {stage === 3 && (
            <div className="animate-fade-in space-y-8">
              <div className="text-center max-w-xl mx-auto space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Core Architecture
                </span>
                <h2 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-ink">
                  Engineered for Everyday Financial Clarity
                </h2>
                <p className="text-sm sm:text-base text-subtle">
                  Three powerful pillars that turn scattered spending into complete financial control.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Feature 1 */}
                <Card className="p-6 border border-border bg-surface hover:border-primary/40 transition-all duration-300 rounded-2xl flex flex-col justify-between group">
                  <div className="space-y-4">
                    <div className="h-12 w-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 flex items-center justify-center transition-transform group-hover:scale-105">
                      <Receipt className="h-6 w-6" />
                    </div>
                    <div className="space-y-1.5">
                      <div className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 uppercase tracking-wider">
                        Seamless Input
                      </div>
                      <h3 className="font-display text-lg font-bold text-ink">
                        Track Every Expense
                      </h3>
                      <p className="text-xs sm:text-sm text-subtle leading-relaxed">
                        Effortlessly log cash, cards, bank transfers, and receipts. Native SMS sync parses debit alerts into ledger entries automatically.
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 pt-3 border-t border-border/60 flex items-center gap-2 text-[11px] text-indigo-400 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Real-time categorization</span>
                  </div>
                </Card>

                {/* Feature 2 */}
                <Card className="p-6 border border-border bg-surface hover:border-emerald-500/40 transition-all duration-300 rounded-2xl flex flex-col justify-between group">
                  <div className="space-y-4">
                    <div className="h-12 w-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center transition-transform group-hover:scale-105">
                      <PieChart className="h-6 w-6" />
                    </div>
                    <div className="space-y-1.5">
                      <div className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 uppercase tracking-wider">
                        Real Intelligence
                      </div>
                      <h3 className="font-display text-lg font-bold text-ink">
                        Smart Financial Insights
                      </h3>
                      <p className="text-xs sm:text-sm text-subtle leading-relaxed">
                        Instant weekly summaries, spending velocity indicators, and interactive category breakdowns that highlight where to cut waste.
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 pt-3 border-t border-border/60 flex items-center gap-2 text-[11px] text-emerald-400 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Trends &amp; velocity alerts</span>
                  </div>
                </Card>

                {/* Feature 3 */}
                <Card className="p-6 border border-border bg-surface hover:border-sky-500/40 transition-all duration-300 rounded-2xl flex flex-col justify-between group">
                  <div className="space-y-4">
                    <div className="h-12 w-12 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-500 flex items-center justify-center transition-transform group-hover:scale-105">
                      <ShieldCheck className="h-6 w-6" />
                    </div>
                    <div className="space-y-1.5">
                      <div className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-500/10 text-sky-400 uppercase tracking-wider">
                        Total Privacy
                      </div>
                      <h3 className="font-display text-lg font-bold text-ink">
                        Take Control of Savings
                      </h3>
                      <p className="text-xs sm:text-sm text-subtle leading-relaxed">
                        Set realistic monthly targets and category limits. 100% private ledger architecture keeps your financial records in your own hands.
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 pt-3 border-t border-border/60 flex items-center gap-2 text-[11px] text-sky-400 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Zero third-party tracking</span>
                  </div>
                </Card>
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <Button variant="secondary" size="md" onClick={() => setStage(2)} className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back</span>
                </Button>
                <Button variant="primary" size="md" onClick={() => setStage(4)} className="gap-2 px-6 shadow-md shadow-primary/20">
                  <span>Ready to Begin</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* STAGE 4: Final Welcome Action (Get Started / Sign In) */}
          {/* ======================================================== */}
          {stage === 4 && (
            <div className="flex flex-col items-center text-center animate-fade-in max-w-xl mx-auto space-y-8">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-1 text-xs font-semibold text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Setup Ready</span>
                </div>

                <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-ink">
                  Welcome to Money<span className="text-primary">Track</span>
                </h1>

                <p className="text-base sm:text-lg text-subtle">
                  Your personal finance journey starts here. Take control of your money with intelligence and discipline.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="w-full sm:w-80 space-y-3">
                {isAuthenticated ? (
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={() => handleFinish('/')}
                    className="w-full justify-center gap-2 py-3.5 text-base shadow-xl shadow-primary/25"
                  >
                    <span>Go to Dashboard</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="primary"
                      size="lg"
                      onClick={() => handleFinish('/login?mode=register')}
                      className="w-full justify-center gap-2 py-3.5 text-base shadow-xl shadow-primary/25"
                    >
                      <span>Get Started</span>
                      <ArrowRight className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={() => handleFinish('/login')}
                      className="w-full justify-center gap-2 py-3.5 text-base border-border"
                    >
                      <Lock className="h-4 w-4 text-subtle" />
                      <span>Sign In to Existing Account</span>
                    </Button>
                  </>
                )}
              </div>

              <div className="pt-4 border-t border-border/60 flex flex-wrap items-center justify-center gap-6 text-xs text-subtle">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  <span>Local-first security</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Zero tracking or telemetry</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                  <span>Instant performance</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Bottom Footer / Revisit info */}
      <footer className="relative z-20 flex items-center justify-between px-6 py-4 border-t border-border/40 text-xs text-subtle sm:px-10">
        <span>&copy; {new Date().getFullYear()} MoneyTrack</span>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setStage(1)}
            className="hover:text-ink transition-colors flex items-center gap-1 text-[11px]"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Replay Welcome</span>
          </button>
        </div>
      </footer>
    </div>
  )
}
