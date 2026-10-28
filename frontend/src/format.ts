/** Number and date formats for a UK shop: pounds, UK-style commas and day-month-year dates. */

const gbpWhole = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 })
const gbpPence = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2 })
const gbpCompact = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  notation: 'compact',
  maximumFractionDigits: 1,
})
const integer = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })
const percent = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 1 })
const monthYear = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const dayMonthYear = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const timeOfDay = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })

/** £19,725,088 for big numbers. Pass pence=true to get £497.62. */
export function formatGBP(value: number, pence = false): string {
  return (pence ? gbpPence : gbpWhole).format(value)
}

/** £1.5M, £320K: short form for chart axes, where space is tight. */
export function formatGBPCompact(value: number): string {
  return gbpCompact.format(value)
}

export function formatNumber(value: number): string {
  return integer.format(value)
}

export function formatPercent(share: number): string {
  return percent.format(share)
}

/** "2010-11" -> "Nov 2010" */
export function formatMonth(month: string): string {
  const [year, m] = month.split('-').map(Number)
  return monthYear.format(new Date(Date.UTC(year, m - 1, 1)))
}

/** "2010-01-05" -> "5 Jan 2010" */
export function formatDate(isoDate: string): string {
  const [year, m, d] = isoDate.slice(0, 10).split('-').map(Number)
  return dayMonthYear.format(new Date(Date.UTC(year, m - 1, d)))
}

/** "2010-10-31 14:20:00" -> "31 Oct 2010, 14:20" (the shop's own UK time). */
export function formatDateTime(value: string): string {
  const [date, time = '00:00:00'] = value.split(' ')
  const [h, min] = time.split(':').map(Number)
  const [year, m, d] = date.split('-').map(Number)
  return `${formatDate(date)}, ${timeOfDay.format(new Date(Date.UTC(year, m - 1, d, h, min)))}`
}

/** Epoch ms -> "28 Oct 2026, 11:23" in the viewer's own time zone. */
export function formatLocalDateTime(epochMs: number): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(epochMs))
}
