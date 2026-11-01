const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function todayIST(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const find = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${find('year')}-${find('month')}-${find('day')}`
}

export function isValidISODate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export function parseISODate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

export function toISODate(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDays(dateISO: string, days: number): string {
  const date = parseISODate(dateISO)
  date.setUTCDate(date.getUTCDate() + days)
  return toISODate(date)
}

export function daysBetween(startISO: string, endISO: string): number {
  return Math.round(
    (parseISODate(endISO).getTime() - parseISODate(startISO).getTime()) / 86_400_000,
  ) + 1
}

export function startOfWeek(dateISO: string): string {
  const date = parseISODate(dateISO)
  const day = date.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  return addDays(dateISO, diff)
}

export function formatDate(
  dateISO: string,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' },
): string {
  if (!isValidISODate(dateISO)) return dateISO
  return new Intl.DateTimeFormat('en-IN', { ...options, timeZone: 'UTC' }).format(
    parseISODate(dateISO),
  )
}

export function formatDateShort(dateISO: string): string {
  return formatDate(dateISO, { day: '2-digit', month: 'short' })
}

export function formatDateLong(dateISO: string): string {
  return formatDate(dateISO, { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' })
}

export function formatMonth(dateISO: string): string {
  return formatDate(dateISO, { month: 'short', year: 'numeric' })
}

export function formatDateTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp)
  if (Number.isNaN(date.getTime())) return isoTimestamp
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(date)
}

export function formatRelativeDate(dateISO: string): string {
  const today = todayIST()
  if (dateISO === today) return 'Today'
  if (dateISO === addDays(today, -1)) return 'Yesterday'
  return formatDate(dateISO)
}
