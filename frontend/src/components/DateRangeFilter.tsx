import { useState, type FormEvent } from 'react'
import type { DateFilter } from '../api/endpoints'

export const DATA_START = '2009-12-01'
export const DATA_END = '2011-12-09'

const PRESETS: { label: string; range: DateFilter }[] = [
  { label: 'All data', range: {} },
  { label: '2010', range: { from: '2010-01-01', to: '2010-12-31' } },
  { label: '2011', range: { from: '2011-01-01', to: '2011-12-09' } },
]

/**
 * Date range filter. Changes apply on submit, not on every keystroke, so the
 * dashboard does not spend the user's WSO2 rate-limit allowance while typing.
 */
export function DateRangeFilter({ value, onChange }: { value: DateFilter; onChange: (range: DateFilter) => void }) {
  const [from, setFrom] = useState(value.from ?? '')
  const [to, setTo] = useState(value.to ?? '')
  const [error, setError] = useState('')

  const apply = (range: DateFilter) => {
    setFrom(range.from ?? '')
    setTo(range.to ?? '')
    setError('')
    onChange(range)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (from && to && from > to) {
      setError('The start date must be on or before the end date.')
      return
    }
    apply({ from: from || undefined, to: to || undefined })
  }

  const isActive = (range: DateFilter) => (range.from ?? '') === (value.from ?? '') && (range.to ?? '') === (value.to ?? '')

  return (
    <form onSubmit={submit} className="card flex flex-col gap-3 p-4 lg:flex-row lg:items-end" aria-label="Date range">
      <fieldset className="flex flex-wrap gap-2">
        <legend className="label">Quick range</legend>
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            aria-pressed={isActive(preset.range)}
            onClick={() => apply(preset.range)}
            className={`rounded-control border px-3 py-2 text-sm font-medium ${
              isActive(preset.range)
                ? 'border-brand bg-brand-soft text-brand-ink'
                : 'border-border-strong text-ink-muted hover:bg-surface-muted'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </fieldset>
      <div className="grid grid-cols-2 gap-3 lg:ml-auto lg:flex lg:items-end">
        <div>
          <label htmlFor="range-from" className="label">
            From
          </label>
          <input
            id="range-from"
            type="date"
            className="input"
            min={DATA_START}
            max={DATA_END}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-describedby={error ? 'range-error' : undefined}
          />
        </div>
        <div>
          <label htmlFor="range-to" className="label">
            To
          </label>
          <input
            id="range-to"
            type="date"
            className="input"
            min={DATA_START}
            max={DATA_END}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-describedby={error ? 'range-error' : undefined}
          />
        </div>
        <button type="submit" className="btn-primary col-span-2 lg:col-span-1">
          Apply
        </button>
      </div>
      {error && (
        <p id="range-error" role="alert" className="text-sm font-medium text-danger lg:basis-full">
          {error}
        </p>
      )}
    </form>
  )
}
