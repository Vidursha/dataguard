/**
 * The signed-in session. Tokens are only kept in sessionStorage. They survive
 * a page reload in the same tab, disappear when the tab is closed, and never
 * go into localStorage.
 */

export interface Session {
  accessToken: string
  idToken?: string
  /** When the access token expires (epoch milliseconds). */
  expiresAt: number
  scopes: string[]
  /** The user ID ("sub") from the access token. */
  subject: string
  /** Username, if WSO2 is set up to send it. */
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
 * Works out the role from the scopes WSO2 gave. API Manager only gives
 * customer:read to managers, and sales:read to analysts and managers, so the
 * scopes tell us the role exactly.
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
