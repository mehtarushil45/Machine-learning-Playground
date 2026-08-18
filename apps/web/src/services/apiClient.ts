/**
 * Centralized Enterprise TypeScript API Client.
 *
 * Features:
 *   - Base URL configuration & path normalization
 *   - Auth token injection (Bearer headers & httpOnly cookies)
 *   - Request timeout with AbortController (default 15s)
 *   - Automatic token refresh queue on HTTP 401 Unauthorized
 *   - Error hierarchy (ApiError, AuthExpiredError, ApiTimeoutError)
 *   - Convenience HTTP methods (get, post, put, patch, delete, upload)
 */

export interface ApiClientConfig {
  baseUrl?: string
  timeoutMs?: number
  getAuthToken?: () => string | null
  setAuthToken?: (token: string | null) => void
  onAuthError?: (error: AuthExpiredError) => void
  refreshTokenEndpoint?: string
}

export interface RequestOptions extends RequestInit {
  timeoutMs?: number
  skipAuth?: boolean
  skipRefresh?: boolean
  params?: Record<string, string | number | boolean | undefined | null>
}

export class ApiError extends Error {
  readonly status: number
  readonly detail: string
  readonly data?: unknown

  constructor(status: number, detail: string, data?: unknown) {
    super(`API Error [${status}]: ${detail}`)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.data = data
  }
}

export class AuthExpiredError extends ApiError {
  constructor(detail = 'Session expired. Please log in again.') {
    super(401, detail)
    this.name = 'AuthExpiredError'
  }
}

export class ApiTimeoutError extends ApiError {
  constructor(timeoutMs: number) {
    super(408, `Request timed out after ${timeoutMs}ms.`)
    this.name = 'ApiTimeoutError'
  }
}

export class ApiClient {
  private baseUrl: string
  private defaultTimeoutMs: number
  private getAuthToken?: () => string | null
  private setAuthToken?: (token: string | null) => void
  private onAuthError?: (error: AuthExpiredError) => void
  private refreshTokenEndpoint: string

  private isRefreshing = false
  private refreshSubscribers: Array<(token: string | null) => void> = []

  constructor(config: ApiClientConfig = {}) {
    const rawBaseUrl =
      config.baseUrl ||
      (import.meta.env.VITE_API_BASE_URL as string) ||
      'http://localhost:8000/api/v1'

    this.baseUrl = rawBaseUrl.endsWith('/') ? rawBaseUrl.slice(0, -1) : rawBaseUrl
    this.defaultTimeoutMs = config.timeoutMs ?? 15000
    this.getAuthToken =
      config.getAuthToken ||
      (() => (typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null))
    this.setAuthToken =
      config.setAuthToken ||
      ((token) => {
        if (typeof localStorage !== 'undefined') {
          if (token) localStorage.setItem('access_token', token)
          else localStorage.removeItem('access_token')
        }
      })
    this.onAuthError = config.onAuthError
    this.refreshTokenEndpoint = config.refreshTokenEndpoint ?? '/auth/refresh'
  }

  public configure(config: Partial<ApiClientConfig>): void {
    if (config.baseUrl !== undefined) {
      this.baseUrl = config.baseUrl.endsWith('/') ? config.baseUrl.slice(0, -1) : config.baseUrl
    }
    if (config.timeoutMs !== undefined) this.defaultTimeoutMs = config.timeoutMs
    if (config.getAuthToken !== undefined) this.getAuthToken = config.getAuthToken
    if (config.setAuthToken !== undefined) this.setAuthToken = config.setAuthToken
    if (config.onAuthError !== undefined) this.onAuthError = config.onAuthError
    if (config.refreshTokenEndpoint !== undefined)
      this.refreshTokenEndpoint = config.refreshTokenEndpoint
  }

  public async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const {
      timeoutMs = this.defaultTimeoutMs,
      skipAuth = false,
      skipRefresh = false,
      params,
      headers: customHeaders,
      signal: userSignal,
      ...fetchInit
    } = options

    let url = this.buildUrl(endpoint)
    if (params) {
      const query = new URLSearchParams()
      for (const [key, val] of Object.entries(params)) {
        if (val !== undefined && val !== null) {
          query.append(key, String(val))
        }
      }
      const queryString = query.toString()
      if (queryString) {
        url += (url.includes('?') ? '&' : '?') + queryString
      }
    }

    const headers: Record<string, string> = {
      ...(fetchInit.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(customHeaders as Record<string, string>),
    }

    if (!skipAuth) {
      const token = this.getAuthToken?.()
      if (token && !headers['Authorization']) {
        headers['Authorization'] = `Bearer ${token}`
      }
    }

    const controller = new AbortController()
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    }

    if (userSignal) {
      if (userSignal.aborted) {
        controller.abort()
      } else {
        userSignal.addEventListener('abort', () => controller.abort())
      }
    }

    try {
      const response = await fetch(url, {
        ...fetchInit,
        headers,
        signal: controller.signal,
        credentials: 'include',
      })

      if (timeoutId) clearTimeout(timeoutId)

      if (response.status === 401) {
        if (!skipRefresh && !endpoint.includes(this.refreshTokenEndpoint)) {
          return await this.handleTokenRefreshAndRetry<T>(endpoint, options)
        }
        let detail = 'Session expired. Please log in again.'
        try {
          const errData = await response.json()
          detail = errData.detail ?? detail
        } catch {
          // ignore body parsing error on non-JSON 401 responses
        }

        const authErr = new AuthExpiredError(detail)
        this.onAuthError?.(authErr)
        throw authErr
      }

      if (!response.ok) {
        let errorDetail = response.statusText
        let errData: unknown
        try {
          errData = await response.json()
          errorDetail = (errData as { detail?: string })?.detail || JSON.stringify(errData)
        } catch {
          // ignore body parsing error on non-JSON error responses
        }
        throw new ApiError(response.status, errorDetail, errData)
      }

      if (response.status === 204) {
        return undefined as unknown as T
      }

      return (await response.json()) as T
    } catch (err: unknown) {
      if (timeoutId) clearTimeout(timeoutId)

      if (err instanceof ApiError) {
        throw err
      }

      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new ApiTimeoutError(timeoutMs)
      }

      if (err instanceof Error) {
        throw new ApiError(500, err.message)
      }

      throw new ApiError(500, 'An unexpected network error occurred.')
    }
  }

  private async handleTokenRefreshAndRetry<T>(
    endpoint: string,
    options: RequestOptions,
  ): Promise<T> {
    if (this.isRefreshing) {
      return new Promise<T>((resolve, reject) => {
        this.refreshSubscribers.push((newToken) => {
          if (newToken === null) {
            reject(new AuthExpiredError())
          } else {
            resolve(this.request<T>(endpoint, { ...options, skipRefresh: true }))
          }
        })
      })
    }

    this.isRefreshing = true

    try {
      const refreshUrl = this.buildUrl(this.refreshTokenEndpoint)
      const storedRefreshToken =
        typeof localStorage !== 'undefined' ? localStorage.getItem('refresh_token') : null

      const res = await fetch(refreshUrl, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: storedRefreshToken
          ? JSON.stringify({ refresh_token: storedRefreshToken })
          : undefined,
      })

      if (!res.ok) {
        throw new AuthExpiredError('Refresh token expired.')
      }

      const data = await res.json().catch(() => ({}))
      const newToken = data.access_token || null
      if (newToken && this.setAuthToken) {
        this.setAuthToken(newToken)
      }
      if (data.refresh_token && typeof localStorage !== 'undefined') {
        localStorage.setItem('refresh_token', data.refresh_token)
      }

      this.notifyRefreshSubscribers(newToken)
      return await this.request<T>(endpoint, { ...options, skipRefresh: true })
    } catch (err) {
      this.notifyRefreshSubscribers(null)
      const authErr =
        err instanceof AuthExpiredError ? err : new AuthExpiredError('Token refresh failed.')
      this.onAuthError?.(authErr)
      throw authErr
    } finally {
      this.isRefreshing = false
      this.refreshSubscribers = []
    }
  }

  private notifyRefreshSubscribers(token: string | null): void {
    for (const callback of this.refreshSubscribers) {
      callback(token)
    }
  }

  private buildUrl(endpoint: string): string {
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      return endpoint
    }
    let cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
    if (this.baseUrl.endsWith('/api/v1') && cleanEndpoint.startsWith('/api/v1/')) {
      cleanEndpoint = cleanEndpoint.slice('/api/v1'.length)
    }
    return `${this.baseUrl}${cleanEndpoint}`
  }

  public get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' })
  }

  public post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    })
  }

  public put<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body),
    })
  }

  public patch<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body instanceof FormData ? body : JSON.stringify(body),
    })
  }

  public delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' })
  }

  public upload<T>(endpoint: string, formData: FormData, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: formData,
    })
  }
}

export const apiClient = new ApiClient()
