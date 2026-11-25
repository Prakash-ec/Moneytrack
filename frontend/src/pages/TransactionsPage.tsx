import { ArrowDownLeft, ArrowLeftRight, Plus, Receipt, ScanLine } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'

import { AppPage } from '@/components/AppPage'
import { PageHeader } from '@/components/PageHeader'
import { PeriodPicker } from '@/components/PeriodPicker'
import { Button } from '@/components/ui/Button'
import { useExpenseDialog } from '@/components/ExpenseDialogProvider'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { usePeriod } from '@/hooks/usePeriod'
import { ExpensesPage } from '@/pages/ExpensesPage'
import { IncomePage } from '@/pages/IncomePage'
import { TransfersPage } from '@/pages/TransfersPage'
import { cn } from '@/utils/cn'
import { formatRangeLabel } from '@/utils/periods'

type TransactionTab = 'expenses' | 'income' | 'transfers'

const TABS: Array<{
  id: TransactionTab
  label: string
  shortLabel: string
  icon: typeof Receipt
  description: string
}> = [
  {
    id: 'expenses',
    label: 'Expenses',
    shortLabel: 'Expenses',
    icon: Receipt,
    description: 'Money leaving your accounts',
  },
  {
    id: 'income',
    label: 'Income & inflows',
    shortLabel: 'Income',
    icon: ArrowDownLeft,
    description: 'Money arriving',
  },
  {
    id: 'transfers',
    label: 'Account transfers',
    shortLabel: 'Transfers',
    icon: ArrowLeftRight,
    description: 'Internal movement',
  },
]

export function TransactionsPage() {
  useDocumentTitle('Transactions & Ledger')
  const period = usePeriod()
  const [searchParams, setSearchParams] = useSearchParams()
  const { openCreate, openScanReceipt } = useExpenseDialog()

  const tabParam = searchParams.get('tab') as TransactionTab | null
  const activeTab: TransactionTab =
    tabParam === 'income' || tabParam === 'transfers' ? tabParam : 'expenses'
  const active = TABS.find((tab) => tab.id === activeTab) ?? TABS[0]

  const handleTabChange = (newTab: TransactionTab) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('tab', newTab)
    setSearchParams(nextParams, { replace: true })
  }

  return (
    <AppPage>
      <PageHeader
        eyebrow="Ledger"
        title="Transactions"
        description={`${formatRangeLabel(period.range)} · Expenses, income and internal transfers`}
        actions={
          <>
            <PeriodPicker
              preset={period.preset}
              range={period.range}
              onPresetChange={period.setPreset}
              onCustomChange={period.setCustomRange}
            />
            {activeTab === 'expenses' ? (
              <>
                <Button variant="secondary" onClick={openScanReceipt} className="hidden sm:inline-flex">
                  <ScanLine className="h-4 w-4" aria-hidden="true" />
                  Scan receipt
                </Button>
                <Button variant="primary" onClick={() => openCreate()}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add expense
                </Button>
              </>
            ) : null}
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="grid w-full grid-cols-3 gap-1 rounded-lg border border-border bg-surface p-1 sm:w-auto"
          role="tablist"
          aria-label="Ledger view"
        >
          {TABS.map((tab) => {
            const selected = tab.id === activeTab
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="ledger-panel"
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  'inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                  selected
                    ? 'bg-surface-raised text-text shadow-sm'
                    : 'text-muted hover:text-text',
                )}
              >
                <tab.icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="sm:hidden">{tab.shortLabel}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            )
          })}
        </div>

        <p className="text-[11px] text-muted sm:text-right">
          <span className="font-medium text-text">{active.label}</span> · {active.description}
        </p>
      </div>

      <div id="ledger-panel" role="tabpanel" className="mt-4">
        {activeTab === 'expenses' ? <ExpensesPage embedded /> : null}
        {activeTab === 'income' ? <IncomePage embedded /> : null}
        {activeTab === 'transfers' ? <TransfersPage embedded /> : null}
      </div>

      {activeTab === 'expenses' ? (
        <p className="mt-4 text-[11px] leading-5 text-muted">
          Looking for a payment detected from SMS?{' '}
          <Link to="/sms-review" className="font-medium text-primary hover:underline">
            Open SMS review
          </Link>
          . Nothing posts there until you confirm it.
        </p>
      ) : null}
    </AppPage>
  )
}
