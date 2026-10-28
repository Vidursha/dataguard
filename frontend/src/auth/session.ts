/**
 * The signed-in session. Tokens live in sessionStorage only: they survive a
 * page reload in the same tab, vanish when the tab closes, and are never put
 * in localStorage.
 */

export interface Session {
  accessToken: string
  idToken?: string
  /** Epoch milliseconds when the access token expires. */
  expiresAt: number
  scopes: string[]
  /** Subject (user ID) from the access token. */
  subject: string
  /** Username, if WSO2 is configured to release one (see docs/manual-steps.md). */
  username?: string
}

export type Role = 'manager' | 'analyst' | 'none'

const SESSION_KEY = 'dataguard.session'

export function decodeJwt(token: string): Record<string, unknown> {
  const payload = token.split('.')[1]
  if (!payload) throw new Error('Not a JWT')
  const bytes = Uint8Array.from(atob(payload.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
}

export function sessionFromTokens(accessToken: string, idToken?: string): Session {
  const claims = decodeJwt(accessToken)
  const idClaims = idToken ? decodeJwt(idToken) : {}
  const name = idClaims.username ?? idClaims.preferred_username ?? claims.username
  return {
    accessToken,
    idToken,
    expiresAt: Number(claims.exp) * 1000,
    scopes: String(claims.scope ?? '').split(' ').filter(Boolean),
    subject: String(claims.sub ?? ''),
    username: typeof name === 'string' ? name : undefined,
  }
}

/**
 * The role, as shown by what WSO2 granted. API Manager issues customer:read
 * only to the manager role and sales:read to analysts and managers, so the
 * granted scopes identify the role exactly.
 */
export function roleOf(session: Session): Role {
  if (session.scopes.includes('customer:read')) return 'manager'
  if (session.scopes.includes('sales:read')) return 'analyst'
  return 'none'
}

export function isExpired(session: Session, now = Date.now()): boolean {
  return now >= session.expiresAt
}

export function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as Session
    return isExpired(session) ? null : session
  } catch {
    return null
  }
}

export function saveSession(session: Session): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY)
}
