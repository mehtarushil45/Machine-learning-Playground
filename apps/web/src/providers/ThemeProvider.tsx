import { useEffect, useState } from 'react'
import { ThemeContext, type ThemeMode } from './ThemeContext'

export type { ThemeMode }

const STORAGE_KEY = 'apex_theme'

export interface ThemeProviderProps {
  children: React.ReactNode
  defaultTheme?: ThemeMode
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        return JSON.parse(saved) as ThemeMode
      }
    } catch {
      // Fallback if localStorage access fails
    }
    return defaultTheme
  })

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark')

  useEffect(() => {
    const root = document.documentElement

    const applyTheme = (targetTheme: ThemeMode) => {
      const isDark =
        targetTheme === 'system'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
          : targetTheme === 'dark'

      if (isDark) {
        root.classList.add('dark')
        setResolvedTheme('dark')
      } else {
        root.classList.remove('dark')
        setResolvedTheme('light')
      }
    }

    applyTheme(theme)

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handleChange = () => applyTheme('system')
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }
  }, [theme])

  const setTheme = (newTheme: ThemeMode) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newTheme))
    } catch {
      // Ignore storage errors
    }
    setThemeState(newTheme)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
