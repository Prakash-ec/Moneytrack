import type {
  AccountReconciliation,
  AccountTransfer,
  AnalyticsSummary,
  ArchivedFilter,
  BankAccount,
  BankAccountCreateInput,
  BankAccountList,
  BankAccountUpdateInput,
  ByTypeResponse,
  CashFlowSummary,
  ComparisonResponse,
  Expense,
  ExpenseCreateInput,
  ExpensePage,
  ExpenseType,
  ExpenseTypeCreateInput,
  ExpenseTypePeriodSummary,
  ExpenseTypeUpdateInput,
  ExpenseUpdateInput,
  Granularity,
  DatabaseHealthResponse,
  HealthResponse,
  Income,
  IncomeCreateInput,
  IncomePage,
  IncomeType,
  IncomeTypeCreateInput,
  IncomeTypeList,
  IncomeTypeUpdateInput,
  IncomeUpdateInput,
  NotificationCenterSummary,
  NotificationLog,
  NotificationPreferences,
  Page,
  ReceiptParseResult,
  RestoreSummary,
  SecurityActionResponse,
  SecurityAlert,
  SecuritySummary,
  SortOrder,
  TransferCreateInput,
  TransferList,
  TrendsResponse,
  WeeklyReportData,
} from '@/types/api'

export const DEFAULT_API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/+$/, '')

/**
 * Normalizes any user-entered or configured URL into a standard MoneyTrack API base.
 * Ensures scheme, trims trailing slashes, and ensures `/api` path prefix exists.
 */
export function normalizeApiBaseUrl(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_API_BASE
  let url = raw.trim().replace(/\/+$/, '')
  if (!url) return DEFAULT_API_BASE

  // Handle local relative addresses
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    if (!url.startsWith('/')) {
      url = `/${url}`
    }
  }

  // Ensure /api prefix is present for backend routing
  if (!url.endsWith('/api')) {
    url = `${url}/api`
  }
  return url
}

let runtimeBase: string | null = null

function loadRuntimeBase(): string | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const saved = localStorage.getItem('moneytrack-api-base')
    return saved ? normalizeApiBaseUrl(saved) : null
  } catch {
    return null
  }
}

runtimeBase = loadRuntimeBase()

/**
 * Override the API base URL at runtime (used on Android / Settings to configure server).
 * Persisted to localStorage and dispatches an event so all UI components update.
 */
export function setApiBase(url: string | null): void {
  const normalized = url ? normalizeApiBaseUrl(url) : null
  runtimeBase = normalized
  if (typeof localStorage !== 'undefined') {
    try {
      if (normalized) localStorage.setItem('moneytrack-api-base', normalized)
      else localStorage.removeItem('moneytrack-api-base')
    } catch {
      // ignore storage quota/security errors
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('moneytrack:api-base-changed', { detail: normalized }))
  }
}

export function getApiBase(): string {
  if (runtimeBase) return runtimeBase
  return DEFAULT_API_BASE
}

function apiBase(): string {
  return getApiBase()
}

export class ApiError extends Error {
  readonly status: number
  readonly detail: unknown
  readonly isHtmlResponse: boolean

  constructor(message: string, status: number, detail?: unknown, isHtmlResponse = false) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.isHtmlResponse = isHtmlResponse
  }
}

type QueryValue = string | number | boolean | null | undefined

export function toQueryString(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    search.set(key, String(value))
  })
  const query = search.toString()
  return query ? `?${query}` : ''
}

function extractMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'detail' in payload) {
    const detail = (payload as { detail: unknown }).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) => {
          if (item && typeof item === 'object' && 'msg' in item) {
            const msg = String((item as { msg: unknown }).msg)
            const location = Array.isArray((item as { loc?: unknown }).loc)
              ? (item as { loc: unknown[] }).loc.slice(1).join('.')
              : ''
            return location ? `${location}: ${msg}` : msg
          }
          return null
        })
        .filter(Boolean)
      if (messages.length) return messages.join(' ')
    }
    if (detail && typeof detail === 'object') {
      try {
        return JSON.stringify(detail)
      } catch {
        // fallback
      }
    }
  }
  return fallback
}

export interface RequestOptions extends RequestInit {
  timeoutMs?: number
  idempotencyKey?: string
  retries?: number
  retryDelayMs?: number
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase()
  const isIdempotent = ['GET', 'HEAD', 'OPTIONS'].includes(method) || Boolean(options.idempotencyKey)
  const isTest = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.MODE === 'test'

  // Default retries: 2 for idempotent requests or requests with idempotencyKey, 0 for non-idempotent writes
  const maxRetries = options.retries !== undefined ? options.retries : (isIdempotent ? 2 : 0)
  const defaultDelay = isTest ? 10 : 2500
  const retryDelayMs = options.retryDelayMs ?? defaultDelay
  const timeoutMs = options.timeoutMs ?? 45000

  let attempt = 0

  while (true) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    let response: Response | null = null
    const targetUrl = `${apiBase()}${path}`

    try {
      const token =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem('moneytrack_auth_token')
          : null
      const headers: Record<string, string> = {
        Accept: 'application/json',
        ...((options.body && !(options.body instanceof FormData)) ? { 'Content-Type': 'application/json' } : {}),
        ...(options.idempotencyKey ? { 'X-Idempotency-Key': options.idempotencyKey, 'Idempotency-Key': options.idempotencyKey } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...((options.headers as Record<string, string>) ?? {}),
      }

      response = await fetch(targetUrl, {
        ...options,
        headers,
        signal: controller.signal,
      })
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      const isAbort = err instanceof Error && err.name === 'AbortError'

      // Transient cold start timeout or connection failure: retry if retries left
      if (attempt < maxRetries) {
        attempt++
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('moneytrack:backend-waking', {
              detail: { waking: true, attempt, maxRetries },
            })
          )
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt))
        continue
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('moneytrack:backend-waking', { detail: { waking: false, failed: true } })
        )
      }

      if (isAbort) {
        throw new ApiError(
          `Request to ${path} timed out after ${Math.round(timeoutMs / 1000)}s. Please check your network or server.`,
          0,
        )
      }
      throw new ApiError(
        'Could not reach the MoneyTrack API. Check that the backend server is running and the URL is correct.',
        0,
      )
    } finally {
      clearTimeout(timeoutId)
    }

    // Read response text safely
    const responseText = await response.text()
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
    const isHtml =
      contentType.includes('text/html') ||
      responseText.trim().toLowerCase().startsWith('<!doctype') ||
      responseText.trim().toLowerCase().startsWith('<html')

    // Handle Render cold start 502/503/504 gateway error pages
    const isTransientGatewayError = [502, 503, 504].includes(response.status) || (isHtml && response.status >= 500)
    if (isTransientGatewayError && attempt < maxRetries) {
      attempt++
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('moneytrack:backend-waking', {
            detail: { waking: true, attempt, maxRetries },
          })
        )
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt))
      continue
    }

    // Check if server returned HTML instead of JSON
    if (isHtml) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('moneytrack:backend-waking', { detail: { waking: false, failed: true } })
        )
      }
      const msg =
        `Received an HTML webpage instead of a JSON response (HTTP ${response.status}). ` +
        `Check your Backend URL in Settings (ensure it reaches the MoneyTrack API).`
      throw new ApiError(msg, response.status, { rawText: responseText.slice(0, 160) }, true)
    }

    if (!response.ok) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('moneytrack:backend-waking', { detail: { waking: false, failed: true } })
        )
      }
      if (response.status === 401) {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('moneytrack_auth_token')
          localStorage.removeItem('moneytrack_auth_user')
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('moneytrack:unauthorized'))
        }
      }
      let payload: unknown = null
      try {
        if (responseText.trim()) payload = JSON.parse(responseText)
      } catch {
        payload = null
      }
      throw new ApiError(
        extractMessage(payload, `Request failed with status ${response.status}.`),
        response.status,
        payload,
      )
    }

    // Request succeeded! If we had prior wake attempts, notify that connection recovered
    if (attempt > 0 && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('moneytrack:backend-waking', { detail: { waking: false, recovered: true } })
      )
    }

    if (response.status === 204 || !responseText.trim()) {
      return undefined as T
    }

    try {
      return JSON.parse(responseText) as T
    } catch {
      throw new ApiError(
        `Invalid JSON received from server (HTTP ${response.status}).`,
        response.status,
        { rawText: responseText.slice(0, 160) },
      )
    }
  }
}

/**
 * Dedicated connection testing utility that validates whether an endpoint is a genuine MoneyTrack backend.
 * Never reports success merely because a URL was saved.
 */
export async function testConnection(candidateUrl?: string): Promise<{
  ok: boolean
  status: number
  version?: string
  application?: string
  error?: string
}> {
  const base = candidateUrl ? normalizeApiBaseUrl(candidateUrl) : apiBase()
  const targetUrl = `${base}/health`
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 25000)

  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    const text = await res.text()
    const contentType = (res.headers.get('content-type') ?? '').toLowerCase()
    if (
      contentType.includes('text/html') ||
      text.trim().toLowerCase().startsWith('<!doctype') ||
      text.trim().toLowerCase().startsWith('<html')
    ) {
      return {
        ok: false,
        status: res.status,
        error: `Server at '${base}' returned an HTML web page instead of the MoneyTrack API. Check the URL.`,
      }
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: `Server responded with HTTP ${res.status}. Check your backend server logs.`,
      }
    }

    const json = JSON.parse(text) as Record<string, unknown>
    if (json.status === 'ok' || json.healthy === true || typeof json.version === 'string' || typeof json.application === 'string') {
      return {
        ok: true,
        status: res.status,
        version: String(json.version ?? '1.0.0'),
        application: String(json.application ?? json.app ?? 'MoneyTrack'),
      }
    }

    return {
      ok: false,
      status: res.status,
      error: `Connected to an unexpected API service at '${base}'. Not a MoneyTrack API.`,
    }
  } catch (err: unknown) {
    clearTimeout(timeoutId)
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, status: 0, error: 'Connection timed out after 8s. Server is unreachable.' }
    }
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : 'Failed to connect. Check your network or IP address.',
    }
  }
}

export interface ExpenseTypeListParams {
  search?: string
  archived?: ArchivedFilter
  page?: number
  page_size?: number
}

export interface ExpenseListParams {
  start_date?: string
  end_date?: string
  expense_type_id?: number
  category?: string
  payment_method?: string
  min_amount?: number
  max_amount?: number
  q?: string
  sort?: SortOrder
  page?: number
  page_size?: number
}

export interface AnalyticsParams {
  start_date: string
  end_date: string
}

function jsonBody(payload: unknown): RequestOptions {
  return { method: 'POST', body: JSON.stringify(payload) }
}

function patchBody(payload: unknown): RequestOptions {
  return { method: 'PATCH', body: JSON.stringify(payload) }
}

export const api = {
  health: () => request<HealthResponse>('/health'),
  databaseHealth: () => request<DatabaseHealthResponse>('/health/db'),
  testConnection,

  listExpenseTypes: (params: ExpenseTypeListParams = {}) =>
    request<Page<ExpenseType>>(
      `/expense-types${toQueryString({
        search: params.search,
        archived: params.archived,
        page: params.page,
        page_size: params.page_size,
      })}`,
    ),
  getExpenseType: (id: number) => request<ExpenseType>(`/expense-types/${id}`),
  createExpenseType: (payload: ExpenseTypeCreateInput) =>
    request<ExpenseType>('/expense-types', jsonBody(payload)),
  updateExpenseType: (id: number, payload: ExpenseTypeUpdateInput) =>
    request<ExpenseType>(`/expense-types/${id}`, patchBody(payload)),
  archiveExpenseType: (id: number) =>
    request<ExpenseType>(`/expense-types/${id}/archive`, { method: 'POST' }),
  unarchiveExpenseType: (id: number) =>
    request<ExpenseType>(`/expense-types/${id}/unarchive`, { method: 'POST' }),
  deleteExpenseType: (id: number) =>
    request<void>(`/expense-types/${id}`, { method: 'DELETE' }),
  expenseTypeSummary: (id: number, params: AnalyticsParams) =>
    request<ExpenseTypePeriodSummary>(
      `/expense-types/${id}/summary${toQueryString({
        start_date: params.start_date,
        end_date: params.end_date,
      })}`,
    ),

  listExpenses: (params: ExpenseListParams = {}) =>
    request<ExpensePage>(
      `/expenses${toQueryString({
        start_date: params.start_date,
        end_date: params.end_date,
        expense_type_id: params.expense_type_id,
        category: params.category,
        payment_method: params.payment_method,
        min_amount: params.min_amount,
        max_amount: params.max_amount,
        q: params.q,
        sort: params.sort,
        page: params.page,
        page_size: params.page_size,
      })}`
    ),
  getExpense: (id: number) => request<Expense>(`/expenses/${id}`),
  createExpense: (payload: ExpenseCreateInput, idempotencyKey?: string) =>
    request<Expense>('/expenses', { ...jsonBody(payload), idempotencyKey }),
  updateExpense: (id: number, payload: ExpenseUpdateInput) =>
    request<Expense>(`/expenses/${id}`, patchBody(payload)),
  deleteExpense: (id: number) => request<void>(`/expenses/${id}`, { method: 'DELETE' }),

  analyticsSummary: (params: AnalyticsParams) =>
    request<AnalyticsSummary>(
      `/analytics/summary${toQueryString({
        start_date: params.start_date,
        end_date: params.end_date,
      })}`,
    ),
  analyticsByType: (params: AnalyticsParams) =>
    request<ByTypeResponse>(
      `/analytics/by-type${toQueryString({
        start_date: params.start_date,
        end_date: params.end_date,
      })}`,
    ),
  analyticsTrends: (params: AnalyticsParams & { granularity: Granularity }) =>
    request<TrendsResponse>(
      `/analytics/trends${toQueryString({
        start_date: params.start_date,
        end_date: params.end_date,
        granularity: params.granularity,
      })}`,
    ),
  analyticsComparison: (params: AnalyticsParams) =>
    request<ComparisonResponse>(
      `/analytics/comparison${toQueryString({
        start_date: params.start_date,
        end_date: params.end_date,
      })}`,
    ),
  restoreBackup: (payload: unknown) =>
    request<RestoreSummary>('/export/restore', jsonBody(payload)),
  parseReceipt: async (
    input: Blob | { text: string },
    scanMode: 'ocr' | 'groq' | 'both' = 'both'
  ): Promise<ReceiptParseResult> => {
    if ('text' in input && typeof input.text === 'string') {
      return request<ReceiptParseResult>('/receipts/parse', jsonBody({ ...input, scan_mode: scanMode }))
    }
    const formData = new FormData()
    const blob = input as Blob & { name?: string }
    const fileName = typeof blob.name === 'string' ? blob.name : 'receipt.jpg'
    formData.append('file', blob, fileName)
    formData.append('scan_mode', scanMode)
    return request<ReceiptParseResult>('/receipts/parse', {
      method: 'POST',
      body: formData,
    })
  },
  parseReceiptText: (text: string) =>
    request<ReceiptParseResult>('/receipts/parse-text', jsonBody({ text })),

  // Bank Accounts
  listBankAccounts: (includeArchived = false) =>
    request<BankAccountList>(`/bank-accounts?include_archived=${includeArchived}`),
  getBankAccount: (id: number) => request<BankAccount>(`/bank-accounts/${id}`),
  createBankAccount: (input: BankAccountCreateInput) =>
    request<BankAccount>('/bank-accounts', jsonBody(input)),
  updateBankAccount: (id: number, input: BankAccountUpdateInput) =>
    request<BankAccount>(`/bank-accounts/${id}`, patchBody(input)),
  deleteBankAccount: (id: number) =>
    request<{ success: boolean; message: string }>(`/bank-accounts/${id}`, { method: 'DELETE' }),
  recalculateAccountBalance: (id: number) =>
    request<BankAccount>(`/bank-accounts/${id}/recalculate`, { method: 'POST' }),
  reconcileBankAccount: (id: number) =>
    request<BankAccount>(`/bank-accounts/${id}/reconcile`, { method: 'POST' }),
  reportBankBalance: (id: number, balancePaise: number, reportedAt?: string) =>
    request<BankAccount>(`/bank-accounts/${id}/report-balance`, jsonBody({ balance_paise: balancePaise, reported_at: reportedAt })),
  getBankReconciliation: () =>
    request<AccountReconciliation[]>('/bank-accounts/reconciliation/summary'),

  // Income Types
  listIncomeTypes: async (includeArchived = false): Promise<IncomeType[]> => {
    const res = await request<IncomeType[] | IncomeTypeList>(
      `/income-types?include_archived=${includeArchived}`,
    )
    return Array.isArray(res) ? res : res.items
  },
  getIncomeType: (id: number) => request<IncomeType>(`/income-types/${id}`),
  createIncomeType: (input: IncomeTypeCreateInput) =>
    request<IncomeType>('/income-types', jsonBody(input)),
  updateIncomeType: (id: number, input: IncomeTypeUpdateInput) =>
    request<IncomeType>(`/income-types/${id}`, patchBody(input)),
  deleteIncomeType: (id: number) =>
    request<{ success: boolean; message: string }>(`/income-types/${id}`, { method: 'DELETE' }),

  // Incomes
  listIncomes: (params?: {
    page?: number
    page_size?: number
    account_id?: number
    income_type_id?: number
    start_date?: string
    end_date?: string
    search?: string
    q?: string
  }) => {
    const qParams = { ...params, q: params?.q ?? params?.search }
    return request<IncomePage>(`/incomes${toQueryString(qParams)}`)
  },
  getIncome: (id: number) => request<Income>(`/incomes/${id}`),
  createIncome: (input: IncomeCreateInput, idempotencyKey?: string) =>
    request<Income>('/incomes', { ...jsonBody(input), idempotencyKey }),
  updateIncome: (id: number, input: IncomeUpdateInput) =>
    request<Income>(`/incomes/${id}`, patchBody(input)),
  deleteIncome: (id: number) =>
    request<{ success: boolean; message: string }>(`/incomes/${id}`, { method: 'DELETE' }),

  // Transfers
  listTransfers: (params?: { account_id?: number; start_date?: string; end_date?: string; limit?: number }) =>
    request<TransferList>(`/transfers${toQueryString(params ?? {})}`),
  createTransfer: (input: TransferCreateInput) =>
    request<AccountTransfer>('/transfers', jsonBody(input)),

  // Cashflow & Intelligence
  getCashFlowSummary: (params?: { start_date?: string; end_date?: string }) =>
    request<CashFlowSummary>(`/cashflow/summary${toQueryString(params ?? {})}`),

  // Payment Security & Fraud Protection
  getSecuritySummary: () => request<SecuritySummary>('/security/summary'),
  listSecurityAlerts: (status?: string) =>
    request<SecurityAlert[]>(`/security/alerts${toQueryString({ status })}`),
  actionSecurityAlert: (alertId: number, action: string, disputeReason?: string) =>
    request<SecurityActionResponse>(`/security/alerts/${alertId}/action`, {
      method: 'POST',
      ...jsonBody({ action, dispute_reason: disputeReason }),
    }),

  // In-App Notification Centre & Preferences
  getNotifications: (unreadOnly?: boolean) =>
    request<NotificationCenterSummary>(`/notifications${toQueryString({ unread_only: unreadOnly })}`),
  markNotificationRead: (id: number) =>
    request<NotificationLog>(`/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () =>
    request<{ success: boolean; marked_count: number }>('/notifications/mark-all-read', { method: 'POST' }),
  getNotificationPreferences: () =>
    request<NotificationPreferences>('/notifications/preferences'),
  updateNotificationPreferences: (payload: Partial<NotificationPreferences>) =>
    request<NotificationPreferences>('/notifications/preferences', {
      method: 'PUT',
      ...jsonBody(payload),
    }),

  // Weekly Spending Report
  getWeeklyReport: (startDate?: string, endDate?: string) =>
    request<WeeklyReportData>(`/reports/weekly${toQueryString({ start_date: startDate, end_date: endDate })}`),

  // SMS Intelligence Ingest
  ingestSms: (
    payload: {
      amount_paise: number
      direction?: 'CREDIT' | 'DEBIT' | 'TRANSFER' | 'UNKNOWN'
      reference?: string | null
      transaction_date?: string | null
      merchant_or_payer?: string | null
      suggested_category?: string | null
      account_suffix?: string | null
      bank_name?: string | null
      available_balance_paise?: number | null
      body?: string | null
      sender?: string | null
      note?: string | null
    },
    idempotencyKey?: string,
  ) => {
    const opts: RequestOptions = {
      ...jsonBody(payload),
    }
    if (idempotencyKey) {
      opts.idempotencyKey = idempotencyKey
    }
    return request<any>('/sms/ingest', opts)
  },
}

function filenameFromDisposition(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback
  const match = /filename="?([^"]+)"?/i.exec(disposition)
  return match?.[1] ?? fallback
}

export async function downloadExport(kind: 'csv' | 'json'): Promise<void> {
  const path = kind === 'csv' ? '/export/expenses.csv' : '/export/backup.json'
  let response: Response
  try {
    response = await fetch(`${apiBase()}${path}`, {
      headers: { Accept: kind === 'csv' ? 'text/csv' : 'application/json' },
    })
  } catch {
    throw new ApiError('Could not reach the MoneyTrack API.', 0)
  }
  if (!response.ok) {
    let payload: unknown = null
    try {
      const text = await response.text()
      payload = JSON.parse(text)
    } catch {
      /* ignore */
    }
    throw new ApiError(
      extractMessage(payload, 'Export failed. Please try again.'),
      response.status,
      payload,
    )
  }
  const blob = await response.blob()
  const fallback = kind === 'csv' ? 'moneytrack-expenses.csv' : 'moneytrack-backup.json'
  const filename = filenameFromDisposition(
    response.headers.get('Content-Disposition'),
    fallback,
  )
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
