import { useState, type FormEvent } from 'react'
import { api } from '../api/endpoints'
import { useApi } from '../api/useApi'
import { ApiErrorView } from '../components/states'
import { Card, LoadingRegion, PageHeader, Skeleton } from '../components/ui'
import { formatDateTime, formatGBP, formatNumber } from '../format'

/**
 * Customer lookup. Every signed-in user sees this page and can submit a
 * lookup; whether data comes back is decided by the WSO2 gateway alone.
 * Analysts get the gateway's real 403, rendered by AccessDenied.
 */
export function CustomersPage() {
  const [input, setInput] = useState('')
  const [inputError, setInputError] = useState('')
  const [customerId, setCustomerId] = useState<number | null>(null)
  const state = useApi(
    customerId === null ? null : (token, signal) => api.customerSummary(token, customerId, signal),
    [customerId],
  )

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const value = input.trim()
    if (!/^\d{1,8}$/.test(value) || Number(value) < 1) {
      setInputError('Enter a customer number using digits only, for example 12347.')
      return
    }
    setInputError('')
    if (Number(value) === customerId) state.reload()
    else setCustomerId(Number(value))
  }

  return (
    <>
      <PageHeader
        title="Customers"
        description="Look up one registered customer's order history. This is personal data, so WSO2 only allows it for the manager role."
      />
      <div className="space-y-6">
        <form onSubmit={submit} className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-end" noValidate>
          <div className="flex-1">
            <label htmlFor="customer-id" className="label">
              Customer number
            </label>
            <input
              id="customer-id"
              className="input"
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 12347"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-invalid={Boolean(inputError)}
              aria-describedby={inputError ? 'customer-id-error' : 'customer-id-hint'}
            />
            {inputError ? (
              <p id="customer-id-error" role="alert" className="mt-1 text-sm font-medium text-danger">
                {inputError}
              </p>
            ) : (
              <p id="customer-id-hint" className="mt-1 text-xs text-ink-subtle">
                Try 12347, 14646 or 18102. Guest purchases have no customer number and cannot be looked up.
              </p>
            )}
          </div>
          <button type="submit" className="btn-primary sm:mb-6">
            Look up
          </button>
        </form>

        {state.status === 'loading' && (
          <LoadingRegion label="Looking up customer">
            <div className="card grid gap-4 p-5 sm:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          </LoadingRegion>
        )}

        {state.status === 'error' &&
          (state.error.kind === 'not_found' ? (
            <div role="alert" className="card p-5">
              <h2 className="text-base font-semibold text-ink">No registered customer {customerId}</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Check the number and try again. Customer numbers in this data run from 12346 to 18287.
              </p>
            </div>
          ) : (
            <ApiErrorView error={state.error} onRetry={state.reload} what="individual customer records" />
          ))}

        {state.status === 'success' && (
          <Card title={`Customer ${state.data.customer_id}`} description={`Based in ${state.data.country}`}>
            <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="customer-summary">
              {[
                ['Lifetime spend', formatGBP(state.data.total_spend, true)],
                ['Orders', formatNumber(state.data.orders)],
                ['Average order value', formatGBP(state.data.average_order_value, true)],
                ['Items bought', formatNumber(state.data.units_bought)],
                ['First order', formatDateTime(state.data.first_order)],
                ['Most recent order', formatDateTime(state.data.last_order)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm text-ink-muted">{label}</dt>
                  <dd className="num mt-0.5 text-xl font-semibold text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        )}
      </div>
    </>
  )
}
