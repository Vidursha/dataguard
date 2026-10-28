import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ApiError } from './client'

export type ApiState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: ApiError }

/**
 * Calls the gateway with the user's token and keeps track of loading, success
 * and error. `load` gets the access token and an AbortSignal. Pass `null` to do
 * nothing yet. A 401 from the gateway means the token doesn't work any more, so
 * the session is cleared and the user is sent back to sign in.
 */
export function useApi<T>(
  load: ((token: string, signal: AbortSignal) => Promise<T>) | null,
  deps: readonly unknown[],
): ApiState<T> & { reload: () => void } {
  const { session, expire } = useAuth()
  const [state, setState] = useState<ApiState<T>>(load ? { status: 'loading' } : { status: 'idle' })
  const [attempt, setAttempt] = useState(0)
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    const run = loadRef.current
    if (!run || !session) {
      setState({ status: 'idle' })
      return
    }
    const controller = new AbortController()
    setState({ status: 'loading' })
    run(session.accessToken, controller.signal)
      .then((data) => setState({ status: 'success', data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const apiError =
          error instanceof ApiError
            ? error
            : new ApiError({ kind: 'server', status: 0, message: 'Something unexpected went wrong.' })
        if (apiError.kind === 'unauthorized') expire()
        setState({ status: 'error', error: apiError })
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callers list the inputs that matter
  }, [session?.accessToken, attempt, ...deps])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  return { ...state, reload }
}
