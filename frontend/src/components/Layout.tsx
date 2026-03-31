import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import toast from 'react-hot-toast'
import {
  LayoutDashboard, ArrowLeftRight, BarChart3,
  Bell, User, LogOut, MessageCircle, Menu, X, Sun, Moon, Clock
} from 'lucide-react'
import { useState, useEffect } from 'react'

const navItems = [
  { to: '/app/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/app/transactions', icon: ArrowLeftRight,  label: 'Transações' },
  { to: '/app/reports',      icon: BarChart3,       label: 'Relatórios' },
  { to: '/app/reminders',    icon: Bell,            label: 'Agenda' },
  { to: '/app/profile',      icon: User,            label: 'Perfil' },
]

function TrialBanner({ trialEndsAt }: { trialEndsAt?: string | null }) {
  const [timeLeft, setTimeLeft] = useState('')
  const [urgent, setUrgent] = useState(false)

  useEffect(() => {
    if (!trialEndsAt) return
    const calc = () => {
      const diff = new Date(trialEndsAt).getTime() - Date.now()
      if (diff <= 0) { setTimeLeft('Expirado'); return }
      const d = Math.floor(diff / 86400000)
      const h = Math.floor((diff % 86400000) / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      setUrgent(d < 2)
      setTimeLeft(d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`)
    }
    calc()
    const id = setInterval(calc, 30000)
    return () => clearInterval(id)
  }, [trialEndsAt])

  if (!trialEndsAt) return null

  return (
    <div className={`flex items-center justify-center gap-2 px-4 py-2 text-xs border-b shrink-0 ${
      urgent
        ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
        : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
    }`}>
      <Clock size={13} />
      <span>
        Período trial —{' '}
        <strong>{timeLeft || '...'}</strong> restantes.{' '}
        <NavLink to="/profile" className="underline font-semibold">Ativar plano</NavLink>
      </span>
    </div>
  )
}

export default function Layout() {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null)
  const [trialLoaded, setTrialLoaded] = useState(false)

  useEffect(() => {
    import('../api/client').then(({ default: api }) => {
      api.get('/profile')
        .then(r => {
          setTrialEndsAt(r.data.trial_ends_at ?? null)
        })
        .catch(() => {})
        .finally(() => setTrialLoaded(true))
    })
  }, [])

  const handleLogout = async () => {
    await logout()
    toast.success('Até logo!')
    navigate('/')
  }

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="p-6 border-b border-gray-100 dark:border-gray-700 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center shrink-0">
            <MessageCircle size={18} className="text-white" />
          </div>
          <span className="font-bold text-gray-900 dark:text-white text-lg">FinanceBot</span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Assistente Financeiro</p>
      </div>

      {/* Nav — flex-1 para empurrar o resto para baixo */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Theme toggle */}
      <div className="px-4 shrink-0">
        <button
          onClick={toggle}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
        </button>
      </div>

      {/* User + Logout */}
      <div className="p-4 border-t border-gray-100 dark:border-gray-700 shrink-0">
        <div className="flex items-center gap-3 mb-3 px-3">
          <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center text-brand-700 dark:text-brand-300 font-bold text-sm shrink-0">
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user?.name}</p>
            <span className={`text-xs ${
              user?.subscriptionStatus === 'active'   ? 'text-green-600 dark:text-green-400' :
              user?.subscriptionStatus === 'trialing' ? 'text-blue-600 dark:text-blue-400'  :
                                                         'text-red-600'
            }`}>
              {user?.subscriptionStatus === 'trialing' ? 'Trial gratuito' :
               user?.subscriptionStatus === 'active'   ? 'Plano ativo' : 'Inativo'}
            </span>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors"
        >
          <LogOut size={18} />
          Sair
        </button>
      </div>
    </>
  )

  return (
    /* Toda a página ocupa exatamente 100vh, sem scroll externo */
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">

      {/* Trial banner (shrink-0 para não compressão) */}
      {trialLoaded && user?.subscriptionStatus === 'trialing' && trialEndsAt && (
        <TrialBanner trialEndsAt={trialEndsAt} />
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* ── Desktop Sidebar (fixa, sem scroll externo) ───────────────── */}
        <aside className="hidden md:flex flex-col w-64 bg-white dark:bg-gray-800 border-r border-gray-100 dark:border-gray-700 h-full shrink-0">
          <SidebarContent />
        </aside>

        {/* ── Mobile overlay ─────────────────────────────────────────────── */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
            <div className="absolute left-0 top-0 bottom-0 w-72 bg-white dark:bg-gray-800 shadow-xl z-50 flex flex-col">
              <div className="flex justify-end p-3 shrink-0">
                <button onClick={() => setSidebarOpen(false)} className="text-gray-500 dark:text-gray-400 p-1">
                  <X size={20} />
                </button>
              </div>
              <SidebarContent />
            </div>
          </div>
        )}

        {/* ── Conteúdo principal (scroll apenas aqui) ─────────────────── */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Mobile header */}
          <header className="md:hidden flex items-center gap-4 px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 shrink-0">
            <button onClick={() => setSidebarOpen(true)} className="text-gray-600 dark:text-gray-400">
              <Menu size={22} />
            </button>
            <span className="font-semibold text-gray-900 dark:text-white">FinanceBot</span>
          </header>

          {/* Área scrollável */}
          <div className="flex-1 overflow-y-auto p-4 md:p-8">
            <Outlet />
          </div>
        </main>

      </div>
    </div>
  )
}
