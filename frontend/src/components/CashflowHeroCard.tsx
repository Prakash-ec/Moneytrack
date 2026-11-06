import {
  ArrowDownLeft,
  ArrowLeftRight,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  Plus,
  Scale,
} from 'lucide-react'
import { useState } from 'react'

import { formatINR, formatSignedINR } from '@/utils/currency'

export interface CashflowHeroCardProps {
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
  onManageAccounts?: () => void
}

export function CashflowHeroCard({
  totalPaise,
  transactionCount,
  periodLabel,
  totalBankBalancePaise = 0,
  reportedBankBalancePaise,
  linkedAccountsCount = 0,
  reconciled = true,
  discrepancyPaise = 0,
  incomeTotalPaise = 0,
  onAddExpense,
  onAddIncome,
  onTransfer,
  onScanReceipt,
  onManageAccounts,
}: CashflowHeroCardProps) {
  const [showBalance, setShowBalance] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return true
    return localStorage.getItem('moneytrack_show_balance') !== 'false'
  })

  const toggleShowBalance = () => {
    setShowBalance((prev) => {
      const next = !prev
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('moneytrack_show_balance', String(next))
      }
      return next
    })
  }

  const netCashflowPaise = incomeTotalPaise - totalPaise
  const isNetPositive = netCashflowPaise >= 0

  return (
    <div className="card p-5 sm:p-6 flex flex-col justify-between border border-border shadow-xs">
      {/* Top Header: Account Balance & Reconciliation Status */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              Total Available Balance
            </span>
            <button
              type="button"
              onClick={toggleShowBalance}
              className="text-muted hover:text-text transition-colors p-1"
              title={showBalance ? 'Hide balance' : 'Show balance'}
              aria-label={showBalance ? 'Hide balance' : 'Show balance'}
            >
              {showBalance ? (
                <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {linkedAccountsCount > 0 ? (
              reconciled ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary bg-primary-soft px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  <span>Reconciled</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-warning bg-warning-soft px-2 py-0.5 rounded-full">
                  <Scale className="h-3 w-3" aria-hidden="true" />
                  <span>Variance: {formatINR(discrepancyPaise)}</span>
                </span>
              )
            ) : null}
          </div>
        </div>

        {/* Hero Amount */}
        <div className="flex items-baseline justify-between mb-4">
          <div className="font-mono tabular-nums text-3xl sm:text-4xl font-bold tracking-tight text-text">
            {showBalance ? formatINR(totalBankBalancePaise) : '••••••••'}
          </div>
          {linkedAccountsCount > 0 && onManageAccounts ? (
            <button
              type="button"
              onClick={onManageAccounts}
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
            >
              <span>{linkedAccountsCount} {linkedAccountsCount === 1 ? 'account' : 'accounts'}</span>
            </button>
          ) : null}
        </div>

        {/* Cashflow Summary Micro-Grid */}
        <div className="flex items-center justify-between text-[11px] text-muted mb-2">
          <span>{periodLabel} ({transactionCount} {transactionCount === 1 ? 'tx' : 'txs'})</span>
          {reportedBankBalancePaise != null && (
            <span className="font-mono text-[10px]">SMS: {formatINR(reportedBankBalancePaise)}</span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2.5 p-3 rounded-xl bg-surface-raised border border-border mb-5">
          <div>
            <div className="text-[10px] font-medium text-muted uppercase tracking-wider flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span>Inflow</span>
            </div>
            <div className="font-mono tabular-nums text-xs sm:text-sm font-semibold text-primary mt-1">
              {showBalance ? `+${formatINR(incomeTotalPaise)}` : '••••'}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-medium text-muted uppercase tracking-wider flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-danger" />
              <span>Outflow</span>
            </div>
            <div className="font-mono tabular-nums text-xs sm:text-sm font-semibold text-danger mt-1">
              {showBalance ? `-${formatINR(totalPaise)}` : '••••'}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-medium text-muted uppercase tracking-wider flex items-center gap-1">
              <span
                className={`h-1.5 w-1.5 rounded-full ${isNetPositive ? 'bg-primary' : 'bg-danger'}`}
              />
              <span>Net</span>
            </div>
            <div
              className={`font-mono tabular-nums text-xs sm:text-sm font-bold mt-1 ${
                isNetPositive ? 'text-primary' : 'text-danger'
              }`}
            >
              {showBalance ? formatSignedINR(netCashflowPaise) : '••••'}
            </div>
          </div>
        </div>
      </div>

      {/* Primary Action Button Grid (Thumb-Friendly) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-border">
        <button
          type="button"
          onClick={onAddExpense}
          className="button button-primary button-sm flex items-center justify-center gap-1.5 w-full font-semibold"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Expense</span>
        </button>

        {onAddIncome && (
          <button
            type="button"
            onClick={onAddIncome}
            className="button button-secondary button-sm flex items-center justify-center gap-1.5 w-full font-semibold"
          >
            <ArrowDownLeft className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span>Income</span>
          </button>
        )}

        {onTransfer && (
          <button
            type="button"
            onClick={onTransfer}
            className="button button-secondary button-sm flex items-center justify-center gap-1.5 w-full font-semibold"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Transfer</span>
          </button>
        )}

        <button
          type="button"
          onClick={onScanReceipt}
          className="button button-secondary button-sm flex items-center justify-center gap-1.5 w-full font-semibold"
        >
          <Camera className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Scan</span>
        </button>
      </div>
    </div>
  )
}
