import { useEffect, useState, type ComponentType } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth, useSession } from '../auth/AuthContext'
import { roleOf } from '../auth/session'
import { useTheme } from '../theme'
import { CloseIcon, GlobeIcon, MenuIcon, MoonIcon, OverviewIcon, ProductsIcon, ShieldIcon, SignOutIcon, SunIcon, UserIcon } from './icons'
import { Logo } from './Logo'

const NAV: { to: string; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { to: '/overview', label: 'Overview', icon: OverviewIcon },
  { to: '/products', label: 'Products', icon: ProductsIcon },
  { to: '/countries', label: 'Countries', icon: GlobeIcon },
  { to: '/customers', label: 'Customers', icon: UserIcon },
  { to: '/access', label: 'Access & Security', icon: ShieldIcon },
]

export const ROLE_LABEL = { manager: 'Manager', analyst: 'Analyst', none: 'No data access' } as const

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  return (
    <button
      type="button"
      onClick={toggle}
      className="btn-secondary px-2.5"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <ul className="space-y-1">
      {NAV.map(({ to, label, icon: Icon }) => (
        <li key={to}>
          <NavLink
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-control px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? 'bg-brand-soft text-brand-ink' : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
              }`
            }
          >
            <Icon />
            {label}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}

function UserPanel() {
  const session = useSession()
  const { signOut } = useAuth()
  const role = roleOf(session)
  return (
    <div className="rounded-card border border-border bg-surface-muted/60 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Signed in</p>
      <p className="mt-1 truncate text-sm font-semibold text-ink" title={session.username ?? session.subject}>
        {session.username ?? `User ${session.subject.slice(0, 8)}`}
      </p>
      <p className="text-sm text-ink-muted">Role: {ROLE_LABEL[role]}</p>
      <button type="button" onClick={signOut} className="btn-secondary mt-3 w-full">
        <SignOutIcon className="h-4 w-4" />
        Sign out
      </button>
    </div>
  )
}

function PoweredBy() {
  return <p className="text-xs text-ink-subtle">Powered by WSO2 API Manager</p>
}

export function Layout() {
  const [menuOpen, setMenuOpen] = useState(false)

  // Links close the mobile menu themselves; Escape closes it too.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <div className="min-h-screen lg:flex">
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-brand px-4 py-2 text-brand-on focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="hidden w-sidebar shrink-0 flex-col border-r border-border bg-surface px-4 py-5 lg:fixed lg:inset-y-0 lg:flex">
        <div className="px-2">
          <Logo />
        </div>
        <nav aria-label="Main" className="mt-8 flex-1">
          <Navigation />
        </nav>
        <div className="space-y-3">
          <UserPanel />
          <div className="flex items-center justify-between px-1">
            <PoweredBy />
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Mobile header + menu */}
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Logo />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              className="btn-secondary px-2.5"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <div id="mobile-menu" className="space-y-4 border-t border-border px-4 pb-4 pt-3">
            <nav aria-label="Main">
              <Navigation onNavigate={() => setMenuOpen(false)} />
            </nav>
            <UserPanel />
            <PoweredBy />
          </div>
        )}
      </header>

      <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:ml-sidebar lg:px-10 lg:py-8">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
