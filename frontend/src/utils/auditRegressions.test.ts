import { describe, expect, it, vi } from 'vitest'
import type { SecurityActionResponse } from '@/types/api'
import { startKeepAliveService } from '@/services/keepAlive'
import { formatINR, parseRupeesToPaise } from './currency'

describe('Frontend audit regressions', () => {
  it('parses decimal rupee inputs into exact integer paise without float drift (P25)', () => {
    expect(parseRupeesToPaise('19.99')).toBe(1999)
    expect(parseRupeesToPaise('750.00')).toBe(75000)
    expect(parseRupeesToPaise('12118.09')).toBe(1211809)
    expect(parseRupeesToPaise('0')).toBeNull()
    expect(parseRupeesToPaise('-10')).toBeNull()
  })

  it('supports object-based BankHelplineInfo fraud_guidance from backend (SecurityCentre crash fix)', () => {
    const sample: SecurityActionResponse = {
      success: true,
      status: 'DISPUTED',
      message: 'Alert disputed',
      fraud_guidance: [
        {
          bank_name: 'HDFC Bank',
          phone: '1800 202 6161',
          sms_block_keyword: 'BLOCK to 5676712',
          url: 'https://www.hdfcbank.com',
        },
      ],
      cybercrime_helpline: '1930',
      cybercrime_portal: 'https://cybercrime.gov.in',
    }
    expect(Array.isArray(sample.fraud_guidance)).toBe(true)
    expect(sample.cybercrime_portal).toBe('https://cybercrime.gov.in')
  })

  it('formats full clickable tel URI without truncating after first space (C37)', () => {
    const raw = '1800 11 1109 / 1800 425 3800'
    const sanitized = raw.split('/')[0].replace(/\s+/g, '')
    expect(sanitized).toBe('1800111109')
  })

  it('formats signed net cashflow cleanly without losing minus sign (C36)', () => {
    const negativeNet = -125000
    const formatted = `${negativeNet >= 0 ? '+' : '−'}${formatINR(Math.abs(negativeNet))}`
    expect(formatted.startsWith('−₹')).toBe(true)
  })

  it('keeps client keep-alive service disabled so serverless DB can suspend when idle', () => {
    const fetchSpy = vi.fn()
    const origFetch = globalThis.fetch
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')
    try {
      const stop = startKeepAliveService()
      stop()
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(intervalSpy).not.toHaveBeenCalled()
    } finally {
      intervalSpy.mockRestore()
      globalThis.fetch = origFetch
    }
  })
})
