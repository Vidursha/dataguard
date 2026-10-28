import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { sessionFromTokens, type Session } from '../auth/session'

function base64Url(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** A fake (unsigned) JWT with the same claims WSO2 puts in access tokens. */
export function fakeJwt(claims: Record<string, unknown>): string {
  return `${base64Url({ alg: 'none' })}.${base64Url(claims)}.sig`
}

export function makeSession(scope: string, overrides: Record<string, unknown> = {}): Session {
  return sessionFromTokens(
    fakeJwt({
      sub: '733d772e-5b72-4466-9ab8-bcb9ef4c7d92',
      scope,
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...overrides,
    }),
  )
}

export const analyst = () => makeSession('openid sales:read')
export const manager = () => makeSession('openid sales:read customer:read')

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** Swap fetch for a fake one that answers based on the URL. */
export function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  const fn = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>((input) =>
    Promise.resolve(handler(String(input))),
  )
  vi.stubGlobal('fetch', fn)
  return fn
}

export function renderWithAuth(ui: ReactElement, { session = analyst() as Session | null, path = '/' } = {}) {
  return render(
    <AuthProvider initial={session}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/signin" element={<p>Sign-in page</p>} />
          <Route path="*" element={ui} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
}

/** Error bodies exactly as the API Manager 4.6.0 gateway sends them. */
export const WSO2_403 = {
  code: '900910',
  message: 'The access token does not allow you to access the requested resource',
  description: 'User is NOT authorized to access the Resource: /customers/12347/summary. Scope validation failed.',
}

export const WSO2_429 = {
  code: '900803',
  message: 'Message throttled out',
  description: 'You have exceeded your quota .You can access API after 2026-Oct-28 10:23:00+0000 UTC',
  nextAccessTime: '2026-Oct-28 10:23:00+0000 UTC',
}
