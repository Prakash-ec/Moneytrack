import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { api, normalizeApiBaseUrl, testConnection, ApiError } from './api'

function mockResponse(status: number, payload: unknown, contentType = 'application/json') {
  const isString = typeof payload === 'string'
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (header: string) => {
        if (header.toLowerCase() === 'content-type') return contentType
        return null
      },
    },
    text: async () => (isString ? payload : JSON.stringify(payload)),
    json: async () => (isString ? JSON.parse(payload) : payload),
  } as unknown as Response
}

describe('normalizeApiBaseUrl', () => {
  it('appends /api when missing from base URL', () => {
    expect(normalizeApiBaseUrl('http://192.168.1.100:8000')).toBe('http://192.168.1.100:8000/api')
    expect(normalizeApiBaseUrl('https://moneytrack.onrender.com')).toBe('https://moneytrack.onrender.com/api')
  })

  it('preserves /api if already present', () => {
    expect(normalizeApiBaseUrl('http://192.168.1.100:8000/api')).toBe('http://192.168.1.100:8000/api')
    expect(normalizeApiBaseUrl('http://192.168.1.100:8000/api/')).toBe('http://192.168.1.100:8000/api')
  })

  it('handles relative paths properly', () => {
    expect(normalizeApiBaseUrl('/api')).toBe('/api')
    expect(normalizeApiBaseUrl('')).toBe('/api')
  })
})

describe('HTML-as-JSON regression tests', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('reproduces and prevents "<!doctype" JSON parse error on 200 HTML response', async () => {
    const htmlSnippet = '<!doctype html><html><body><div id="root"></div></body></html>'
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(200, htmlSnippet, 'text/html; charset=utf-8'))

    await expect(api.health()).rejects.toThrowError(
      /Received an HTML webpage instead of a JSON response/i
    )

    try {
      await api.health()
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      const apiErr = err as ApiError
      expect(apiErr.isHtmlResponse).toBe(true)
      expect(apiErr.status).toBe(200)
    }
  })

  it('handles HTML error pages gracefully without raw SyntaxError crash', async () => {
    const badGatewayHtml = '<html><head><title>502 Bad Gateway</title></head><body>502 Bad Gateway</body></html>'
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(502, badGatewayHtml, 'text/html'))

    await expect(api.health()).rejects.toThrowError(
      /Received an HTML webpage instead of a JSON response/i
    )
  })

  it('handles 204 No Content response properly', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      headers: { get: () => 'application/json' },
      text: async () => '',
    } as unknown as Response)

    const res = await api.deleteExpense(1)
    expect(res).toBeUndefined()
  })
})

describe('testConnection', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('returns ok: true when backend health check succeeds', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(200, { status: 'ok', version: '1.0.0', application: 'MoneyTrack API' }))

    const result = await testConnection('http://127.0.0.1:8000')
    expect(result.ok).toBe(true)
    expect(result.version).toBe('1.0.0')
    expect(result.application).toBe('MoneyTrack API')
  })

  it('returns ok: false with informative error when endpoint returns HTML', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(200, '<!doctype html><html></html>', 'text/html'))

    const result = await testConnection('http://192.168.1.50:8000')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('returned an HTML web page instead of the MoneyTrack API')
  })

  it('returns ok: false when endpoint is completely unreachable', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    const result = await testConnection('http://192.168.1.99:8000')
    expect(result.ok).toBe(false)
    expect(result.status).toBe(0)
  })
})

describe('api.parseReceiptText', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('POSTs receipt text to /api/receipts/parse-text and returns the parsed result', async () => {
    const text = 'BUS SERVICE\nDate: 20-10-2026\nTOTAL RS: 12\n149600'
    const result = {
      merchant: 'BUS SERVICE',
      amount_paise: 1200,
      expense_date: '2026-10-20',
      currency: 'INR',
      payment_method: null,
      items: [],
      note: 'Extracted via AI text extraction',
      suggested_expense_type_id: 2,
      suggested_expense_type_name: 'Bus Travel',
      confidence: { amount: 0.9 },
      warnings: [],
      raw_text: null,
      scan_method: 'AI text extraction',
    }

    const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, result))
    globalThis.fetch = fetchMock

    const parsed = await api.parseReceiptText(text)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/receipts/parse-text')
    expect(init?.method).toBe('POST')
    expect(init?.headers?.['Content-Type']).toBe('application/json')
    expect(JSON.parse(init?.body as string)).toEqual({ text })
    expect(String(init?.body)).not.toContain('GROQ_API_KEY')
    expect(String(init?.body)).not.toContain('groq')
    expect(parsed).toEqual(result)
    expect(parsed.scan_method).toBe('AI text extraction')
  })

  it('throws ApiError with the server message on validation failure (e.g. oversized text)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(422, { detail: 'text field is too long' }))
    globalThis.fetch = fetchMock

    await expect(api.parseReceiptText('x'.repeat(30000))).rejects.toMatchObject({
      status: 422,
      name: 'ApiError',
    })
  })

  it('throws ApiError on network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('failed to fetch'))

    await expect(api.parseReceiptText('some receipt text')).rejects.toMatchObject({
      status: 0,
      name: 'ApiError',
    })
  })
})

describe('api.createExpenseType', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('POSTs the new type to /expense-types without any API key or model', async () => {
    const created = {
      id: 9,
      name: 'Mobile Recharge',
      description: null,
      category: 'Utilities',
      icon: 'tag',
      color: '#10b981',
      monthly_budget_paise: null,
      is_archived: false,
      created_at: '2026-10-23T10:00:00Z',
      updated_at: '2026-10-23T10:00:00Z',
    }

    const fetchMock = vi.fn().mockResolvedValue(mockResponse(201, created))
    globalThis.fetch = fetchMock

    const res = await api.createExpenseType({ name: 'Mobile Recharge', category: 'Utilities' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/expense-types')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toEqual({ name: 'Mobile Recharge', category: 'Utilities' })
    expect(res).toEqual(created)
  })

  it('throws ApiError with duplicate name message on 409 Conflict', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(409, { detail: "Expense type 'Food' already exists." }))
    globalThis.fetch = fetchMock

    await expect(
      api.createExpenseType({ name: 'Food', category: 'Food' }),
    ).rejects.toMatchObject({
      status: 409,
      message: "Expense type 'Food' already exists.",
    })
  })

  it('throws ApiError on network failure when creating a type', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('failed to fetch'))

    await expect(
      api.createExpenseType({ name: 'Mobile Recharge', category: 'Utilities' }),
    ).rejects.toMatchObject({
      status: 0,
      name: 'ApiError',
    })
  })

  it('calls getSecuritySummary and actionSecurityAlert properly', async () => {
    const summaryPayload = { total_alerts: 2, needs_review_count: 1, disputed_count: 1, recent_alerts: [] }
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, summaryPayload))
    globalThis.fetch = fetchMock

    const res = await api.getSecuritySummary()
    expect(res.total_alerts).toBe(2)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/security/summary')

    const actionPayload = { alert_id: 1, status: 'DISPUTED', success: true, message: 'Disputed' }
    fetchMock.mockResolvedValueOnce(mockResponse(200, actionPayload))

    const actRes = await api.actionSecurityAlert(1, 'dispute', 'Suspicious')
    expect(actRes.status).toBe('DISPUTED')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/security/alerts/1/action')
    expect(fetchMock.mock.calls[1][1]?.method).toBe('POST')
  })

  it('calls getWeeklyReport and notification preferences properly', async () => {
    const reportPayload = {
      start_date: '2026-10-19',
      end_date: '2026-10-25',
      period_label: 'Oct 19 - Oct 25, 2026',
      total_expense_paise: 500000,
      total_income_paise: 1500000,
      net_cashflow_paise: 1000000,
      savings_rate_percent: 66.7,
      comparison: { direction: 'down' },
      top_categories: [],
      largest_expenses: [],
      account_breakdown: [],
    }
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, reportPayload))
    globalThis.fetch = fetchMock

    const rep = await api.getWeeklyReport('2026-10-19', '2026-10-25')
    expect(rep.savings_rate_percent).toBe(66.7)
    expect(fetchMock.mock.calls[0][0]).toContain('/api/reports/weekly?start_date=2026-10-19&end_date=2026-10-25')
  })

  it('correctly dispatches parseReceipt with image FormData', async () => {
    const parseResult = {
      merchant: 'Fresh Mart',
      amount_paise: 24500,
      expense_date: '2026-11-01',
      currency: 'INR',
      subtotal_paise: 23000,
      tax_paise: 1500,
      payment_method: 'UPI',
      items: [{ name: 'Apples', amount_paise: 24500, quantity: 1 }],
      note: 'Scanned via Groq AI vision (Fresh Mart)',
      suggested_expense_type_id: 2,
      suggested_expense_type_name: 'Groceries',
      suggested_new_type_name: null,
      confidence: { amount: 0.99 },
      warnings: [],
      raw_text: 'Fresh Mart Total: 245.00',
      scan_method: 'groq',
    }
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, parseResult))
    globalThis.fetch = fetchMock

    const fakeBlob = new Blob(['fake image bytes'], { type: 'image/jpeg' })
    const result = await api.parseReceipt(fakeBlob, 'both')

    expect(result.merchant).toBe('Fresh Mart')
    expect(result.amount_paise).toBe(24500)
    expect(result.payment_method).toBe('UPI')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/receipts/parse')
    const reqInit = fetchMock.mock.calls[0][1]
    expect(reqInit?.method).toBe('POST')
    expect(reqInit?.body instanceof FormData).toBe(true)
  })

  it('saves an expense with reviewed receipt details', async () => {
    const createdExpense = {
      id: 42,
      expense_type_id: 2,
      account_id: 1,
      amount_paise: 24500,
      expense_date: '2026-11-01',
      note: 'Fresh apples from mart',
      payment_method: 'UPI',
      merchant: 'Fresh Mart',
      created_at: '2026-11-01T10:00:00Z',
      updated_at: '2026-11-01T10:00:00Z',
      expense_type: { id: 2, name: 'Groceries', color: '#10B981', category: 'Food', is_archived: false },
    }
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(201, createdExpense))
    globalThis.fetch = fetchMock

    const res = await api.createExpense({
      expense_type_id: 2,
      account_id: 1,
      amount_paise: 24500,
      expense_date: '2026-11-01',
      merchant: 'Fresh Mart',
      payment_method: 'UPI',
      note: 'Fresh apples from mart',
    })

    expect(res.id).toBe(42)
    expect(res.amount_paise).toBe(24500)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/expenses')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    expect(body.amount_paise).toBe(24500)
    expect(body.account_id).toBe(1)
    expect(body.merchant).toBe('Fresh Mart')
    expect(body.payment_method).toBe('UPI')
  })

  it('retries on transient Render 502 Bad Gateway and recovers cleanly', async () => {
    const wakingEvents: any[] = []
    const mockWindow = {
      dispatchEvent: (event: { detail: unknown }) => wakingEvents.push(event.detail),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    vi.stubGlobal('window', mockWindow)

    const badGatewayHtml = '<html><body>502 Bad Gateway</body></html>'
    const successHealth = { status: 'ok', application: 'MoneyTrack', version: '1.0.0' }

    // First call returns 502 HTML, second call recovers with 200 JSON
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(502, badGatewayHtml, 'text/html'))
      .mockResolvedValueOnce(mockResponse(200, successHealth))

    globalThis.fetch = fetchMock

    const res = await api.health()
    expect(res.status).toBe('ok')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // Verify waking events were dispatched
    expect(wakingEvents.some((e) => e.waking === true)).toBe(true)
    expect(wakingEvents.some((e) => e.recovered === true)).toBe(true)

    vi.unstubAllGlobals()
  })
})
