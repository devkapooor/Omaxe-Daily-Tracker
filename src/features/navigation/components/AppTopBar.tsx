import { useEffect, useMemo, useState } from 'react'
import { LogOut, Menu, Moon, Sun, X, Zap } from 'lucide-react'
import type { AppUser } from '@/domain/financeTypes'
import type { Page } from '@/domain/appTypes'
import { buildMenu, pageTitle, type NavItem } from '@/features/navigation/config/menuConfig'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/utils'
import { getActiveTheme, saveTheme, subscribeToTheme, type Theme } from '@/shared/lib/theme'

type AppTopBarProps = {
  currentUser: AppUser
  activePage: Page
  pendingApprovalCount: number
  cashoutAllowed: boolean
  onPageChange: (page: Page) => void
  onLogout: () => void
}

type NavigationGroup = 'Core Engine' | 'Ledger & Cash Flow' | 'Governance & Audit'

const roleLabel: Record<AppUser['role'], string> = {
  owner: 'Owner',
  manager: 'Manager',
  billing: 'Billing',
}

function userInitials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'U'
}

function groupFor(item: NavItem): NavigationGroup {
  if (item.page === 'dashboard' || item.page === 'actions' || item.page === 'pos-test' || item.page === 'vendor-preview' || item.page === 'directory') return 'Core Engine'
  if (item.page === 'expense' || item.page === 'cashout' || item.page === 'movement' || item.page === 'payroll') return 'Ledger & Cash Flow'
  return 'Governance & Audit'
}

function PendingBadge({ count, compact = false }: { count: number; compact?: boolean }) {
  if (count <= 0) return null
  return (
    <span
      className={cn(
        'grid min-h-5 min-w-5 place-items-center rounded-sm border border-amber-200 bg-amber-50 px-1.5 text-[10px] font-semibold tabular-nums text-amber-800 dark:border-amber-200/40 dark:bg-amber-200/10 dark:text-amber-200',
        compact && 'absolute -right-2 -top-1.5 min-h-4 min-w-4 px-1 text-[9px]',
      )}
      aria-label={`${count} pending approval${count === 1 ? '' : 's'}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

function NavigationLinks({
  items,
  activePage,
  collapsed,
  pendingApprovalCount,
  onSelect,
}: {
  items: NavItem[]
  activePage: Page
  collapsed: boolean
  pendingApprovalCount: number
  onSelect: (item: NavItem) => void
}) {
  const groups: NavigationGroup[] = ['Core Engine', 'Ledger & Cash Flow', 'Governance & Audit']
  let shortcut = 0

  return (
    <nav aria-label="Main navigation" className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
      <div className="space-y-4">
        {groups.map((group) => {
          const groupItems = items.filter((item) => groupFor(item) === group)
          if (!groupItems.length) return null
          return (
            <section key={group}>
              {!collapsed ? <h2 className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{group}</h2> : null}
              <ul className="space-y-0.5">
                {groupItems.map((item) => {
                  shortcut += 1
                  const currentShortcut = shortcut <= 9 ? `Alt+${shortcut}` : undefined
                  const active = item.page === activePage
                  return (
                    <li key={item.label}>
                      <button
                        type="button"
                        aria-current={active ? 'page' : undefined}
                        title={collapsed ? item.label : undefined}
                        onClick={() => onSelect(item)}
                        className={cn(
                          'group flex h-9 w-full items-center gap-2.5 rounded-sm px-2.5 text-left text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          collapsed && 'justify-center px-0',
                          active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                        )}
                      >
                        <span className="relative grid size-4 shrink-0 place-items-center [&>svg]:size-4">{item.icon}
                          {collapsed && item.page === 'actions' ? <PendingBadge count={pendingApprovalCount} compact /> : null}
                        </span>
                        {!collapsed ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
                        {!collapsed && item.page === 'pos-test' ? <span className={cn('rounded-sm px-1 py-0.5 text-[9px] font-semibold uppercase', active ? 'bg-white/15 text-primary-foreground' : 'bg-amber-50 text-amber-800 dark:bg-amber-200/10 dark:text-amber-200')}>Test</span> : null}
                        {!collapsed && item.page === 'actions' ? <PendingBadge count={pendingApprovalCount} /> : null}
                        {!collapsed && currentShortcut ? <kbd className={cn('ml-auto text-[10px] font-normal text-muted-foreground', active && 'text-primary-foreground/75')}>{currentShortcut}</kbd> : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </nav>
  )
}

export function AppTopBar({ currentUser, activePage, pendingApprovalCount, cashoutAllowed, onPageChange, onLogout }: AppTopBarProps) {
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>(getActiveTheme)
  const menuItems = useMemo(() => buildMenu(currentUser), [currentUser])
  const navigationItems = useMemo(() => menuItems.filter((item) => item.action !== 'logout' && (cashoutAllowed || currentUser.role === 'owner' || item.page !== 'cashout')), [menuItems, cashoutAllowed, currentUser.role])
  const logoutItem = useMemo(() => menuItems.find((item) => item.action === 'logout'), [menuItems])
  const initials = userInitials(currentUser.name)

  useEffect(() => {
    document.body.style.overflow = isMobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isMobileOpen])

  useEffect(() => subscribeToTheme(setTheme), [])

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const isEditing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable
      if (isEditing || !event.altKey || !/^[1-9]$/.test(event.key)) return
      const item = navigationItems[Number(event.key) - 1]
      if (!item?.page) return
      event.preventDefault()
      onPageChange(item.page)
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [navigationItems, onPageChange])

  function handleSelect(item: NavItem) {
    setIsMobileOpen(false)
      if (item.action === 'logout') onLogout()
    else if (item.page) onPageChange(item.page)
  }

  function renderSidebar(mobile = false) {
    const collapsed = !mobile && isDesktopCollapsed
    return (
      <aside className={cn('flex h-full min-h-0 flex-col border-r border-border bg-card text-foreground', mobile && 'w-[min(88vw,320px)] shadow-xl', !mobile && collapsed && 'w-[72px]', !mobile && !collapsed && 'w-[260px]')}>
        <div className={cn('flex h-14 shrink-0 items-center border-b border-border px-4', collapsed ? 'justify-center' : 'justify-between')}>
          {!collapsed ? (
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-sm bg-primary text-primary-foreground"><Zap className="size-4" /></span>
              <span className="min-w-0">
                <span className="block text-xs font-bold tracking-wide text-foreground">ALPHAHUB</span>
                <span className="block text-[10px] text-muted-foreground">FINANCIAL OPS</span>
              </span>
            </div>
          ) : <span className="grid size-8 place-items-center rounded-sm bg-primary text-primary-foreground" aria-label="AlphaHub"><Zap className="size-4" /></span>}
          {mobile ? (
            <Button variant="ghost" size="icon" aria-label="Close navigation" onClick={() => setIsMobileOpen(false)}><X className="size-4" /></Button>
          ) : (
            <Button variant="ghost" size="icon" className={cn(collapsed && 'mt-2')} onClick={() => setIsDesktopCollapsed((value) => !value)} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} title={collapsed ? 'Expand navigation' : 'Collapse navigation'}>
              <Menu className="size-4" />
            </Button>
          )}
        </div>

        <NavigationLinks items={navigationItems} activePage={activePage} collapsed={collapsed} pendingApprovalCount={pendingApprovalCount} onSelect={handleSelect} />

        <div className={cn('shrink-0 border-t border-border p-3', collapsed && 'flex justify-center p-2')}>
          <Button
            variant="ghost"
            className={cn('mb-2 w-full justify-start text-muted-foreground hover:text-foreground', collapsed && 'mb-2 w-9 px-0')}
            onClick={() => saveTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun className="size-4 shrink-0" /> : <Moon className="size-4 shrink-0" />}
            {!collapsed ? <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span> : null}
          </Button>
          <div className={cn('flex items-center gap-2.5', collapsed && 'flex-col')}>
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-primary/30 bg-primary/15 text-xs font-semibold text-primary">{initials}</span>
            {!collapsed ? (
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-foreground">{currentUser.name}</p>
                <p className="text-[11px] text-muted-foreground">{roleLabel[currentUser.role]}</p>
              </div>
            ) : null}
            {logoutItem ? <Button variant="ghost" size="icon" className="shrink-0" onClick={() => handleSelect(logoutItem)} aria-label="Log out" title="Log out"><LogOut className="size-4" /></Button> : null}
          </div>
        </div>
      </aside>
    )
  }

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b border-border bg-background px-4 xl:hidden">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">AlphaHub</p>
          <p className="truncate text-sm font-semibold text-foreground">{pageTitle(activePage)}</p>
        </div>
        <Button variant="outline" size="icon" aria-label="Open navigation" onClick={() => setIsMobileOpen(true)}><Menu className="size-4" /></Button>
      </div>
      <div className={cn('fixed inset-0 z-40 bg-slate-950/35 transition-opacity xl:hidden', isMobileOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0')} onClick={() => setIsMobileOpen(false)} aria-hidden="true" />
      <div className={cn('fixed inset-y-0 left-0 z-50 transition-transform xl:hidden', isMobileOpen ? 'translate-x-0' : '-translate-x-full')}>
        {renderSidebar(true)}
      </div>
      <div className="hidden h-full shrink-0 xl:block">{renderSidebar()}</div>
    </>
  )
}
