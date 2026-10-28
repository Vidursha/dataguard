import { useEffect, useState } from 'react'
import { useSession } from '../auth/AuthContext'
import { roleOf } from '../auth/session'
import { GaugeIcon, KeyIcon, LockIcon, ServerIcon } from '../components/icons'
import { ROLE_LABEL } from '../components/Layout'
import { Badge, Card, PageHeader } from '../components/ui'
import { formatLocalDateTime } from '../format'

const SCOPE_TEXT: Record<string, string> = {
  'sales:read': 'Read aggregated sales, product and country figures.',
  'customer:read': 'Read individual customer order history (personal data).',
  openid: 'Lets WSO2 confirm who you are (OpenID Connect sign-in).',
}

const ROLE_TEXT = {
  manager: 'WSO2 granted customer:read, which only the manager role receives.',
  analyst: 'WSO2 granted sales:read but not customer:read, which is what the analyst role receives.',
  none: 'WSO2 granted no data scopes, so every data request will be refused.',
}

const PROTECTIONS = [
  {
    icon: KeyIcon,
    title: 'OAuth2 sign-in with PKCE',
    text: 'You signed in on the WSO2 login page. DataGuard never sees your password. It received a short-lived access token, using a one-time code verifier (PKCE) so a stolen sign-in code is useless to anyone else.',
  },
  {
    icon: LockIcon,
    title: 'Scopes decide what you can read',
    text: 'Every request carries your token to the WSO2 gateway, which checks that the token is valid and has the scope the endpoint needs. Customer lookups need customer:read; without it the gateway answers 403 and the request never reaches the data.',
  },
  {
    icon: GaugeIcon,
    title: 'Rate limits for people and AI',
    text: 'WSO2 counts requests per application and user. The dashboard allows 30 requests a minute per person; AI assistants get only 10, so a runaway agent cannot overload the service. Going over returns 429 until the minute resets.',
  },
  {
    icon: ServerIcon,
    title: 'The gateway is the only door',
    text: 'The sales API only answers requests carrying a secret header that the WSO2 gateway adds. A request that skips the gateway, even from the same computer, is rejected. Every request through the gateway is logged.',
  },
]

function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

export function AccessPage() {
  const session = useSession()
  const role = roleOf(session)
  const now = useNow()
  const minutesLeft = Math.max(0, Math.round((session.expiresAt - now) / 60_000))

  return (
    <>
      <PageHeader
        title="Access & Security"
        description="What WSO2 API Manager knows about your session, and how it protects every request you make."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Your session">
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-ink-muted">Signed-in user</dt>
              <dd className="mt-0.5 font-semibold text-ink">{session.username ?? 'Not released by WSO2'}</dd>
              <dd className="mt-0.5 break-all text-xs text-ink-subtle">User ID (token subject): {session.subject}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Role</dt>
              <dd className="mt-0.5 flex items-center gap-2">
                <Badge tone="brand">{ROLE_LABEL[role]}</Badge>
              </dd>
              <dd className="mt-1 text-xs text-ink-subtle">{ROLE_TEXT[role]}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Token expires</dt>
              <dd className="num mt-0.5 font-semibold text-ink">
                {formatLocalDateTime(session.expiresAt)}{' '}
                <span className="font-normal text-ink-muted">({minutesLeft === 0 ? 'in under a minute' : `in ${minutesLeft} min`})</span>
              </dd>
              <dd className="mt-0.5 text-xs text-ink-subtle">After that you will be asked to sign in again. Tokens are kept only in this browser tab.</dd>
            </div>
          </dl>
        </Card>

        <Card title="Scopes in your access token" description="Granted by WSO2 based on your role.">
          <ul className="space-y-3">
            {session.scopes.map((scope) => (
              <li key={scope} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
                <code className="w-fit shrink-0 rounded bg-surface-muted px-2 py-0.5 text-sm font-semibold text-ink">{scope}</code>
                <span className="text-sm text-ink-muted">{SCOPE_TEXT[scope] ?? 'Granted by WSO2.'}</span>
              </li>
            ))}
            {!session.scopes.includes('customer:read') && (
              <li className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
                <code className="w-fit shrink-0 rounded bg-danger-soft px-2 py-0.5 text-sm font-semibold text-danger line-through">
                  customer:read
                </code>
                <span className="text-sm text-ink-muted">Not granted, so customer lookups will be refused by the gateway.</span>
              </li>
            )}
          </ul>
        </Card>

        <Card title="How WSO2 protects each request" className="lg:col-span-2">
          <ul className="grid gap-5 md:grid-cols-2">
            {PROTECTIONS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 h-fit rounded-control bg-brand-soft p-2 text-brand-ink">
                  <Icon />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-ink">{title}</h3>
                  <p className="mt-1 text-sm text-ink-muted">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  )
}
