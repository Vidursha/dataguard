import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { RequireAuth } from '../auth/RequireAuth'
import { CustomersPage } from '../pages/CustomersPage'
import { OverviewPage } from '../pages/OverviewPage'
import { ProductsPage } from '../pages/RankingPages'
import { AccessPage } from '../pages/AccessPage'
import { analyst, jsonResponse, makeSession, manager, mockFetch, renderWithAuth, WSO2_403, WSO2_429 } from './utils'

const GATEWAY = 'https://gateway.test:8243/dataguard/1.0.0'

const summary = { period: { start: null, end: null }, total_revenue: 19725087.52, orders: 39639, average_order_value: 497.62, customers: 5842, units_sold: 11205020 }
const monthly = { period: { start: null, end: null }, months: [{ month: '2010-11', revenue: 1460000, orders: 2900 }] }
const products = {
  products: [{ rank: 1, stock_code: '22423', description: 'REGENCY CAKESTAND 3 TIER', units_sold: 26478, revenue: 330590.32, orders: 3918 }],
}

async function lookUp(customerId: string) {
  await userEvent.type(screen.getByLabelText('Customer number'), customerId)
  await userEvent.click(screen.getByRole('button', { name: 'Look up' }))
}

describe('Customers page', () => {
  it('analyst sees the access-denied panel built from the gateway 403', async () => {
    const fetchMock = mockFetch(() => jsonResponse(403, WSO2_403))
    renderWithAuth(<CustomersPage />, { session: analyst() })
    await lookUp('12347')

    const panel = await screen.findByTestId('access-denied')
    expect(panel).toHaveTextContent('Access denied by WSO2 API Manager (403)')
    expect(panel).toHaveTextContent('900910')
    // The page really called the gateway with the token. The UI didn't check the role itself.
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe(`${GATEWAY}/customers/12347/summary`)
    expect(new Headers(init?.headers).get('Authorization')).toMatch(/^Bearer /)
  })

  it('manager sees the customer summary', async () => {
    mockFetch(() =>
      jsonResponse(200, {
        customer_id: 12347, country: 'Iceland', orders: 8, total_spend: 4921.53, units_bought: 2967,
        average_order_value: 615.19, first_order: '2010-10-31 14:20:00', last_order: '2011-12-07 15:52:00',
      }),
    )
    renderWithAuth(<CustomersPage />, { session: manager() })
    await lookUp('12347')
    const card = await screen.findByTestId('customer-summary')
    expect(card).toHaveTextContent('£4,921.53')
    expect(card).toHaveTextContent('31 Oct 2010, 14:20')
    expect(screen.getByText('Based in Iceland')).toBeInTheDocument()
  })

  it('validates the customer number before calling the gateway', async () => {
    const fetchMock = mockFetch(() => jsonResponse(200, {}))
    renderWithAuth(<CustomersPage />)
    await lookUp('abc')
    expect(screen.getByRole('alert')).toHaveTextContent('digits only')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('explains an unknown customer (404)', async () => {
    mockFetch(() => jsonResponse(404, { error: { code: 'not_found', message: 'No registered customer with ID 99.' } }))
    renderWithAuth(<CustomersPage />, { session: manager() })
    await lookUp('99')
    expect(await screen.findByText('No registered customer 99')).toBeInTheDocument()
  })
})

describe('Overview page', () => {
  it('shows skeletons while loading, then KPI values', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    mockFetch(async (url) => {
      await gate
      return jsonResponse(200, url.includes('/monthly') ? monthly : summary)
    })
    renderWithAuth(<OverviewPage />)
    expect(screen.getByText('Loading key figures')).toBeInTheDocument()
    release()
    expect(await screen.findByText('£19,725,088')).toBeInTheDocument()
    expect(screen.getByText('39,639')).toBeInTheDocument()
    expect(screen.getByText('£497.62')).toBeInTheDocument()
    expect(screen.getByText('5,842')).toBeInTheDocument()
  })

  it('shows the friendly 429 message when the gateway throttles', async () => {
    mockFetch(() => jsonResponse(429, WSO2_429))
    renderWithAuth(<OverviewPage />)
    const panel = await screen.findByTestId('rate-limited')
    expect(panel).toHaveTextContent('Too many requests, limited by WSO2')
    expect(panel).toHaveTextContent('900803')
  })

  it('sends the chosen date range to the gateway', async () => {
    const fetchMock = mockFetch((url) => jsonResponse(200, url.includes('/monthly') ? monthly : summary))
    renderWithAuth(<OverviewPage />)
    await screen.findByText('£19,725,088')
    await userEvent.click(screen.getByRole('button', { name: '2010' }))
    await waitFor(() =>
      expect(fetchMock.mock.calls.map((c) => String(c[0]))).toContain(`${GATEWAY}/sales/summary?from=2010-01-01&to=2010-12-31`),
    )
  })
})

describe('Products page', () => {
  it('shows an error state when the gateway cannot be reached, and recovers on retry', async () => {
    let fail = true
    mockFetch(() => {
      if (fail) throw new TypeError('Failed to fetch')
      return jsonResponse(200, products)
    })
    renderWithAuth(<ProductsPage />)
    const error = await screen.findByTestId('error-state')
    expect(error).toHaveTextContent('Cannot reach the WSO2 gateway')
    fail = false
    await userEvent.click(within(error).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('cell', { name: 'REGENCY CAKESTAND 3 TIER' })).toBeInTheDocument()
  })

  it('shows an empty state when there are no products', async () => {
    mockFetch(() => jsonResponse(200, { products: [] }))
    renderWithAuth(<ProductsPage />)
    expect(await screen.findByText('No products to show')).toBeInTheDocument()
  })
})

describe('auth guard', () => {
  it('redirects signed-out visitors to the sign-in page', () => {
    renderWithAuth(<RequireAuth><p>Secret dashboard</p></RequireAuth>, { session: null, path: '/overview' })
    expect(screen.getByText('Sign-in page')).toBeInTheDocument()
    expect(screen.queryByText('Secret dashboard')).not.toBeInTheDocument()
  })

  it('redirects when the token has expired', () => {
    const expired = makeSession('openid sales:read', { exp: Math.floor(Date.now() / 1000) - 10 })
    renderWithAuth(<RequireAuth><p>Secret dashboard</p></RequireAuth>, { session: expired, path: '/overview' })
    expect(screen.getByText('Sign-in page')).toBeInTheDocument()
  })

  it('lets signed-in users through', () => {
    renderWithAuth(<RequireAuth><p>Secret dashboard</p></RequireAuth>, { session: analyst() })
    expect(screen.getByText('Secret dashboard')).toBeInTheDocument()
  })

  it('a 401 from the gateway ends the session', async () => {
    mockFetch(() => jsonResponse(401, { code: '900901', message: 'Invalid Credentials' }))
    renderWithAuth(<RequireAuth><ProductsPage /></RequireAuth>, { session: analyst() })
    expect(await screen.findByText('Sign-in page')).toBeInTheDocument()
  })
})

describe('Access & Security page', () => {
  it('shows role, scopes and expiry from the token', () => {
    renderWithAuth(<AccessPage />, { session: analyst() })
    expect(screen.getAllByText('Analyst').length).toBeGreaterThan(0)
    expect(screen.getByText('sales:read')).toBeInTheDocument()
    expect(screen.getByText(/Not granted, so customer lookups will be refused/)).toBeInTheDocument()
    expect(screen.getByText(/in 60 min/)).toBeInTheDocument()
  })
})
