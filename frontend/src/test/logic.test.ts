import { describe, expect, it } from 'vitest'
import { parseNextAccessTime } from '../api/client'
import { completeSignIn } from '../auth/authService'
import { codeChallenge, randomString } from '../auth/pkce'
import { roleOf } from '../auth/session'
import { formatDateTime, formatGBP, formatMonth, formatNumber, formatPercent } from '../format'
import { makeSession } from './utils'

describe('PKCE', () => {
  it('computes the RFC 7636 S256 example challenge', async () => {
    expect(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    )
  })

  it('creates URL-safe, unpredictable verifiers', () => {
    const a = randomString()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(randomString()).not.toBe(a)
  })

  it('rejects a callback whose state does not match', async () => {
    sessionStorage.setItem('dataguard.pkce', JSON.stringify({ verifier: 'v', state: 'expected', returnTo: '/overview' }))
    await expect(completeSignIn('?code=abc&state=forged')).rejects.toThrow(/invalid or has already been used/)
  })

  it('reports a cancelled sign-in', async () => {
    await expect(completeSignIn('?error=access_denied&state=x')).rejects.toThrow(/cancelled/)
  })
})

describe('roles come from granted scopes', () => {
  it.each([
    ['openid sales:read customer:read', 'manager'],
    ['openid sales:read', 'analyst'],
    ['openid', 'none'],
  ])('%s -> %s', (scope, role) => {
    expect(roleOf(makeSession(scope))).toBe(role)
  })
})

describe('formatting', () => {
  it('uses GBP and en-GB conventions', () => {
    expect(formatGBP(20434356.35)).toBe('£20,434,356')
    expect(formatGBP(510.97, true)).toBe('£510.97')
    expect(formatNumber(1007826)).toBe('1,007,826')
    expect(formatPercent(0.8501)).toBe('85%')
    expect(formatMonth('2010-11')).toBe('Nov 2010')
    expect(formatDateTime('2010-10-31 14:20:00')).toBe('31 Oct 2010, 14:20')
  })

  it('parses the WSO2 throttle time', () => {
    expect(parseNextAccessTime('2026-Oct-28 10:23:00+0000 UTC')?.toISOString()).toBe('2026-10-28T10:23:00.000Z')
    expect(parseNextAccessTime('garbage')).toBeUndefined()
  })
})
