import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowRightLeft,
  Building2,
  ClipboardCheck,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Logs,
  Moon,
  PackageSearch,
  ReceiptText,
  ScanBarcode,
  Settings,
  Sun,
  Wallet,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AppUser } from '@/domain/financeTypes'
import type { Page } from '@/domain/appTypes'
import { buildMenu } from '@/features/navigation/config/menuConfig'
import { NotchNav, type NotchItemData } from '@/shared/ui/adaptive-notch-navigation-bar'
import { Button } from '@/shared/ui/button'
import { getActiveTheme, saveTheme, subscribeToTheme, type Theme } from '@/shared/lib/theme'
import { NavigationSubmenuRegistrationContext, type NavigationSubmenu } from '@/shared/ui/navigation-submenu-context'

const pageIcons = {
  dashboard: LayoutDashboard,
  actions: ClipboardCheck,
  'pos-test': ScanBarcode,
  stock: PackageSearch,
  'vendor-preview': Building2,
  directory: Building2,
  expense: ReceiptText,
  loans: HandCoins,
  cashout: Wallet,
  movement: ArrowRightLeft,
  logs: Logs,
  settings: Settings,
} satisfies Partial<Record<Page, LucideIcon>>
const pageOrder: Page[] = ['dashboard', 'actions', 'pos-test', 'stock', 'vendor-preview', 'expense', 'cashout', 'movement', 'loans', 'logs', 'settings']

function initials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || 'U'
}

export function AppNavigationShell({
  currentUser,
  activePage,
  pendingApprovalCount,
  onPageChange,
  onLogout,
  children,
}: {
  currentUser: AppUser
  activePage: Page
  pendingApprovalCount: number | null
  onPageChange: (page: Page) => void
  onLogout: () => void
  children: ReactNode
}) {
  const [theme, setTheme] = useState<Theme>(getActiveTheme)
  const [submenu, setSubmenu] = useState<NavigationSubmenu | null>(null)
  const menuItems = useMemo(() => buildMenu(currentUser), [currentUser])
  const pages = useMemo(() => menuItems.filter(item => item.action === 'page' && item.page).sort((a, b) => pageOrder.indexOf(a.page!) - pageOrder.indexOf(b.page!)), [menuItems])
  const items = useMemo<NotchItemData[]>(() => pages.flatMap(item => {
    const page = item.page
    if (!page) return []
    const Icon = pageIcons[page]
    const hasPending = page === 'actions' && (pendingApprovalCount === null || pendingApprovalCount > 0)
    return [{
      id: page,
      label: page === 'vendor-preview' ? 'Vendors' : page === 'movement' ? 'Movement' : page === 'actions' ? 'Actions' : item.label,
      ...(Icon ? { icon: Icon } : {}),
      ...(hasPending ? { badge: pendingApprovalCount === null ? '?' : pendingApprovalCount > 99 ? '99+' : String(pendingApprovalCount) } : {}),
    }]
  }), [pages, pendingApprovalCount])
  const logoutAvailable = menuItems.some(item => item.action === 'logout')
  const userInitials = initials(currentUser.name)

  useEffect(() => subscribeToTheme(setTheme), [])
  const registerSubmenu = useCallback((next: NavigationSubmenu) => setSubmenu(next), [])
  const unregisterSubmenu = useCallback((ownerId: string) => setSubmenu(current => current?.ownerId === ownerId ? null : current), [])
  const submenuRegistration = useMemo(() => ({ register: registerSubmenu, unregister: unregisterSubmenu }), [registerSubmenu, unregisterSubmenu])

  const logo = <div className="flex h-8 items-center gap-2"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"><Zap className="size-4"/></span><span className="hidden text-xs font-bold tracking-wide sm:inline">AlphaHub</span></div>
  const rightContent = <div className="flex h-8 items-center gap-1 sm:gap-2">
    <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => saveTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
      {theme === 'dark' ? <Sun className="size-4"/> : <Moon className="size-4"/>}
    </Button>
    <span className="grid size-7 shrink-0 place-items-center rounded-full border border-primary/30 bg-primary/15 text-[10px] font-semibold text-primary" aria-label={currentUser.name}>{userInitials}</span>
    <span className="hidden max-w-36 flex-col leading-tight 2xl:flex"><span className="truncate text-xs font-semibold">{currentUser.name}</span><span className="text-[10px] text-muted-foreground">{currentUser.role === 'owner' ? 'Owner' : currentUser.role === 'manager' ? 'Manager' : 'Billing'}</span></span>
    {logoutAvailable ? <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" onClick={onLogout} aria-label="Log out" title="Log out"><LogOut className="size-4"/></Button> : null}
  </div>

  return <NavigationSubmenuRegistrationContext.Provider value={submenuRegistration}>
    <NotchNav items={items} activeId={activePage === 'directory' ? 'vendor-preview' : activePage} logo={logo} rightContent={rightContent} submenu={submenu} onActiveChange={id => onPageChange(id as Page)}>
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden px-page-inset pb-page-inset pt-page-inset">
        {children}
      </div>
    </NotchNav>
  </NavigationSubmenuRegistrationContext.Provider>
}
