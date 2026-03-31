import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

type Theme = 'light' | 'dark'
interface ThemeCtx { theme: Theme; toggle: () => void }

const ThemeContext = createContext<ThemeCtx>({ theme: 'light', toggle: () => {} })

// Rotas onde o dark mode deve ser ativado no <html>
const APP_ROUTES = ['/app']

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('theme') as Theme) ?? 'light'
  })

  const location = useLocation()

  useEffect(() => {
    // Só aplica dark class se estiver em rota do app (não em landing/login/register)
    const isAppRoute = APP_ROUTES.some(r => location.pathname.startsWith(r))
    if (isAppRoute && theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme, location.pathname])

  const toggle = () => {
    setTheme(t => {
      const next = t === 'light' ? 'dark' : 'light'
      localStorage.setItem('theme', next)
      return next
    })
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
