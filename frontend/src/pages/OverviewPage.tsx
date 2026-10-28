import { useState } from 'react'
import type { DateFilter } from '../api/endpoints'
import { api } from '../api/endpoints'
import { useApi } from '../api/useApi'
import { MonthlyRevenueChart } from '../components/charts'
import { DateRangeFilter } from '../components/DateRangeFilter'
import { ApiErrorView, EmptyState } from '../components/states'
import { Card, KpiCard, LoadingRegion, PageHeader, Skeleton } from '../components/ui'
import { formatDate, formatGBP, formatMonth, formatNumber } from '../format'

function periodLabel(range: DateFilter): string {
  if (!range.from && !range.to) return 'All data, Dec 2009 to Dec 2011'
  return `${range.from ? formatDate(range.from) : 'start'} to ${range.to ? formatDate(range.to) : 'latest'}`
}

export function OverviewPage() {
  const [range, setRange] = useState<DateFilter>({})
  const summary = useApi((token, signal) => api.salesSummary(token, range, signal), [range.from, range.to])
  const monthly = useApi((token, signal) => api.monthlySales(token, range, signal), [range.from, range.to])

  const reloadAll = () => {
    summary.reload()
    monthly.reload()
  }
  // Show one error panel if both calls fail the same way (e.g. both throttled).
  const error = summary.status === 'error' ? summary.error : monthly.status === 'error' ? monthly.error : null

  return (
    <>
      <PageHeader
        title="Overview"
        description="Headline sales figures for the selected period. Cancelled orders are excluded; guest purchases are included."
        actions={
          <button type="button" className="btn-secondary" onClick={reloadAll}>
            Refresh
          </button>
        }
      />
      <div className="space-y-6">
        <DateRangeFilter value={range} onChange={setRange} />

        {error ? (
          <ApiErrorView error={error} onRetry={reloadAll} what="sales figures" />
        ) : (
          <>
            <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {summary.status === 'success' ? (
                <>
                  <KpiCard label="Total revenue" value={formatGBP(summary.data.total_revenue)} hint={periodLabel(range)} />
                  <KpiCard label="Orders" value={formatNumber(summary.data.orders)} hint="Distinct invoices" />
                  <KpiCard label="Average order value" value={formatGBP(summary.data.average_order_value, true)} hint="Revenue ÷ orders" />
                  <KpiCard label="Customers" value={formatNumber(summary.data.customers)} hint="Registered customers who ordered" />
                </>
              ) : (
                <LoadingRegion label="Loading key figures">
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {['Total revenue', 'Orders', 'Average order value', 'Customers'].map((label) => (
                      <KpiCard key={label} label={label} loading />
                    ))}
                  </div>
                </LoadingRegion>
              )}
            </section>

            <Card title="Monthly revenue" description={periodLabel(range)}>
              {monthly.status === 'success' ? (
                monthly.data.months.length ? (
                  <>
                    <MonthlyRevenueChart data={monthly.data.months} />
                    {monthly.data.months.at(-1)?.month === '2011-12' && (
                      <p className="mt-2 text-xs text-ink-subtle">
                        December 2011 covers 1 to 9 December only, where the shop's records end.
                      </p>
                    )}
                    <details className="mt-4 text-sm">
                      <summary className="cursor-pointer font-medium text-brand-ink">Show monthly figures as a table</summary>
                      <table className="mt-3 w-full text-sm">
                        <caption className="sr-only">Revenue and orders per month</caption>
                        <thead>
                          <tr className="border-b border-border text-ink-muted">
                            <th scope="col" className="py-1.5 text-left font-semibold">Month</th>
                            <th scope="col" className="py-1.5 text-right font-semibold">Revenue</th>
                            <th scope="col" className="py-1.5 text-right font-semibold">Orders</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthly.data.months.map((m) => (
                            <tr key={m.month} className="border-b border-border last:border-0">
                              <td className="py-1.5 text-ink">{formatMonth(m.month)}</td>
                              <td className="num py-1.5 text-right text-ink">{formatGBP(m.revenue)}</td>
                              <td className="num py-1.5 text-right text-ink">{formatNumber(m.orders)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  </>
                ) : (
                  <EmptyState title="No sales in this period">
                    The shop's records run from 1 December 2009 to 9 December 2011. Try a range inside those dates.
                  </EmptyState>
                )
              ) : (
                <LoadingRegion label="Loading monthly revenue">
                  <Skeleton className="h-[300px] w-full" />
                </LoadingRegion>
              )}
            </Card>
          </>
        )}
      </div>
    </>
  )
}
