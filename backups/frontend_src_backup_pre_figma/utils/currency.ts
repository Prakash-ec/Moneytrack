const MAX_AMOUNT_PAISE = 10_000_000_000_000

export function parseRupeesToPaise(input: string): number | null {
  const value = input.trim().replace(/,/g, '')
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null

  const [wholePart, fractionPart = ''] = value.split('.')
  const paise = Number(wholePart) * 100 + Number(fractionPart.padEnd(2, '0'))
  if (!Number.isSafeInteger(paise) || paise <= 0 || paise > MAX_AMOUNT_PAISE) return null
  return paise
}

export function paiseToAmountInput(paise: number): string {
  const whole = Math.trunc(paise / 100)
  const fraction = Math.abs(paise % 100)
  return fraction === 0 ? String(whole) : `${whole}.${fraction.toString().padStart(2, '0')}`
}

function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits
  const lastThree = digits.slice(-3)
  const rest = digits.slice(0, -3)
  const groups: string[] = []
  let index = rest.length
  while (index > 2) {
    groups.unshift(rest.slice(index - 2, index))
    index -= 2
  }
  if (index > 0) groups.unshift(rest.slice(0, index))
  return `${groups.join(',')},${lastThree}`
}

export function formatINR(paise: number): string {
  const negative = paise < 0
  const absolute = Math.abs(Math.trunc(paise))
  const whole = Math.floor(absolute / 100)
  const fraction = absolute % 100
  const prefix = negative ? '-₹' : '₹'
  return `${prefix}${groupIndian(String(whole))}.${fraction.toString().padStart(2, '0')}`
}

export function formatSignedINR(paise: number): string {
  if (paise === 0) return formatINR(0)
  return `${paise > 0 ? '+' : ''}${formatINR(paise)}`
}

export function formatINRCompact(paise: number): string {
  const negative = paise < 0
  const absolute = Math.abs(Math.trunc(paise))
  const prefix = negative ? '-₹' : '₹'

  if (absolute >= 10_000_000_00) {
    const value = absolute / 10_000_000_00
    return `${prefix}${value >= 100 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, '')}Cr`
  }
  if (absolute >= 1_000_00 * 100) {
    const value = absolute / (1_000_00 * 100)
    return `${prefix}${value >= 100 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, '')}L`
  }
  if (absolute >= 1_000 * 100) {
    const value = absolute / (1_000 * 100)
    return `${prefix}${value >= 100 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, '')}k`
  }
  const whole = Math.floor(absolute / 100)
  return `${prefix}${whole}`
}

export function formatPercent(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value)
}
