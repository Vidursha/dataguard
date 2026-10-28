/**
 * Friendly empty and error states. AccessDenied and RateLimited are rendered
 * from the real gateway response (status and WSO2 error code), never from a
 * client-side guess.
 */
import type { ReactNode } from 'react'
import type { ApiError } from '../api/client'
import { config } from '../config'
import { AlertIcon, ClockIcon, InboxIcon, LockIcon } from './icons'

function Panel({
  tone,
  icon,
  title,
  children,
  testId,
}: {
  tone: 'danger' | 'warning' | 'neutral'
  icon: ReactNode
  title: string
  children: ReactNode
  testId?: string
}) {
  const tones = {
    danger: 'border-danger/30 bg-danger-soft',
    warning: 'border-warning/30 bg-warning-soft',
    neutral: 'border-border bg-surface',
  }
  const iconTones = { danger: 'text-danger', warning: 'text-warning', neutral: 'text-ink-subtle' }
  return (
    <div role="alert" data-testid={testId} className={`rounded-card border p-6 ${tones[tone]}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span className={`shrink-0 ${iconTones[tone]}`}>{icon}</span>
        <div className="min-w-0 space-y-2">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <div className="space-y-2 text-sm text-ink-muted">{children}</div>
        </div>
      </div>
    </div>
  )
}

function GatewayDetail({ error }: { error: ApiError }) {
  return (
    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-control bg-surface/70 p-3 text-xs">
      <dt className="font-semibold text-ink-muted">HTTP status</dt>
      <dd className="num text-ink">{error.status}</dd>
      {error.code && (
        <>
          <dt className="font-semibold text-ink-muted">WSO2 code</dt>
          <dd className="num text-ink">{error.code}</dd>
        </>
      )}
      <dt className="font-semibold text-ink-muted">Gateway said</dt>
      <dd className="break-words text-ink">{error.message}</dd>
    </dl>
  )
}

export function AccessDenied({ error, what }: { error: ApiError; what: string }) {
  return (
    <Panel tone="danger" icon={<LockIcon className="h-8 w-8" />} title="Access denied by WSO2 API Manager (403)" testId="access-denied">
      <p>
        Your sign-in worked, but your role does not include permission to view {what}. The WSO2 gateway checked the
        scopes in your access token and refused the request before it reached the sales database.
      </p>
      <p>Customer data needs the <code className="font-semibold text-ink">customer:read</code> scope, which only the manager role is granted. If you need it, ask an administrator.</p>
      <GatewayDetail error={error} />
    </Panel>
  )
}

function retryText(retryAt?: Date): string {
  if (!retryAt) return 'Please wait a minute and try again.'
  const seconds = Math.max(0, Math.ceil((retryAt.getTime() - Date.now()) / 1000))
  const at = retryAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  return seconds > 0 ? `You can try again in about ${seconds} seconds (at ${at}).` : 'You can try again now.'
}

export function RateLimited({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <Panel tone="warning" icon={<ClockIcon className="h-8 w-8" />} title="Too many requests, limited by WSO2" testId="rate-limited">
      <p>
        The DataGuard dashboard allows each user a set number of requests per minute, and you have reached it. WSO2 API
        Manager paused your requests to protect the service for everyone.
      </p>
      <p className="font-medium text-ink">{retryText(error.retryAt)}</p>
      <GatewayDetail error={error} />
      {onRetry && (
        <button type="button" className="btn-secondary mt-2" onClick={onRetry}>
          Try again
        </button>
      )}
    </Panel>
  )
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border-strong px-6 py-12 text-center">
      <InboxIcon className="h-8 w-8 text-ink-subtle" />
      <h2 className="mt-3 text-base font-semibold text-ink">{title}</h2>
      <div className="mt-1 max-w-md text-sm text-ink-muted">{children}</div>
    </div>
  )
}

const GENERIC: Record<string, { title: string; body: string }> = {
  network: {
    title: 'Cannot reach the WSO2 gateway',
    body: `The dashboard could not connect to ${new URL(config.apiUrl).origin}. Check that API Manager is running. On a new machine, open that address once in your browser and accept the local development certificate.`,
  },
  server: {
    title: 'The sales service is unavailable',
    body: 'The WSO2 gateway is up, but the DataGuard backend did not answer. Check that the backend is running, then try again.',
  },
  bad_request: { title: 'That request was not valid', body: 'Please check the values you entered and try again.' },
  not_found: { title: 'Nothing found', body: 'The requested data does not exist.' },
  unauthorized: { title: 'Your session has ended', body: 'Please sign in again to continue.' },
}

/** Picks the right panel for any gateway error. */
export function ApiErrorView({ error, onRetry, what = 'this data' }: { error: ApiError; onRetry?: () => void; what?: string }) {
  if (error.kind === 'forbidden') return <AccessDenied error={error} what={what} />
  if (error.kind === 'rate_limited') return <RateLimited error={error} onRetry={onRetry} />
  const text = GENERIC[error.kind] ?? GENERIC.server
  return (
    <Panel tone="neutral" icon={<AlertIcon className="h-8 w-8" />} title={text.title} testId="error-state">
      <p>{error.kind === 'bad_request' && error.message ? error.message : text.body}</p>
      {onRetry && error.kind !== 'bad_request' && (
        <button type="button" className="btn-secondary mt-2" onClick={onRetry}>
          Try again
        </button>
      )}
    </Panel>
  )
}
