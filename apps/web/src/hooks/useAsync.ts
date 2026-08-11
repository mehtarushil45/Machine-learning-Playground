import { useState, useEffect, useCallback, useRef } from 'react'

export interface UseAsyncState<T> {
  data: T | null
  isLoading: boolean
  error: Error | null
  execute: (...args: any[]) => Promise<T | undefined>
  reset: () => void
}

/**
 * Custom React Hook for executing asynchronous tasks with AbortController memory leak protection.
 *
 * Features:
 * - Tracks `data`, `isLoading`, and `error` states.
 * - Automatically instantiates an `AbortController` and passes `signal` to the async function.
 * - Aborts any in-flight requests when re-executed or when the component unmounts.
 * - Ignores `AbortError` / `CanceledError` when state updates occur on unmounted components.
 */
export function useAsync<T>(
  asyncFunction: (signal: AbortSignal, ...args: any[]) => Promise<T>,
  immediate: boolean = true
): UseAsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(immediate)
  const [error, setError] = useState<Error | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef<boolean>(true)

  const execute = useCallback(
    async (...args: any[]): Promise<T | undefined> => {
      // Abort previous in-flight request if running
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      const controller = new AbortController()
      abortControllerRef.current = controller

      if (isMountedRef.current) {
        setIsLoading(true)
        setError(null)
      }

      try {
        const result = await asyncFunction(controller.signal, ...args)
        if (isMountedRef.current && !controller.signal.aborted) {
          setData(result)
          setIsLoading(false)
        }
        return result
      } catch (err: unknown) {
        if (isMountedRef.current && !controller.signal.aborted) {
          const catchedError = err instanceof Error ? err : new Error(String(err))
          if (catchedError.name !== 'AbortError' && catchedError.name !== 'CanceledError') {
            setError(catchedError)
          }
          setIsLoading(false)
        }
        return undefined
      }
    },
    [asyncFunction]
  )

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setData(null)
    setIsLoading(false)
    setError(null)
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    if (immediate) {
      execute()
    }
    return () => {
      isMountedRef.current = false
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [immediate, execute])

  return {
    data,
    isLoading,
    error,
    execute,
    reset,
  }
}
