import {
  Calendar,
  PieChart,
  Plus,
  SlidersHorizontal,
  Tags,
  TrendingUp,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'

import { PageHeader } from '@/components/PageHeader'
import { PeriodPicker } from '@/components/PeriodPicker'
import { Button } from '@/components/ui/Button'
import { useExpenseDialog } from '@/components/ExpenseDialogProvider'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { usePeriod } from '@/hooks/usePeriod'
import { BreakdownPage } from '@/pages/BreakdownPage'
import { TrendsPage } from '@/pages/TrendsPage'
import { WeeklyReportPage } from '@/pages/WeeklyReportPage'
import { formatRangeLabel } from '@/utils/periods'

type AnalyticsView = 'breakdown' | 'trends' | 'weekly'

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
    <div className="page">
      <PageHeader
        eyebrow="Financial Intelligence"
        title="Analytics & Insights"
        description={
          activeView === 'weekly'
            ? 'Weekly performance digests and recurring commitments'
            : `${formatRangeLabel(period.range)} · Category allocations and temporal spending velocity`
        }
        actions={
          <div className="flex items-center gap-2">
            {activeView !== 'weekly' && (
              <PeriodPicker
                preset={period.preset}
                range={period.range}
                onPresetChange={period.setPreset}
                onCustomChange={period.setCustomRange}
              />
            )}
            <Link
              to="/expense-types"
              className="button button-secondary hidden sm:inline-flex items-center gap-1.5"
              title="Configure expense categories and colors"
            >
              <Tags className="h-4 w-4 text-muted" aria-hidden="true" />
              <span>Categories</span>
            </Link>
            <Button variant="primary" onClick={() => openCreate()}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Add expense</span>
            </Button>
          </div>
        }
      />

      {/* Segmented Switcher (Quiet Chrome) */}
      <div className="flex items-center justify-between border-b border-border mb-6">
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => handleViewChange('breakdown')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeView === 'breakdown'
                ? 'border-primary text-text font-semibold'
                : 'border-transparent text-muted hover:text-text hover:border-border'
            }`}
          >
            <PieChart className="h-4 w-4 text-muted" aria-hidden="true" />
            <span>Category Breakdown</span>
          </button>

          <button
            type="button"
            onClick={() => handleViewChange('trends')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeView === 'trends'
                ? 'border-primary text-text font-semibold'
                : 'border-transparent text-muted hover:text-text hover:border-border'
            }`}
          >
            <TrendingUp className="h-4 w-4 text-muted" aria-hidden="true" />
            <span>Spending Trends</span>
          </button>

          <button
            type="button"
            onClick={() => handleViewChange('weekly')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeView === 'weekly'
                ? 'border-primary text-text font-semibold'
                : 'border-transparent text-muted hover:text-text hover:border-border'
            }`}
          >
            <Calendar className="h-4 w-4 text-muted" aria-hidden="true" />
            <span>Weekly Report</span>
          </button>
        </div>

        <Link
          to="/expense-types"
          className="text-xs text-muted hover:text-primary transition-colors hidden md:flex items-center gap-1"
        >
          <SlidersHorizontal className="h-3 w-3" aria-hidden="true" />
          <span>Category settings</span>
        </Link>
      </div>

      {/* Embedded View */}
      <div className="transition-opacity duration-200">
        {activeView === 'breakdown' && <BreakdownPage embedded />}
        {activeView === 'trends' && <TrendsPage embedded />}
        {activeView === 'weekly' && <WeeklyReportPage embedded />}
      </div>
    </div>
  )
}
