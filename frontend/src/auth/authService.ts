/**
 * Sign-in with WSO2 API Manager using OAuth2 Authorization Code + PKCE.
 *
 * 1. startSignIn: make a verifier and a state, then go to WSO2's login page.
 * 2. WSO2 checks the user and sends them back to /callback?code=...&state=...
 * 3. completeSignIn: check the state, then swap the code + verifier for tokens.
 * 4. signOut: forget the tokens and end the WSO2 login session too.
 */

import { config, redirectUri } from '../config'
import { codeChallenge, randomString } from './pkce'
import { clearSession, saveSession, sessionFromTokens, type Session } from './session'

const PENDING_KEY = 'dataguard.pkce'

interface PendingSignIn {
  verifier: string
  state: string
  returnTo: string
}

export class SignInError extends Error {}

export async function startSignIn(returnTo = '/overview'): Promise<void> {
  const pending: PendingSignIn = { verifier: randomString(), state: randomString(16), returnTo }
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending))
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: redirectUri(),
    scope: config.scopes,
    state: pending.state,
    code_challenge: await codeChallenge(pending.verifier),
    code_challenge_method: 'S256',
  })
  window.location.assign(`${config.wso2Url}/oauth2/authorize?${params}`)
}

// In development React can run the callback effect twice. A sign-in code only
// works once, so we remember the exchange for each code and reuse it.
const exchanges = new Map<string, Promise<{ session: Session; returnTo: string }>>()

export function completeSignIn(search: string): Promise<{ session: Session; returnTo: string }> {
  const params = new URLSearchParams(search)
  const code = params.get('code') ?? ''
  const existing = exchanges.get(code)
  if (existing) return existing
  const promise = exchange(params)
  exchanges.set(code, promise)
  return promise
}

async function exchange(params: URLSearchParams): Promise<{ session: Session; returnTo: string }> {
  const error = params.get('error')
  if (error) {
    throw new SignInError(
      error === 'access_denied'
        ? 'Sign-in was cancelled or consent was denied on the WSO2 page.'
        : `WSO2 returned an error: ${params.get('error_description') ?? error}`,
    )
  }
  const raw = sessionStorage.getItem(PENDING_KEY)
  const pending = raw ? (JSON.parse(raw) as PendingSignIn) : null
  const code = params.get('code')
  if (!pending || !code || params.get('state') !== pending.state) {
    throw new SignInError('This sign-in link is invalid or has already been used. Please sign in again.')
  }
  sessionStorage.removeItem(PENDING_KEY)

  let response: Response
  try {
    response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri(),
        client_id: config.clientId,
        code_verifier: pending.verifier,
      }),
    })
  } catch {
    throw new SignInError('Could not reach the WSO2 token endpoint. Is API Manager running?')
  }
  if (!response.ok) {
    throw new SignInError(`WSO2 rejected the sign-in (HTTP ${response.status}). Please try again.`)
  }
  const tokens = (await response.json()) as { access_token: string; id_token?: string }
  const session = sessionFromTokens(tokens.access_token, tokens.id_token)
  saveSession(session)
  return { session, returnTo: pending.returnTo.startsWith('/') ? pending.returnTo : '/overview' }
}

/** Clear the tokens here and end the WSO2 session, so the next sign-in asks for the password again. */
export function signOut(session: Session | null): void {
  clearSession()
  if (!session?.idToken) {
    window.location.assign('/')
    return
  }
  const params = new URLSearchParams({
    id_token_hint: session.idToken,
    post_logout_redirect_uri: `${window.location.origin}/`,
    state: randomString(16),
  })
  window.location.assign(`${config.wso2Url}/oidc/logout?${params}`)
}
