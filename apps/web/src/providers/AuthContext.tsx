/**
 * AuthContext — cookie-based authentication state for the ML Platform.
 *
 * Architecture
 * ------------
 * Tokens live in httpOnly cookies set by the server — JavaScript never reads
 * them directly.  The browser sends them automatically on every same-origin
 * fetch with `credentials: "include"`.
 *
 * The AuthContext stores only the *public* user profile (id, email, role) in
 * React state.  On mount it calls GET /auth/me; if the cookie is valid the
 * server returns the profile, otherwise we treat the user as logged-out.
 *
 * Session persistence across page reloads
 * ----------------------------------------
 * The session is persistent as long as the httpOnly cookie is alive.  On each
 * page load, `useEffect` calls `restoreSession()` which hits /auth/me.  The
 * cookie is sent automatically — no localStorage, no sessionStorage.
 *
 * Usage
 * -----
 *   import { useAuth } from '../providers/AuthContext'
 *
 *   const { user, login, logout, isAuthenticated, isLoading } = useAuth()
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string
  email: string
  full_name: string | null
  role: string
  organisation_id: string
  is_active: boolean
}

export interface LoginCredentials {
  username: string  // FastAPI OAuth2PasswordRequestForm uses "username"
  password: string
}

interface AuthContextValue {
  /** The authenticated user, or null when logged out / loading. */
  user: AuthUser | null
  /** True while the initial session check is in-flight. */
  isLoading: boolean
  /** True when a user is authenticated. */
  isAuthenticated: boolean
  /** Login with email + password. Throws on failure. */
  login: (credentials: LoginCredentials) => Promise<void>
  /** Logout — clears cookies server-side and resets state. */
  logout: () => Promise<void>
  /** Logout from ALL devices — bulk session revocation. */
  logoutAll: () => Promise<void>
  /** Manually refresh the auth state (e.g. after profile update). */
  refreshUser: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | null>(null)

// ---------------------------------------------------------------------------
// API helpers (cookie-aware)
// ---------------------------------------------------------------------------

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1'

/**
 * Fetch wrapper that always includes credentials (cookies).
 * All auth endpoints use this helper.
 */
async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',    // ← send & receive httpOnly cookies
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string>),
    },
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
      const res = await authFetch('/auth/me')
      if (res.ok) {
        const profile: AuthUser = await res.json()
        setUser(profile)
      } else {
        setUser(null)
      }
    } catch {
      // Network error or server down — treat as logged-out
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
  const login = useCallback(async (credentials: LoginCredentials) => {
    // FastAPI's OAuth2PasswordRequestForm requires application/x-www-form-urlencoded
    const body = new URLSearchParams({
      username: credentials.username,
      password: credentials.password,
    })

    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      credentials: 'include',                             // ← receive Set-Cookie
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail ?? `Login failed (${res.status})`)
    }

    // Cookies are now set by the server.  Fetch profile separately.
    const profileRes = await authFetch('/auth/me')
    if (profileRes.ok) {
      setUser(await profileRes.json())
    }
  }, [])

  // ── Logout ──────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await authFetch('/auth/logout', { method: 'POST' })
    } catch {
      // Server unavailable — still clear local state
    } finally {
      setUser(null)
    }
  }, [])

  // ── Logout all ──────────────────────────────────────────────────────────
  const logoutAll = useCallback(async () => {
    try {
      await authFetch('/auth/logout-all', { method: 'POST' })
    } catch {
      // Server unavailable — still clear local state
    } finally {
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
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>')
  }
  return ctx
}
