import type { ReactNode } from 'react'

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-control bg-surface-muted ${className}`} aria-hidden="true" />
}

/** Wraps loading placeholders so screen readers hear one "Loading" message. */
export function LoadingRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <output aria-live="polite" className="block">
      <span className="sr-only">{label}</span>
      {children}
    </output>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">{description}</p>
      </div>
      {actions}
    </header>
  )
}

export function Card({
  title,
  description,
  children,
  className = '',
  actions,
}: {
  title?: string
  description?: string
  children: ReactNode
  className?: string
  actions?: ReactNode
}) {
  return (
    <section className={`card p-5 ${className}`} aria-label={title}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

export function KpiCard({
  label,
  value,
  hint,
  loading = false,
}: {
  label: string
  value?: string
  hint?: string
  loading?: boolean
}) {
  return (
    <div className="card p-5">
      <p className="text-sm font-medium text-ink-muted">{label}</p>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-32" />
      ) : (
        <p className="mt-2 text-3xl font-bold tracking-tight text-ink">{value}</p>
      )}
      {hint && <p className="mt-1 text-xs text-ink-subtle">{hint}</p>}
    </div>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'success' }) {
  const tones = {
    neutral: 'bg-surface-muted text-ink-muted',
    brand: 'bg-brand-soft text-brand-ink',
    success: 'bg-success-soft text-success',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  )
}
