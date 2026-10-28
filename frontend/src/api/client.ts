/**
 * Every data call goes to the WSO2 gateway with the user's access token.
 * The gateway decides: 401 (no/invalid token), 403 (missing scope),
 * 429 (rate limit). Those responses are turned into ApiError so pages can
 * show what WSO2 actually said.
 */

import { config } from '../config'

export type ApiErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'not_found'
  | 'bad_request'
  | 'server'
  | 'network'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number
  /** WSO2 error code (e.g. 900910 for a scope failure, 900803 for throttling) or backend code. */
  readonly code?: string
  readonly detail?: string
  /** When the gateway will accept requests again (429 only). */
  readonly retryAt?: Date

  constructor(init: {
    kind: ApiErrorKind
    status: number
    message: string
    code?: string
    detail?: string
    retryAt?: Date
  }) {
    super(init.message)
    this.name = 'ApiError'
    this.kind = init.kind
    this.status = init.status
    this.code = init.code
    this.detail = init.detail
    this.retryAt = init.retryAt
  }
}

const KIND_BY_STATUS: Record<number, ApiErrorKind> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  429: 'rate_limited',
}

interface GatewayErrorBody {
  code?: string | number
  message?: string
  description?: string
  nextAccessTime?: string
  error?: { code?: string; message?: string }
}

/** WSO2 writes times like "2026-Oct-28 10:23:00+0000 UTC". */
export function parseNextAccessTime(value?: string): Date | undefined {
  const match = value?.match(/^(\d{4})-(\w{3})-(\d{2}) (\d{2}:\d{2}:\d{2})/)
  if (!match) return undefined
  const date = new Date(`${match[3]} ${match[2]} ${match[1]} ${match[4]} UTC`)
  return Number.isNaN(date.getTime()) ? undefined : date
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: GatewayErrorBody = {}
  try {
    body = (await response.json()) as GatewayErrorBody
  } catch {
    // Non-JSON error body; fall back to the status code alone.
  }
  const status = response.status
  const kind = KIND_BY_STATUS[status] ?? (status >= 500 ? 'server' : 'bad_request')
  return new ApiError({
    kind,
    status,
    message: body.error?.message ?? body.message ?? response.statusText ?? `HTTP ${status}`,
    code: body.error?.code ?? (body.code === undefined ? undefined : String(body.code)),
    detail: body.description,
    retryAt: status === 429 ? parseNextAccessTime(body.nextAccessTime) : undefined,
  })
}

export type Query = Record<string, string | number | undefined | null>

export async function apiGet<T>(path: string, token: string, query: Query = {}, signal?: AbortSignal): Promise<T> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const url = `${config.apiUrl}${path}${params.size ? `?${params}` : ''}`
  let response: Response
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError({
      kind: 'network',
      status: 0,
      message: 'Could not reach the WSO2 gateway.',
    })
  }
  if (!response.ok) throw await toApiError(response)
  return (await response.json()) as T
}
