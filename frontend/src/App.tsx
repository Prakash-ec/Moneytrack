import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ExpenseDialogProvider } from '@/components/ExpenseDialogProvider'
import { ScrollToTop } from '@/components/ScrollToTop'
import { PageSkeleton } from '@/components/ui/States'
import { AppLayout } from '@/layouts/AppLayout'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { AuthProvider, useAuth } from '@/providers/AuthProvider'
import { RefreshProvider } from '@/providers/RefreshProvider'
import { ThemeProvider } from '@/providers/ThemeProvider'
import { ToastProvider } from '@/providers/ToastProvider'
import { LoginPage } from '@/pages/LoginPage'
import { WELCOME_STORAGE_KEY } from '@/constants/branding'
import { addSmsReviewListener, getSmsLaunchUrl } from '@/services/sms'
import { useAndroidBackButton } from '@/hooks/useAndroidBackButton'

const WelcomePage = lazy(() =>
  import('@/pages/WelcomePage').then((module) => ({ default: module.WelcomePage })),
)

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
const ScannerPage = lazy(() =>
  import('@/pages/ScannerPage').then((module) => ({ default: module.ScannerPage })),
)
const IncomePage = lazy(() =>
  import('@/pages/IncomePage').then((module) => ({ default: module.IncomePage })),
)
const BankAccountsPage = lazy(() =>
  import('@/pages/BankAccountsPage').then((module) => ({ default: module.BankAccountsPage })),
)
const TransfersPage = lazy(() =>
  import('@/pages/TransfersPage').then((module) => ({ default: module.TransfersPage })),
)
const SecurityCentrePage = lazy(() => import('@/pages/SecurityCentrePage'))
const WeeklyReportPage = lazy(() => import('@/pages/WeeklyReportPage'))
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'))
const TransactionsPage = lazy(() =>
  import('@/pages/TransactionsPage').then((module) => ({ default: module.TransactionsPage })),
)
const AnalyticsPage = lazy(() =>
  import('@/pages/AnalyticsPage').then((module) => ({ default: module.AnalyticsPage })),
)

function Page({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
}

function DeepLinkHandler() {
  const navigate = useNavigate()

  useEffect(() => {
    const handleUrl = (url: string | null | undefined) => {
      if (!url) return
      if (
        url.includes('com.moneytrack.app://report') ||
        url.includes('/report') ||
        url.includes('weekly-report')
      ) {
        navigate('/weekly-report')
      } else if (
        url.includes('com.moneytrack.app://security') ||
        url.includes('/security')
      ) {
        navigate('/security')
      } else if (
        url.includes('com.moneytrack.app://notifications') ||
        url.includes('/notifications')
      ) {
        navigate('/notifications')
      } else if (
        url.includes('com.moneytrack.app://review') ||
        url.includes('/review') ||
        url.includes('sms-review')
      ) {
        navigate('/sms-review')
      }
    }

    void getSmsLaunchUrl().then(handleUrl)
    const cleanup = addSmsReviewListener(handleUrl)
    return cleanup
  }, [navigate])

  return null
}

function AndroidBackButtonHandler() {
  useAndroidBackButton()
  return null
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) {
    return <PageSkeleton />
  }
  if (!isAuthenticated) {
    let hasWelcomed = false
    try {
      hasWelcomed = Boolean(localStorage.getItem(WELCOME_STORAGE_KEY))
    } catch {
      hasWelcomed = false
    }
    if (!hasWelcomed) {
      return <Navigate to="/welcome" replace />
    }
    return <LoginPage />
  }
  return <>{children}</>
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <RefreshProvider>
              <BrowserRouter>
                <ScrollToTop />
                <DeepLinkHandler />
                <AndroidBackButtonHandler />
                <ExpenseDialogProvider>
                  <Routes>
                    <Route
                      path="/welcome"
                      element={
                        <Page>
                          <WelcomePage />
                        </Page>
                      }
                    />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<LoginPage initialMode="register" />} />
                    <Route
                      element={
                        <ProtectedRoute>
                          <AppLayout />
                        </ProtectedRoute>
                      }
                    >
                    <Route
                      path="/"
                      element={
                        <Page>
                          <HomePage />
                        </Page>
                      }
                    />
                    <Route
                      path="/transactions"
                      element={
                        <Page>
                          <TransactionsPage />
                        </Page>
                      }
                    />
                    <Route
                      path="/analytics"
                      element={
                        <Page>
                          <AnalyticsPage />
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
                      path="/income"
                      element={
                        <Page>
                          <IncomePage />
                        </Page>
                      }
                    />
                    <Route
                      path="/bank-accounts"
                      element={
                        <Page>
                          <BankAccountsPage />
                        </Page>
                      }
                    />
                    <Route
                      path="/transfers"
                      element={
                        <Page>
                          <TransfersPage />
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
                    <Route
                      path="/scanner"
                      element={
                        <Page>
                          <ScannerPage />
                        </Page>
                      }
                    />
                    <Route
                      path="/security"
                      element={
                        <Page>
                          <SecurityCentrePage />
                        </Page>
                      }
                    />
                    <Route
                      path="/weekly-report"
                      element={
                        <Page>
                          <WeeklyReportPage />
                        </Page>
                      }
                    />
                    <Route
                      path="/report"
                      element={
                        <Page>
                          <WeeklyReportPage />
                        </Page>
                      }
                    />
                    <Route
                      path="/weekly"
                      element={
                        <Page>
                          <WeeklyReportPage />
                        </Page>
                      }
                    />
                    <Route
                      path="/notifications"
                      element={
                        <Page>
                          <NotificationsPage />
                        </Page>
                      }
                    />
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                </Routes>
              </ExpenseDialogProvider>
            </BrowserRouter>
          </RefreshProvider>
        </AuthProvider>
      </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}
