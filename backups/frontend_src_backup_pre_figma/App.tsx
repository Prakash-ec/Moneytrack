import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ExpenseDialogProvider } from '@/components/ExpenseDialogProvider'
import { ScrollToTop } from '@/components/ScrollToTop'
import { PageSkeleton } from '@/components/ui/States'
import { AppLayout } from '@/layouts/AppLayout'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { RefreshProvider } from '@/providers/RefreshProvider'
import { ThemeProvider } from '@/providers/ThemeProvider'
import { ToastProvider } from '@/providers/ToastProvider'

const HomePage = lazy(() =>
  import('@/pages/HomePage').then((module) => ({ default: module.HomePage })),
)
const ExpensesPage = lazy(() =>
  import('@/pages/ExpensesPage').then((module) => ({ default: module.ExpensesPage })),
)
const BreakdownPage = lazy(() =>
  import('@/pages/BreakdownPage').then((module) => ({ default: module.BreakdownPage })),
)
const TypesPage = lazy(() =>
  import('@/pages/TypesPage').then((module) => ({ default: module.TypesPage })),
)
const TypeDetailPage = lazy(() =>
  import('@/pages/TypeDetailPage').then((module) => ({ default: module.TypeDetailPage })),
)
const TrendsPage = lazy(() =>
  import('@/pages/TrendsPage').then((module) => ({ default: module.TrendsPage })),
)
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
)
const SmsReviewPage = lazy(() =>
  import('@/pages/SmsReviewPage').then((module) => ({ default: module.SmsReviewPage })),
)

function Page({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <RefreshProvider>
            <BrowserRouter>
              <ScrollToTop />
              <ExpenseDialogProvider>
                <Routes>
                  <Route element={<AppLayout />}>
                    <Route
                      path="/"
                      element={
                        <Page>
                          <HomePage />
                        </Page>
                      }
                    />
                    <Route
                      path="/expenses"
                      element={
                        <Page>
                          <ExpensesPage />
                        </Page>
                      }
                    />
                    <Route
                      path="/breakdown"
                      element={
                        <Page>
                          <BreakdownPage />
                        </Page>
                      }
                    />
                    <Route
                      path="/expense-types"
                      element={
                        <Page>
                          <TypesPage />
                        </Page>
                      }
                    />
                    <Route
                      path="/expense-types/:typeId"
                      element={
                        <Page>
                          <TypeDetailPage />
                        </Page>
                      }
                    />
                    <Route
                      path="/trends"
                      element={
                        <Page>
                          <TrendsPage />
                        </Page>
                      }
                    />
                    <Route
                      path="/settings"
                      element={
                        <Page>
                          <SettingsPage />
                        </Page>
                      }
                    />
                    <Route
                      path="/sms-review"
                      element={
                        <Page>
                          <SmsReviewPage />
                        </Page>
                      }
                    />
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                </Routes>
              </ExpenseDialogProvider>
            </BrowserRouter>
          </RefreshProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}
