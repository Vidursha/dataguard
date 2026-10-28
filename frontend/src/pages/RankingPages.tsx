/** Products and Countries pages: ranking chart, sortable table and a "how many" selector. */
import { useId, useState } from 'react'
import { api } from '../api/endpoints'
import type { CountryRevenue, ProductSales } from '../api/types'
import { useApi } from '../api/useApi'
import { RankingBarChart } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { ApiErrorView, EmptyState } from '../components/states'
import { Card, LoadingRegion, PageHeader, Skeleton } from '../components/ui'
import { formatGBP, formatNumber, formatPercent } from '../format'

function LimitSelect({ value, onChange, options, noun }: { value: number; onChange: (n: number) => void; options: number[]; noun: string }) {
  const id = useId()
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm font-medium text-ink-muted">
        Show
      </label>
      <select id={id} className="input w-auto" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {options.map((n) => (
          <option key={n} value={n}>
            Top {n} {noun}
          </option>
        ))}
      </select>
    </div>
  )
}

function LoadingRanking({ label }: { label: string }) {
  return (
    <LoadingRegion label={label}>
      <div className="space-y-6">
        <div className="card space-y-3 p-5">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-6" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    </LoadingRegion>
  )
}

const PRODUCT_COLUMNS: Column<ProductSales>[] = [
  { key: 'rank', header: 'Rank', value: (p) => p.rank, numeric: true },
  { key: 'description', header: 'Product', value: (p) => p.description },
  { key: 'stock_code', header: 'Code', value: (p) => p.stock_code },
  { key: 'units', header: 'Units sold', value: (p) => p.units_sold, render: (p) => formatNumber(p.units_sold), numeric: true },
  { key: 'orders', header: 'Orders', value: (p) => p.orders, render: (p) => formatNumber(p.orders), numeric: true },
  { key: 'revenue', header: 'Revenue', value: (p) => p.revenue, render: (p) => formatGBP(p.revenue), numeric: true },
]

export function ProductsPage() {
  const [limit, setLimit] = useState(10)
  const state = useApi((token, signal) => api.topProducts(token, limit, signal), [limit])

  return (
    <>
      <PageHeader
        title="Products"
        description="Best-selling products by revenue, December 2009 to December 2011. Postage, carriage and gift vouchers are left out."
        actions={<LimitSelect value={limit} onChange={setLimit} options={[5, 10, 20, 50]} noun="products" />}
      />
      {state.status === 'error' ? (
        <ApiErrorView error={state.error} onRetry={state.reload} what="product figures" />
      ) : state.status !== 'success' ? (
        <LoadingRanking label="Loading top products" />
      ) : state.data.products.length === 0 ? (
        <EmptyState title="No products to show">No product sales were recorded.</EmptyState>
      ) : (
        <div className="space-y-6">
          <Card title={`Top ${state.data.products.length} products by revenue`}>
            <RankingBarChart
              caption={`Bar chart of the top ${state.data.products.length} products by revenue. The leader is ${state.data.products[0].description} with ${formatGBP(state.data.products[0].revenue)}.`}
              data={state.data.products.map((p) => ({ label: p.description, revenue: p.revenue, orders: p.orders }))}
            />
          </Card>
          <Card title="Product table" description="Select a column heading to sort.">
            <DataTable
              caption="Top products"
              columns={PRODUCT_COLUMNS}
              rows={state.data.products}
              rowKey={(p) => p.stock_code}
              initialSort={{ key: 'revenue', direction: 'descending' }}
            />
          </Card>
        </div>
      )}
    </>
  )
}

const COUNTRY_COLUMNS: Column<CountryRevenue>[] = [
  { key: 'country', header: 'Country', value: (c) => c.country },
  { key: 'orders', header: 'Orders', value: (c) => c.orders, render: (c) => formatNumber(c.orders), numeric: true },
  { key: 'share', header: 'Share of revenue', value: (c) => c.share, render: (c) => formatPercent(c.share), numeric: true },
  { key: 'revenue', header: 'Revenue', value: (c) => c.revenue, render: (c) => formatGBP(c.revenue), numeric: true },
]

export function CountriesPage() {
  const [limit, setLimit] = useState(10)
  // The UK is about 85% of revenue, so every other bar looks tiny. This lets the
  // chart show the other countries. The table always lists every row.
  const [hideUk, setHideUk] = useState(false)
  const state = useApi((token, signal) => api.revenueByCountry(token, limit, signal), [limit])

  return (
    <>
      <PageHeader
        title="Countries"
        description="Where revenue comes from, December 2009 to December 2011. The retailer is UK-based, so the United Kingdom leads by far."
        actions={<LimitSelect value={limit} onChange={setLimit} options={[5, 10, 20, 50]} noun="countries" />}
      />
      {state.status === 'error' ? (
        <ApiErrorView error={state.error} onRetry={state.reload} what="country figures" />
      ) : state.status !== 'success' ? (
        <LoadingRanking label="Loading revenue by country" />
      ) : state.data.countries.length === 0 ? (
        <EmptyState title="No countries to show">No sales were recorded.</EmptyState>
      ) : (
        <div className="space-y-6">
          <Card
            title="Revenue by country"
            description={`Total across all countries: ${formatGBP(state.data.total_revenue)}`}
            actions={
              <label className="flex items-center gap-2 text-sm text-ink-muted">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[rgb(var(--brand))]"
                  checked={hideUk}
                  onChange={(e) => setHideUk(e.target.checked)}
                />
                Leave out the United Kingdom
              </label>
            }
          >
            <RankingBarChart
              caption={`Bar chart of revenue for the top ${state.data.countries.length} countries${hideUk ? ', excluding the United Kingdom' : ''}. ${state.data.countries[0].country} leads with ${formatPercent(state.data.countries[0].share)} of revenue.`}
              data={state.data.countries
                .filter((c) => !hideUk || c.country !== 'United Kingdom')
                .map((c) => ({ label: c.country, revenue: c.revenue, orders: c.orders }))}
            />
          </Card>
          <Card title="Country table" description="Select a column heading to sort.">
            <DataTable
              caption="Revenue by country"
              columns={COUNTRY_COLUMNS}
              rows={state.data.countries}
              rowKey={(c) => c.country}
              initialSort={{ key: 'revenue', direction: 'descending' }}
            />
          </Card>
        </div>
      )}
    </>
  )
}
