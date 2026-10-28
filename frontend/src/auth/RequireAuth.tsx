import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { isExpired } from './session'

/** Sends people who aren't signed in (or whose token expired) to the sign-in page, and remembers where they were going. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const location = useLocation()
  if (!session || isExpired(session)) {
    return <Navigate to="/signin" replace state={{ from: location.pathname, expired: Boolean(session) }} />
  }
  return <>{children}</>
}
