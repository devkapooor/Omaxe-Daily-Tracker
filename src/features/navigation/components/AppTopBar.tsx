import { useEffect, useMemo, useState } from 'react'
import { Menu } from 'lucide-react'
import type { AppUser } from '@/domain/financeTypes'
import type { Page } from '@/domain/appTypes'
import { buildMenu, pageTitle } from '@/features/navigation/config/menuConfig'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/utils'

type AppTopBarProps = {
  currentUser: AppUser
  activePage: Page
  onPageChange: (page: Page) => void
  onLogout: () => void
}

function userInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'U'
  )
}

const roleLabel: Record<AppUser['role'], string> = {
  owner: 'Owner',
  manager: 'Manager',
  billing: 'Billing',
}

export function AppTopBar({ currentUser, activePage, onPageChange, onLogout }: AppTopBarProps) {
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const menuItems = useMemo(() => buildMenu(currentUser), [currentUser])
  const desktopMenuItems = useMemo(() => menuItems.filter((item) => item.action !== 'logout'), [menuItems])
  const logoutItem = useMemo(() => menuItems.find((item) => item.action === 'logout'), [menuItems])
  const initials = userInitials(currentUser.name)

  useEffect(() => {
    document.body.style.overflow = isMobileOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [isMobileOpen])

  function handleSelect(action: (typeof menuItems)[number]) {
    if (action.action === 'logout') {
      setIsMobileOpen(false)
      onLogout()
      return
    }
    if (!action.page) return
    setIsMobileOpen(false)
    onPageChange(action.page)
  }

  return (
    <>
      <div className="fixed left-0 top-0 z-50 flex w-full items-center justify-between border-b border-border/70 bg-white/92 px-3.5 py-2.5 shadow-sm backdrop-blur xl:hidden">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">Workspace</p>
          <p className="truncate text-base font-bold text-foreground">{pageTitle(activePage)}</p>
        </div>
        <Button variant="outline" size="icon" className="rounded-xl" onClick={() => setIsMobileOpen((current) => !current)}>
          <Menu className="size-4" />
        </Button>
      </div>

      <div
        className={cn(
          'fixed inset-0 z-40 bg-slate-950/35 transition-opacity xl:hidden',
          isMobileOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => setIsMobileOpen(false)}
      />

      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-full w-[min(82vw,296px)] flex-col border-r border-border/80 bg-white/96 shadow-[24px_0_48px_rgba(19,26,20,0.16)] backdrop-blur-xl transition-transform duration-300 xl:hidden',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="border-b border-border/70 px-3.5 py-3.5">
          <div className="flex items-center gap-2.25">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-linear-to-b from-emerald-400 to-emerald-600 font-black text-[13px] text-emerald-950 shadow-lg shadow-emerald-500/20">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">AlphaHub</p>
              <p className="truncate text-[15px] font-bold text-foreground">{currentUser.name}</p>
              <p className="text-xs font-medium text-muted-foreground">{roleLabel[currentUser.role]}</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2.5 py-2.5">
          <ul className="grid gap-1.5">
            {desktopMenuItems.map((item) => {
              const isActive = item.page === activePage
              return (
                <li key={item.label}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-2.25 rounded-xl px-3 py-2 text-left text-[13px] font-semibold transition-colors',
                      isActive ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/65 hover:text-foreground',
                    )}
                    onClick={() => handleSelect(item)}
                  >
                    <span className="inline-flex h-7.5 w-7.5 items-center justify-center rounded-lg border border-border/70 bg-white">
                      {item.icon}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
      </aside>

      <aside
        className={cn(
          'hidden xl:flex xl:h-full xl:flex-col xl:border-r xl:border-border/80 xl:bg-white/90 xl:backdrop-blur-xl',
          isDesktopCollapsed ? 'xl:w-[86px]' : 'xl:w-[246px]',
        )}
      >
        <div className={cn('border-b border-border/70 px-2.5 py-2.5', isDesktopCollapsed ? 'flex justify-center' : 'space-y-2')}>
          <div className={cn('flex items-center', isDesktopCollapsed ? 'justify-center' : 'justify-between gap-2')}>
            <Button
              variant="outline"
              size="icon"
              className="rounded-xl border-border/80 bg-white/90 shadow-sm backdrop-blur"
              onClick={() => setIsDesktopCollapsed((current) => !current)}
              aria-label={isDesktopCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={isDesktopCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <Menu className="size-4" />
            </Button>
            {!isDesktopCollapsed ? <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">Navigation</p> : null}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-2.5">
          <ul className="grid gap-1.5">
            {desktopMenuItems.map((item) => {
              const isActive = item.page === activePage
              return (
                <li key={item.label}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center rounded-xl px-2.25 py-2 text-left text-[13px] font-semibold transition-colors',
                      isActive ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/65 hover:text-foreground',
                      isDesktopCollapsed ? 'justify-center gap-0' : 'gap-2.25',
                    )}
                    title={isDesktopCollapsed ? item.label : undefined}
                    onClick={() => handleSelect(item)}
                  >
                    <span className="inline-flex h-7.5 w-7.5 flex-none items-center justify-center rounded-lg border border-border/70 bg-white">
                      {item.icon}
                    </span>
                    {!isDesktopCollapsed ? <span className="truncate">{item.label}</span> : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        {!isDesktopCollapsed ? (
          <div className="border-t border-border/70 px-2.5 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-linear-to-b from-emerald-400 to-emerald-600 font-black text-[13px] text-emerald-950 shadow-lg shadow-emerald-500/20">
                {initials}
              </span>
              {logoutItem ? (
                <button
                  type="button"
                  className="flex items-center gap-2.25 rounded-xl px-2.5 py-2 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-secondary/65 hover:text-foreground"
                  onClick={() => handleSelect(logoutItem)}
                >
                  <span className="inline-flex h-7.5 w-7.5 items-center justify-center rounded-lg border border-border/70 bg-white">
                    {logoutItem.icon}
                  </span>
                  <span>Logout</span>
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </aside>
    </>
  )
}

