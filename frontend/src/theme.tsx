import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'dataguard.theme' // only a display setting, never tokens

function initialTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'light', toggle: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark'
      document.documentElement.classList.toggle('dark', next === 'dark')
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // Storage can be blocked (private mode). The toggle still works, it just won't be remembered.
      }
      return next
    })
  }, [])
  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
