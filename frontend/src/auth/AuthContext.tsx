import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { signOut as endWso2Session } from './authService'
import { clearSession, loadSession, type Session } from './session'

interface AuthState {
  session: Session | null
  setSession: (session: Session | null) => void
  /** Forget an expired or rejected token here, without going to WSO2. */
  expire: () => void
  signOut: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children, initial }: { children: ReactNode; initial?: Session | null }) {
  const [session, setSession] = useState<Session | null>(() => (initial === undefined ? loadSession() : initial))

  const expire = useCallback(() => {
    clearSession()
    setSession(null)
  }, [])

  const signOut = useCallback(() => {
    endWso2Session(session)
    setSession(null)
  }, [session])

  const value = useMemo(() => ({ session, setSession, expire, signOut }), [session, expire, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** For components that only show when someone is signed in (inside <RequireAuth>). */
export function useSession(): Session {
  const { session } = useAuth()
  if (!session) throw new Error('useSession used outside <RequireAuth>')
  return session
}
