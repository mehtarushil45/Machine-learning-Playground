/**
 * AuthContext — cookie-based authentication state for the ML Platform.
 *
 * Architecture
 * ------------
 * Tokens live in httpOnly cookies set by the server — JavaScript never stores
 * them in localStorage or sessionStorage (Part C1 XSS protection).
 *
 * Access tokens are stored strictly in JS memory via apiClient's in-memory store.
 * The browser sends the httpOnly refresh cookie automatically on every same-origin
 * fetch with `credentials: "include"`.
 *
 * Session persistence across page reloads
 * ----------------------------------------
 * The session is persistent as long as the httpOnly cookie is alive. On each
 * page load, `useEffect` calls `restoreSession()` which hits /auth/me.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { getInMemoryAccessToken, setInMemoryAccessToken } from '../services/apiClient'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string
  email: string
  full_name: string | null
  role: string
  organisation_id?: string
  is_active?: boolean
  is_verified?: boolean
}

export interface LoginCredentials {
  username: string // FastAPI OAuth2PasswordRequestForm uses "username"
  password: string
  rememberMe?: boolean
}

export interface AuthContextValue {
  /** The authenticated user, or null when logged out / loading. */
  user: AuthUser | null
  /** True while the initial session check is in-flight. */
  isLoading: boolean
  /** True when a user is authenticated. */
  isAuthenticated: boolean
  /** Login with email + password. Throws on failure. */
  login: (credentials: LoginCredentials, rememberMe?: boolean) => Promise<void>
  /** Login or register with OAuth provider (Google or Microsoft). Throws on failure. */
  loginWithOAuth: (
    provider: 'google' | 'microsoft',
    data: { email: string; full_name?: string; id_token?: string }
  ) => Promise<void>
  /** Request password reset email. Returns success message. */
  forgotPassword: (email: string) => Promise<string>
  /** Reset password using token. Returns success message. */
  resetPassword: (token: string, newPassword: string) => Promise<string>
  /** Resend email verification link. Returns success message. */
  resendVerification: (email: string) => Promise<string>
  /** Logout — clears cookies server-side and resets in-memory state. */
  logout: () => Promise<void>
  /** Logout from ALL devices — bulk session revocation. */
  logoutAll: () => Promise<void>
  /** Manually refresh the auth state (e.g. after profile update). */
  refreshUser: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const AuthContext = createContext<AuthContextValue | null>(null)

// ---------------------------------------------------------------------------
// API helpers (cookie-aware with in-memory token)
// ---------------------------------------------------------------------------

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1'

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getInMemoryAccessToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-ML-Auth': '1',
    'X-Requested-With': 'XMLHttpRequest',
    ...(init.headers as Record<string, string>),
  }
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`
  }

  return fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include', // send & receive httpOnly cookies
    headers,
  })
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const hasRestoredSession = useRef(false)

  // ── Session restore on mount ────────────────────────────────────────────
  const restoreSession = useCallback(async () => {
    try {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
      if (stored && !getInMemoryAccessToken()) {
        setInMemoryAccessToken(stored)
      }
      const res = await authFetch('/auth/me')
      if (res.ok) {
        const profile: AuthUser = await res.json()
        setUser(profile)
        return
      }

      // If /auth/me failed (401), attempt silent refresh once
      if (res.status === 401) {
        const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-ML-Auth': '1',
            'X-Requested-With': 'XMLHttpRequest',
          },
        })
        if (refreshRes.ok) {
          const data = await refreshRes.json().catch(() => ({}))
          if (data.access_token) {
            setInMemoryAccessToken(data.access_token)
          }
          const retryRes = await authFetch('/auth/me')
          if (retryRes.ok) {
            setUser(await retryRes.json())
            return
          }
        }
      }
      setUser(null)
    } catch {
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (hasRestoredSession.current) return
    hasRestoredSession.current = true
    restoreSession()
  }, [restoreSession])

  // ── Login ───────────────────────────────────────────────────────────────
  const login = useCallback(async (credentials: LoginCredentials, rememberMeParam?: boolean) => {
    const shouldRemember = rememberMeParam ?? credentials.rememberMe ?? true
    const body = new URLSearchParams({
      username: credentials.username,
      password: credentials.password,
    })

    const res = await fetch(`${API_BASE}/auth/login?remember_me=${shouldRemember}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-ML-Auth': '1',
        'X-Requested-With': 'XMLHttpRequest',
        'X-Remember-Me': shouldRemember ? '1' : '0',
      },
      body: body.toString(),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      const error = new Error(err.detail ?? `Login failed (${res.status})`)
      ;(error as any).status = res.status
      ;(error as any).headers = res.headers
      throw error
    }

    const data = await res.json().catch(() => ({}))
    if (data.access_token) {
      setInMemoryAccessToken(data.access_token)
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('access_token', data.access_token)
      }
    }
    if (data.refresh_token && typeof localStorage !== 'undefined') {
      localStorage.setItem('refresh_token', data.refresh_token)
    }

    // Fetch updated profile after login
    const profileRes = await authFetch('/auth/me')
    if (profileRes.ok) {
      setUser(await profileRes.json())
    }
  }, [])

  // ── OAuth Login (Google & Microsoft) ────────────────────────────────────
  const loginWithOAuth = useCallback(
    async (
      provider: 'google' | 'microsoft',
      data: { email: string; full_name?: string; id_token?: string }
    ) => {
      const res = await fetch(`${API_BASE}/auth/oauth/${provider}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-ML-Auth': '1',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          email: data.email,
          full_name: data.full_name,
          id_token: data.id_token,
          provider,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? `Authentication with ${provider} failed (${res.status})`)
      }

      const resData = await res.json().catch(() => ({}))
      if (resData.access_token) {
        setInMemoryAccessToken(resData.access_token)
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('access_token', resData.access_token)
        }
      }
      if (resData.refresh_token && typeof localStorage !== 'undefined') {
        localStorage.setItem('refresh_token', resData.refresh_token)
      }

      // Fetch updated profile
      const profileRes = await authFetch('/auth/me')
      if (profileRes.ok) {
        setUser(await profileRes.json())
      }
    },
    []
  )

  // ── Forgot Password ──────────────────────────────────────────────────────
  const forgotPassword = useCallback(async (email: string): Promise<string> => {
    const res = await fetch(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ML-Auth': '1',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.detail ?? `Failed to send reset link (${res.status})`)
    }
    return data.message || 'If an account exists with that email, instructions have been sent.'
  }, [])

  // ── Reset Password ───────────────────────────────────────────────────────
  const resetPassword = useCallback(async (token: string, newPassword: string): Promise<string> => {
    const res = await fetch(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ML-Auth': '1',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ token: token.trim(), new_password: newPassword }),
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.detail ?? `Password reset failed (${res.status})`)
    }
    return data.message || 'Password reset successfully. You can now log in.'
  }, [])

  // ── Resend Verification ──────────────────────────────────────────────────
  const resendVerification = useCallback(async (email: string): Promise<string> => {
    const res = await fetch(`${API_BASE}/auth/resend-verification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ML-Auth': '1',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.detail ?? `Failed to resend verification link (${res.status})`)
    }
    return data.message || 'Verification link sent. Please check your inbox.'
  }, [])

  // ── Logout ──────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await authFetch('/auth/logout', { method: 'POST' })
    } catch {
      // Server unavailable — still clear local in-memory state
    } finally {
      setInMemoryAccessToken(null)
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
      }
      setUser(null)
    }
  }, [])

  // ── Logout all ──────────────────────────────────────────────────────────
  const logoutAll = useCallback(async () => {
    try {
      await authFetch('/auth/logout-all', { method: 'POST' })
    } catch {
      // Server unavailable — still clear local in-memory state
    } finally {
      setInMemoryAccessToken(null)
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
      }
      setUser(null)
    }
  }, [])

  // ── Refresh user profile ─────────────────────────────────────────────────
  const refreshUser = useCallback(async () => {
    const res = await authFetch('/auth/me')
    if (res.ok) {
      setUser(await res.json())
    } else {
      setUser(null)
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: user !== null,
        login,
        loginWithOAuth,
        forgotPassword,
        resetPassword,
        resendVerification,
        logout,
        logoutAll,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

// eslint-disable-next-line react-refresh/only-export-components
export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuthContext must be used inside <AuthProvider>')
  }
  return ctx
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  return useAuthContext()
}

