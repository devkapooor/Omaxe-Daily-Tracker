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
      <div className="fixed left-0 top-0 z-50 flex w-full items-center justify-between border-b border-border/70 bg-card/92 px-3 py-2 shadow-sm backdrop-blur xl:hidden">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">Workspace</p>
          <p className="truncate text-[15px] font-bold text-foreground">{pageTitle(activePage)}</p>
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
          'fixed left-0 top-0 z-50 flex h-full w-[min(80vw,272px)] flex-col border-r border-border/80 bg-card/96 shadow-[24px_0_48px_rgba(0,0,0,0.34)] backdrop-blur-xl transition-transform duration-300 xl:hidden',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="border-b border-border/70 px-3 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8.5 w-8.5 place-items-center rounded-xl bg-linear-to-b from-[#f0b44d] to-[#b97a1f] font-black text-[12px] text-[#22170b] shadow-lg shadow-amber-900/30">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">AlphaHub</p>
              <p className="truncate text-[15px] font-bold text-foreground">{currentUser.name}</p>
              <p className="text-xs font-medium text-muted-foreground">{roleLabel[currentUser.role]}</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-2">
          <ul className="grid gap-1.5">
            {desktopMenuItems.map((item) => {
              const isActive = item.page === activePage
              return (
                <li key={item.label}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-2 rounded-xl px-2.75 py-1.75 text-left text-[13px] font-semibold transition-colors',
                      isActive ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/65 hover:text-foreground',
                    )}
                    onClick={() => handleSelect(item)}
                  >
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border/70 bg-background/70">
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
          'hidden xl:flex xl:h-full xl:flex-col xl:border-r xl:border-border/80 xl:bg-card/90 xl:backdrop-blur-xl',
          isDesktopCollapsed ? 'xl:w-[64px]' : 'xl:w-[176px]',
        )}
      >
        <div className={cn('border-b border-border/70 px-2 py-2', isDesktopCollapsed ? 'flex justify-center' : 'space-y-1.5')}>
          <div className={cn('flex items-center', isDesktopCollapsed ? 'justify-center' : 'justify-between gap-2')}>
            <Button
              variant="outline"
              size="icon"
              className="rounded-xl border-border/80 bg-card/95 shadow-sm backdrop-blur"
              onClick={() => setIsDesktopCollapsed((current) => !current)}
              aria-label={isDesktopCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={isDesktopCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <Menu className="size-4" />
            </Button>
            {!isDesktopCollapsed ? <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">Navigation</p> : null}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-2">
          <ul className="grid gap-1.5">
            {desktopMenuItems.map((item) => {
              const isActive = item.page === activePage
              return (
                <li key={item.label}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center rounded-xl px-1.75 py-1.5 text-left text-[12px] font-semibold transition-colors',
                      isActive ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/65 hover:text-foreground',
                      isDesktopCollapsed ? 'justify-center gap-0' : 'gap-2.25',
                    )}
                    title={isDesktopCollapsed ? item.label : undefined}
                    onClick={() => handleSelect(item)}
                  >
                    <span className="inline-flex h-6.5 w-6.5 flex-none items-center justify-center rounded-lg border border-border/70 bg-background/70">
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
          <div className="border-t border-border/70 px-2 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="grid h-8.5 w-8.5 place-items-center rounded-xl bg-linear-to-b from-[#f0b44d] to-[#b97a1f] font-black text-[12px] text-[#22170b] shadow-lg shadow-amber-900/30">
                {initials}
              </span>
              {logoutItem ? (
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-xl px-2.25 py-1.75 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-secondary/65 hover:text-foreground"
                  onClick={() => handleSelect(logoutItem)}
                >
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border/70 bg-background/70">
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

