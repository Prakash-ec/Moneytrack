import {
  ArrowDownLeft,
  ArrowLeftRight,
  MessageSquareText,
  Plus,
  Receipt,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { PageHeader } from '@/components/PageHeader'
import { PeriodPicker } from '@/components/PeriodPicker'
import { Button } from '@/components/ui/Button'
import { useExpenseDialog } from '@/components/ExpenseDialogProvider'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { usePeriod } from '@/hooks/usePeriod'
import { ExpensesPage } from '@/pages/ExpensesPage'
import { IncomePage } from '@/pages/IncomePage'
import { TransfersPage } from '@/pages/TransfersPage'
import { SmsPlugin } from '@/services/sms'
import { formatRangeLabel } from '@/utils/periods'

type TransactionTab = 'expenses' | 'income' | 'transfers'

export function TransactionsPage() {
  useDocumentTitle('Transactions & Ledger')
  const period = usePeriod()
  const [searchParams, setSearchParams] = useSearchParams()
  const { openCreate, openScanReceipt } = useExpenseDialog()
  const [unreviewedSmsCount, setUnreviewedSmsCount] = useState(0)

  // Determine active tab from URL query param `tab` (defaults to 'expenses')
  const tabParam = searchParams.get('tab') as TransactionTab | null
  const activeTab: TransactionTab =
    tabParam === 'income' || tabParam === 'transfers' ? tabParam : 'expenses'

  const handleTabChange = (newTab: TransactionTab) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('tab', newTab)
    setSearchParams(nextParams, { replace: true })
  }

  // Check pending bank SMS count on Android/desktop
  useEffect(() => {
    let cancelled = false
    const checkSms = async () => {
      try {
        const pending = await SmsPlugin.getPendingTransactions()
        if (!cancelled && pending?.items) {
          setUnreviewedSmsCount(pending.items.length)
        }
      } catch {
        // Fallback: SMS plugin not available on web
      }
    }
    checkSms()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="page">
      {/* Pending SMS notification banner */}
      {unreviewedSmsCount > 0 && (
        <div className="mb-4 p-3.5 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-between text-xs text-text animate-fade-in">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-lg bg-primary/20 text-primary">
              <MessageSquareText className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <span className="font-semibold text-text">
                {unreviewedSmsCount} new bank SMS detected
              </span>
              <span className="text-muted ml-1.5 hidden sm:inline">
                Import expenses and reconcile bank accounts automatically.
              </span>
            </div>
          </div>
          <Link
            to="/sms-review"
            className="px-3 py-1.5 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors shrink-0"
          >
            Review SMS
          </Link>
        </div>
      )}

      {/* Main Ledger Header */}
      <PageHeader
        eyebrow="Financial Ledger"
        title="Transactions"
        description={`${formatRangeLabel(period.range)} · All financial movements`}
        actions={
          <div className="flex items-center gap-2">
            <PeriodPicker
              preset={period.preset}
              range={period.range}
              onPresetChange={period.setPreset}
              onCustomChange={period.setCustomRange}
            />
            {activeTab === 'expenses' && (
              <>
                <Button variant="secondary" onClick={() => openScanReceipt()} title="Scan bill receipt">
                  <Receipt className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Scan receipt</span>
                </Button>
                <Button variant="primary" onClick={() => openCreate()}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>Add expense</span>
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Segmented Tab Switcher (Quiet Chrome) */}
      <div className="flex items-center justify-between border-b border-border mb-6">
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => handleTabChange('expenses')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === 'expenses'
                ? 'border-primary text-text font-semibold'
                : 'border-transparent text-muted hover:text-text hover:border-border'
            }`}
          >
            <Receipt className="h-4 w-4 text-muted" aria-hidden="true" />
            <span>Expenses</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('income')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === 'income'
                ? 'border-primary text-text font-semibold'
                : 'border-transparent text-muted hover:text-text hover:border-border'
            }`}
          >
            <ArrowDownLeft className="h-4 w-4 text-emerald-500" aria-hidden="true" />
            <span>Income & Inflows</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('transfers')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === 'transfers'
                ? 'border-primary text-text font-semibold'
                : 'border-transparent text-muted hover:text-text hover:border-border'
            }`}
          >
            <ArrowLeftRight className="h-4 w-4 text-blue-500" aria-hidden="true" />
            <span>Account Transfers</span>
          </button>
        </div>
      </div>

      {/* Active Tab View */}
      <div className="transition-opacity duration-200">
        {activeTab === 'expenses' && <ExpensesPage embedded />}
        {activeTab === 'income' && <IncomePage embedded />}
        {activeTab === 'transfers' && <TransfersPage embedded />}
      </div>
    </div>
  )
}
