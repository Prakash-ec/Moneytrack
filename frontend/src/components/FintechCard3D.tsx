import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Building2,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  Plus,
  Search,
  Sparkles,
  Wifi,
} from 'lucide-react'
import { useState, type MouseEvent, type TouchEvent } from 'react'

import { formatINR } from '@/utils/currency'

interface FintechCard3DProps {
  totalPaise: number
  transactionCount: number
  periodLabel: string
  totalBankBalancePaise?: number
  reportedBankBalancePaise?: number | null
  linkedAccountsCount?: number
  reconciled?: boolean
  discrepancyPaise?: number
  incomeTotalPaise?: number
  onAddExpense: () => void
  onAddIncome?: () => void
  onTransfer?: () => void
  onScanReceipt: () => void
  onOpenSearch: () => void
  onManageAccounts?: () => void
}

export function FintechCard3D({
  totalPaise,
  transactionCount,
  periodLabel,
  totalBankBalancePaise,
  reportedBankBalancePaise,
  linkedAccountsCount = 0,
  reconciled = true,
  discrepancyPaise = 0,
  incomeTotalPaise = 0,
  onAddExpense,
  onAddIncome,
  onTransfer,
  onScanReceipt,
  onOpenSearch,
  onManageAccounts,
}: FintechCard3DProps) {
  const [rotateX, setRotateX] = useState(0)
  const [rotateY, setRotateY] = useState(0)
  const [glarePos, setGlarePos] = useState({ x: 50, y: 50, opacity: 0 })
  const [showBalance, setShowBalance] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return true
    return localStorage.getItem('moneytrack_show_balance') !== 'false'
  })
  const [activeTab, setActiveTab] = useState<'balance' | 'outflow'>('balance')

  const toggleShowBalance = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowBalance((prev) => {
      const next = !prev
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('moneytrack_show_balance', String(next))
      }
      return next
    })
  }

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget
    const rect = card.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const centerX = rect.width / 2
    const centerY = rect.height / 2

    const rotX = -((y - centerY) / centerY) * 10
    const rotY = ((x - centerX) / centerX) * 12

    setRotateX(rotX)
    setRotateY(rotY)
    setGlarePos({
      x: (x / rect.width) * 100,
      y: (y / rect.height) * 100,
      opacity: 0.35,
    })
  }

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (!e.touches[0]) return
    const touch = e.touches[0]
    const card = e.currentTarget
    const rect = card.getBoundingClientRect()
    const x = touch.clientX - rect.left
    const y = touch.clientY - rect.top
    const centerX = rect.width / 2
    const centerY = rect.height / 2

    const rotX = -((y - centerY) / centerY) * 8
    const rotY = ((x - centerX) / centerX) * 10

    setRotateX(rotX)
    setRotateY(rotY)
    setGlarePos({
      x: (x / rect.width) * 100,
      y: (y / rect.height) * 100,
      opacity: 0.35,
    })
  }

  const handleReset = () => {
    setRotateX(0)
    setRotateY(0)
    setGlarePos((prev) => ({ ...prev, opacity: 0 }))
  }

  const hasBankBalance = totalBankBalancePaise !== undefined
  const displayAmount = activeTab === 'balance' && hasBankBalance
    ? totalBankBalancePaise
    : totalPaise

  return (
    <div className="w-full mb-6">
      <div
        className="fintech-card-wrapper"
        style={{ perspective: '1100px' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleReset}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleReset}
      >
        <div
          className="fintech-card-3d cursor-pointer select-none"
          onClick={() => hasBankBalance && setActiveTab((t) => (t === 'balance' ? 'outflow' : 'balance'))}
          style={{
            transform: `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
            transition: rotateX === 0 ? 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
          }}
        >
          {/* Holographic specular shine / glare overlay */}
          <div
            className="fintech-card-glare"
            style={{
              background: `radial-gradient(circle at ${glarePos.x}% ${glarePos.y}%, rgba(255, 255, 255, ${glarePos.opacity}) 0%, transparent 60%)`,
            }}
          />

          {/* Card Header: Chip, Contactless Wave, Accounts & Eye Toggle */}
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-2.5">
              {/* EMV Microchip */}
              <div className="emv-chip" aria-label="Security chip">
                <div className="emv-chip-line" />
                <div className="emv-chip-line horizontal" />
              </div>
              {/* Contactless Wave */}
              <Wifi
                className="h-4 w-4 text-white/70 rotate-90"
                strokeWidth={2.2}
                aria-hidden="true"
              />
              {/* Linked Accounts Badge */}
              {linkedAccountsCount > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onManageAccounts?.()
                  }}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/15 hover:bg-white/25 border border-white/25 text-[10px] font-semibold text-white/90 transition-colors"
                >
                  <Building2 className="h-3 w-3 text-sky-300" aria-hidden="true" />
                  <span>{linkedAccountsCount} Bank{linkedAccountsCount > 1 ? 's' : ''}</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {/* Reconciliation Status Pill */}
              {hasBankBalance && (
                <div
                  title={reportedBankBalancePaise != null ? `Bank reported: ${formatINR(reportedBankBalancePaise)}` : undefined}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase border backdrop-blur-md ${
                    reconciled && discrepancyPaise === 0
                      ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30'
                      : 'bg-amber-500/20 text-amber-200 border-amber-400/30'
                  }`}
                >
                  {reconciled && discrepancyPaise === 0 ? (
                    <>
                      <CheckCircle2 className="h-2.5 w-2.5 text-emerald-300" aria-hidden="true" />
                      <span>Reconciled</span>
                    </>
                  ) : (
                    <span>Δ {formatINR(Math.abs(discrepancyPaise))}</span>
                  )}
                </div>
              )}

              {/* Show / Hide Balance Toggle */}
              <button
                type="button"
                onClick={toggleShowBalance}
                title={showBalance ? 'Hide balance' : 'Show balance'}
                className="p-1 rounded-full bg-white/10 hover:bg-white/20 text-white/80 transition-colors"
                aria-label={showBalance ? 'Hide balance' : 'Show balance'}
              >
                {showBalance ? (
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {/* Card Body: Balance / Outflow display with switch */}
          <div className="my-auto py-1 relative z-10">
            <div className="flex items-center justify-between text-[11px] font-semibold tracking-wider text-white/75 uppercase">
              <span className="flex items-center gap-1.5">
                {activeTab === 'balance' && hasBankBalance ? (
                  <>
                    <Sparkles className="h-3 w-3 text-sky-300" aria-hidden="true" />
                    <span>Consolidated Bank Balance</span>
                  </>
                ) : (
                  <span>{periodLabel} Outflow</span>
                )}
              </span>

              {hasBankBalance && (
                <div className="flex items-center gap-1 text-[9px] bg-black/30 rounded-md p-0.5 border border-white/10">
                  <span
                    className={`px-1.5 py-0.5 rounded ${
                      activeTab === 'balance' ? 'bg-white/25 text-white font-bold' : 'text-white/60'
                    }`}
                  >
                    Balance
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded ${
                      activeTab === 'outflow' ? 'bg-white/25 text-white font-bold' : 'text-white/60'
                    }`}
                  >
                    Outflow
                  </span>
                </div>
              )}
            </div>

            <div className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight font-display tabular-nums drop-shadow-[0_2px_10px_rgba(0,0,0,0.4)] mt-1">
              {showBalance ? formatINR(displayAmount) : '••••••••'}
            </div>

            {/* Income & Expense Live Indicators */}
            <div className="flex items-center gap-3 mt-2">
              <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-300 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-400/20 tabular-nums">
                <ArrowDownLeft className="h-3 w-3" aria-hidden="true" />
                <span>In: {showBalance ? formatINR(incomeTotalPaise) : '•••'}</span>
              </div>
              <div className="flex items-center gap-1 text-[11px] font-medium text-rose-300 bg-rose-500/15 px-2 py-0.5 rounded-full border border-rose-400/20 tabular-nums">
                <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                <span>Out: {showBalance ? formatINR(totalPaise) : '•••'}</span>
              </div>
              {transactionCount > 0 && (
                <span className="text-[10px] text-white/60 ml-auto hidden sm:inline">
                  {transactionCount} txns
                </span>
              )}
            </div>
          </div>

          {/* Card Footer: Masked Number & Security Info */}
          <div className="flex items-end justify-between relative z-10 pt-2 border-t border-white/15">
            <div>
              <div className="font-mono text-xs sm:text-sm tracking-[0.2em] text-white/80 drop-shadow">
                •••• •••• •••• 8824
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-white/65 mt-0.5">
                Encrypted · Zero Tracking
              </div>
            </div>

            <div className="text-right">
              <div className="text-[9px] font-medium text-white/60 uppercase">Currency</div>
              <div className="text-xs font-bold text-white tracking-wider">INR (₹)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Action Dock directly under Card for mobile thumb reach */}
      <div className="grid grid-cols-5 gap-1.5 mt-3 sm:hidden">
        <button
          type="button"
          onClick={onAddExpense}
          className="flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl bg-surface border border-border shadow-2xs text-[10px] font-semibold text-text active:scale-95 transition-transform"
        >
          <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          </div>
          <span>Expense</span>
        </button>

        {onAddIncome && (
          <button
            type="button"
            onClick={onAddIncome}
            className="flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl bg-surface border border-border shadow-2xs text-[10px] font-semibold text-text active:scale-95 transition-transform"
          >
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
              <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </div>
            <span>Income</span>
          </button>
        )}

        {onTransfer && (
          <button
            type="button"
            onClick={onTransfer}
            className="flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl bg-surface border border-border shadow-2xs text-[10px] font-semibold text-text active:scale-95 transition-transform"
          >
            <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-500">
              <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
            </div>
            <span>Transfer</span>
          </button>
        )}

        <button
          type="button"
          onClick={onScanReceipt}
          className="flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl bg-surface border border-border shadow-2xs text-[10px] font-semibold text-text active:scale-95 transition-transform"
        >
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <Camera className="h-3.5 w-3.5" aria-hidden="true" />
          </div>
          <span>Scan</span>
        </button>

        <button
          type="button"
          onClick={onOpenSearch}
          className="flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl bg-surface border border-border shadow-2xs text-[10px] font-semibold text-text active:scale-95 transition-transform"
        >
          <div className="p-1.5 rounded-lg bg-surface-raised text-muted">
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
          </div>
          <span>Search</span>
        </button>
      </div>
    </div>
  )
}
