import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { MonthlyRevenueChart, RankingBarChart } from '../components/charts'
import { DataTable } from '../components/DataTable'
import { AccessDenied, ApiErrorView, RateLimited } from '../components/states'
import { KpiCard } from '../components/ui'

describe('KpiCard', () => {
  it('shows the label, value and hint', () => {
    render(<KpiCard label="Total revenue" value="£20,434,356" hint="All data" />)
    expect(screen.getByText('Total revenue')).toBeInTheDocument()
    expect(screen.getByText('£20,434,356')).toBeInTheDocument()
    expect(screen.getByText('All data')).toBeInTheDocument()
  })

  it('shows a skeleton instead of a value while loading', () => {
    const { container } = render(<KpiCard label="Orders" value="39,991" loading />)
    expect(screen.queryByText('39,991')).not.toBeInTheDocument()
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })
})

describe('charts', () => {
  const months = [
    { month: '2010-01', revenue: 560000, orders: 1100 },
    { month: '2010-02', revenue: 498000, orders: 1050 },
    { month: '2010-11', revenue: 1460000, orders: 2900 },
  ]

  it('renders the monthly revenue chart with a screen-reader summary', () => {
    const { container } = render(<MonthlyRevenueChart data={months} />)
    expect(screen.getByTestId('monthly-chart')).toBeInTheDocument()
    expect(screen.getByText(/Highest month: Nov 2010 with £1,460,000/)).toBeInTheDocument()
    expect(container.querySelector('.recharts-area-curve')).toBeInTheDocument()
  })

  it('renders one bar per item in the ranking chart', () => {
    const data = [
      { label: 'REGENCY CAKESTAND 3 TIER', revenue: 330590 },
      { label: 'CREAM HANGING HEART T-LIGHT HOLDER', revenue: 268000 },
      { label: 'JUMBO BAG RED RETROSPOT', revenue: 140000 },
    ]
    const { container } = render(<RankingBarChart data={data} caption="Top products" />)
    expect(screen.getByText(/Top products/)).toBeInTheDocument()
    expect(container.querySelectorAll('.recharts-bar-rectangle')).toHaveLength(3)
  })
})

describe('gateway error panels', () => {
  const forbidden = new ApiError({ kind: 'forbidden', status: 403, code: '900910', message: 'The access token does not allow you to access the requested resource' })

  it('access denied panel shows what the gateway returned', () => {
    render(<AccessDenied error={forbidden} what="individual customer records" />)
    const panel = screen.getByTestId('access-denied')
    expect(within(panel).getByRole('heading', { name: 'Access denied by WSO2 API Manager (403)' })).toBeInTheDocument()
    expect(panel).toHaveTextContent('900910')
    expect(panel).toHaveTextContent('customer:read')
    expect(panel).toHaveAttribute('role', 'alert')
  })

  it('rate-limit panel shows the retry time and a retry button', async () => {
    const retryAt = new Date(Date.now() + 42_000)
    const error = new ApiError({ kind: 'rate_limited', status: 429, code: '900803', message: 'Message throttled out', retryAt })
    let retried = false
    render(<RateLimited error={error} onRetry={() => (retried = true)} />)
    const panel = screen.getByTestId('rate-limited')
    expect(panel).toHaveTextContent('Too many requests, limited by WSO2')
    expect(panel).toHaveTextContent(/try again in about 4\d seconds/)
    await userEvent.click(within(panel).getByRole('button', { name: 'Try again' }))
    expect(retried).toBe(true)
  })

  it('ApiErrorView picks the right panel for each status', () => {
    const { rerender } = render(<ApiErrorView error={forbidden} />)
    expect(screen.getByTestId('access-denied')).toBeInTheDocument()
    rerender(<ApiErrorView error={new ApiError({ kind: 'rate_limited', status: 429, message: 'x' })} />)
    expect(screen.getByTestId('rate-limited')).toBeInTheDocument()
    rerender(<ApiErrorView error={new ApiError({ kind: 'network', status: 0, message: 'x' })} />)
    expect(screen.getByTestId('error-state')).toHaveTextContent('Cannot reach the WSO2 gateway')
    rerender(<ApiErrorView error={new ApiError({ kind: 'server', status: 503, message: 'x' })} />)
    expect(screen.getByTestId('error-state')).toHaveTextContent('The sales service is unavailable')
  })
})

describe('DataTable', () => {
  it('sorts by a column and announces it with aria-sort', async () => {
    const rows = [
      { name: 'France', revenue: 68 },
      { name: 'Spain', revenue: 120 },
      { name: 'Austria', revenue: 30 },
    ]
    render(
      <DataTable
        caption="Countries"
        rows={rows}
        rowKey={(r) => r.name}
        columns={[
          { key: 'name', header: 'Country', value: (r) => r.name },
          { key: 'revenue', header: 'Revenue', value: (r) => r.revenue, numeric: true },
        ]}
      />,
    )
    const firstCells = () => screen.getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[0].textContent)
    expect(firstCells()).toEqual(['Austria', 'France', 'Spain'])
    await userEvent.click(screen.getByRole('button', { name: /Revenue/ }))
    expect(firstCells()).toEqual(['Spain', 'France', 'Austria'])
    expect(screen.getByRole('columnheader', { name: /Revenue/ })).toHaveAttribute('aria-sort', 'descending')
  })
})
