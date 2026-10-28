import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { startSignIn } from '../auth/authService'
import { GaugeIcon, KeyIcon, LockIcon, ServerIcon } from '../components/icons'
import { Logo } from '../components/Logo'

const POINTS = [
  { icon: KeyIcon, title: 'Sign in once, through WSO2', text: 'Your password is entered on the WSO2 API Manager login page, never in DataGuard.' },
  { icon: LockIcon, title: 'See only what your role allows', text: 'Analysts see sales, product and country figures. Managers can also look up individual customers.' },
  { icon: GaugeIcon, title: 'Fair use for people and AI', text: 'Every request is rate-limited, and AI assistants get a tighter limit than people.' },
  { icon: ServerIcon, title: 'No back doors', text: 'The sales database is reachable only through the WSO2 gateway, never directly.' },
]

export function SignInPage() {
  const { session } = useAuth()
  const location = useLocation()
  const state = (location.state ?? {}) as { from?: string; expired?: boolean }
  const [redirecting, setRedirecting] = useState(false)

  if (session) return <Navigate to={state.from ?? '/overview'} replace />

  const signIn = () => {
    setRedirecting(true)
    void startSignIn(state.from)
  }

  return (
    <main id="main" className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-4xl">
        <div className="card grid overflow-hidden md:grid-cols-2">
          <section className="flex flex-col justify-center gap-6 p-8 sm:p-10">
            <Logo size="lg" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-ink">Governed data access for people and AI agents</h1>
              <p className="mt-3 text-sm text-ink-muted">
                DataGuard lets managers, analysts and AI assistants answer sales questions for an online retailer
                without direct database access. Every request is authenticated, authorized, rate-limited and logged by
                WSO2 API Manager.
              </p>
            </div>
            {state.expired && (
              <output className="block rounded-control bg-warning-soft px-3 py-2 text-sm text-warning">
                Your session has ended. Please sign in again.
              </output>
            )}
            <button type="button" className="btn-primary w-full py-3 text-base" onClick={signIn} disabled={redirecting}>
              {redirecting ? 'Opening WSO2 sign-in…' : 'Sign in with WSO2'}
            </button>
            <p className="text-xs text-ink-subtle">Powered by WSO2 API Manager</p>
          </section>
          <section className="border-t border-border bg-surface-muted/60 p-8 sm:p-10 md:border-l md:border-t-0" aria-labelledby="how-heading">
            <h2 id="how-heading" className="text-sm font-semibold uppercase tracking-wide text-ink-subtle">
              How DataGuard protects the data
            </h2>
            <ul className="mt-5 space-y-5">
              {POINTS.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-3">
                  <span className="mt-0.5 rounded-control bg-brand-soft p-2 text-brand-ink">
                    <Icon />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink">{title}</p>
                    <p className="text-sm text-ink-muted">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </main>
  )
}
