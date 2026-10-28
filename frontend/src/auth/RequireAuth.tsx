import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { isExpired } from './session'

/** Sends signed-out (or expired) visitors to the sign-in page, remembering where they wanted to go. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const location = useLocation()
  if (!session || isExpired(session)) {
    return <Navigate to="/signin" replace state={{ from: location.pathname, expired: Boolean(session) }} />
  }
  return <>{children}</>
}
