import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { completeSignIn } from '../auth/authService'
import { Logo } from '../components/Logo'

/** WSO2 redirects here with ?code=...&state=...; we exchange the code for tokens. */
export function CallbackPage() {
  const { setSession } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    completeSignIn(window.location.search)
      .then(({ session, returnTo }) => {
        if (cancelled) return
        setSession(session)
        navigate(returnTo, { replace: true })
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Sign-in failed.'))
    return () => {
      cancelled = true
    }
  }, [navigate, setSession])

  return (
    <main id="main" className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo size="lg" />
      {error ? (
        <div role="alert" className="card max-w-md p-6">
          <h1 className="text-lg font-semibold text-ink">Sign-in did not complete</h1>
          <p className="mt-2 text-sm text-ink-muted">{error}</p>
          <Link to="/signin" className="btn-primary mt-4">
            Back to sign in
          </Link>
        </div>
      ) : (
        <output className="text-sm text-ink-muted">Completing sign-in with WSO2…</output>
      )}
    </main>
  )
}
