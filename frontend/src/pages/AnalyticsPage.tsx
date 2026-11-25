import { CalendarDays, PieChart, Plus, Tags, TrendingUp } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'

import { AppPage } from '@/components/AppPage'
import { PageHeader } from '@/components/PageHeader'
import { PeriodPicker } from '@/components/PeriodPicker'
import { Button, buttonClasses } from '@/components/ui/Button'
import { useExpenseDialog } from '@/components/ExpenseDialogProvider'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { usePeriod } from '@/hooks/usePeriod'
import { BreakdownPage } from '@/pages/BreakdownPage'
import { TrendsPage } from '@/pages/TrendsPage'
import { WeeklyReportPage } from '@/pages/WeeklyReportPage'
import { cn } from '@/utils/cn'
import { formatRangeLabel } from '@/utils/periods'

type AnalyticsView = 'breakdown' | 'trends' | 'weekly'

const VIEWS: Array<{
  id: AnalyticsView
  label: string
  shortLabel: string
  icon: typeof PieChart
}> = [
  { id: 'breakdown', label: 'Category breakdown', shortLabel: 'Categories', icon: PieChart },
  { id: 'trends', label: 'Spending trends', shortLabel: 'Trends', icon: TrendingUp },
  { id: 'weekly', label: 'Weekly report', shortLabel: 'Weekly', icon: CalendarDays },
]

export function AnalyticsPage() {
  useDocumentTitle('Analytics & Insights')
  const period = usePeriod()
  const [searchParams, setSearchParams] = useSearchParams()
  const { openCreate } = useExpenseDialog()

  const viewParam = searchParams.get('view') as AnalyticsView | null
  const activeView: AnalyticsView =
    viewParam === 'trends' || viewParam === 'weekly' ? viewParam : 'breakdown'

  const handleViewChange = (newView: AnalyticsView) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('view', newView)
    setSearchParams(nextParams, { replace: true })
  }

  return (
    <AppPage>
      <PageHeader
        eyebrow="Analytics"
        title="Where the money goes"
        description={
          activeView === 'weekly'
            ? 'Weekly performance digest and recurring commitments.'
            : `${formatRangeLabel(period.range)} · Asia/Kolkata`
        }
        actions={
          <>
            {activeView !== 'weekly' ? (
              <PeriodPicker
                preset={period.preset}
                range={period.range}
                onPresetChange={period.setPreset}
                onCustomChange={period.setCustomRange}
              />
            ) : null}
            <Link to="/expense-types" className={buttonClasses('secondary', 'md', 'hidden sm:inline-flex')}>
              <Tags className="h-4 w-4" aria-hidden="true" />
              Categories
            </Link>
            <Button variant="primary" onClick={() => openCreate()}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add expense
            </Button>
          </>
        }
      />

      <div
        className="grid w-full grid-cols-3 gap-1 rounded-lg border border-border bg-surface p-1 sm:w-auto sm:max-w-md"
        role="tablist"
        aria-label="Analytics view"
      >
        {VIEWS.map((view) => {
          const selected = view.id === activeView
          return (
            <button
              key={view.id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="analytics-panel"
              onClick={() => handleViewChange(view.id)}
              className={cn(
                'inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                selected ? 'bg-surface-raised text-text shadow-sm' : 'text-muted hover:text-text',
              )}
            >
              <view.icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="sm:hidden">{view.shortLabel}</span>
              <span className="hidden sm:inline">{view.label}</span>
            </button>
          )
        })}
      </div>

      <div id="analytics-panel" role="tabpanel" className="mt-4">
        {activeView === 'breakdown' ? <BreakdownPage embedded /> : null}
        {activeView === 'trends' ? <TrendsPage embedded /> : null}
        {activeView === 'weekly' ? <WeeklyReportPage embedded /> : null}
      </div>
    </AppPage>
  )
}
