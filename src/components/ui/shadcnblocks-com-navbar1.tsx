import { useState } from 'react'
import { Menu } from 'lucide-react'
import type { AppUser } from '@/domain/financeTypes'
import type { Page } from '@/domain/appTypes'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
} from '@/components/ui/navigation-menu'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { buildNavbarMenu, pageTitle, type AppNavbarMenuItem } from '@/components/navigation/menuConfig'
import { cn } from '@/lib/utils'

type Navbar1Props = {
  currentUser: AppUser
  activePage: Page
  onPageChange: (page: Page) => void
  onLogout: () => void
}

function userInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'U'
}

function hasActiveChild(item: AppNavbarMenuItem, activePage: Page) {
  return item.page === activePage || item.items?.some((subItem) => subItem.page === activePage) || false
}

function DesktopMenuItem({
  item,
  activePage,
  onPageChange,
}: {
  item: AppNavbarMenuItem
  activePage: Page
  onPageChange: (page: Page) => void
}) {
  if (item.items) {
    return (
      <NavigationMenuItem key={item.title} className="text-muted-foreground">
        <NavigationMenuTrigger
          className={cn(
            hasActiveChild(item, activePage) && 'bg-secondary/85 text-foreground',
          )}
        >
          {item.title}
        </NavigationMenuTrigger>
        <NavigationMenuContent>
          <ul className="grid w-[24rem] gap-1.5 p-3">
            {item.items.map((subItem) => (
              <li key={subItem.title}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full select-none gap-4 rounded-xl p-3 text-left leading-none outline-none transition-colors hover:bg-muted hover:text-accent-foreground',
                    subItem.page === activePage && 'bg-secondary text-foreground',
                  )}
                  onClick={() => subItem.page && onPageChange(subItem.page)}
                >
                  {subItem.icon}
                  <div>
                    <div className="text-sm font-semibold">{subItem.title}</div>
                    {subItem.description ? (
                      <p className="mt-1 text-sm leading-snug text-muted-foreground">
                        {subItem.description}
                      </p>
                    ) : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </NavigationMenuContent>
      </NavigationMenuItem>
    )
  }

  return (
    <button
      key={item.title}
      type="button"
      className={cn(
        'group inline-flex h-10 w-max items-center justify-center rounded-xl bg-transparent px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-accent-foreground',
        item.page === activePage && 'bg-secondary/85 text-foreground',
      )}
      onClick={() => item.page && onPageChange(item.page)}
    >
      {item.title}
    </button>
  )
}

function MobileMenuItem({
  item,
  activePage,
  onPageChange,
  onClose,
}: {
  item: AppNavbarMenuItem
  activePage: Page
  onPageChange: (page: Page) => void
  onClose: () => void
}) {
  if (item.items) {
    return (
      <AccordionItem key={item.title} value={item.title} className="border-b-0">
        <AccordionTrigger className="py-0 font-semibold hover:no-underline">{item.title}</AccordionTrigger>
        <AccordionContent className="mt-2">
          {item.items.map((subItem) => (
            <button
              key={subItem.title}
              type="button"
              className={cn(
                'flex w-full select-none gap-4 rounded-xl p-3 text-left leading-none outline-none transition-colors hover:bg-muted hover:text-accent-foreground',
                subItem.page === activePage && 'bg-secondary text-foreground',
              )}
              onClick={() => {
                if (subItem.page) onPageChange(subItem.page)
                onClose()
              }}
            >
              {subItem.icon}
              <div>
                <div className="text-sm font-semibold">{subItem.title}</div>
                {subItem.description ? (
                  <p className="mt-1 text-sm leading-snug text-muted-foreground">{subItem.description}</p>
                ) : null}
              </div>
            </button>
          ))}
        </AccordionContent>
      </AccordionItem>
    )
  }

  return (
    <button
      key={item.title}
      type="button"
      className={cn(
        'rounded-md px-1 text-left font-semibold',
        item.page === activePage ? 'text-foreground' : 'text-muted-foreground',
      )}
      onClick={() => {
        if (item.page) onPageChange(item.page)
        onClose()
      }}
    >
      {item.title}
    </button>
  )
}

const roleLabel: Record<AppUser['role'], string> = {
  owner: 'Owner',
  manager: 'Manager',
  billing: 'Billing',
}

function Navbar1({ currentUser, activePage, onPageChange, onLogout }: Navbar1Props) {
  const menu = buildNavbarMenu(currentUser)
  const initials = userInitials(currentUser.name)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="fixed left-0 top-0 z-50 w-full px-2 pt-3 sm:px-3 lg:px-4">
      <section>
        <div className="mx-auto max-w-[1800px]">
          <nav className="hidden items-center justify-between rounded-[28px] border border-border/80 bg-white/92 px-5 py-3.5 shadow-[0_18px_40px_rgba(19,26,20,0.1)] backdrop-blur-xl lg:flex">
            <div className="flex items-center gap-6">
              <button type="button" className="flex items-center gap-3" onClick={() => onPageChange(currentUser.role === 'owner' ? 'dashboard' : 'expense')}>
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-linear-to-b from-emerald-400 to-emerald-600 font-black text-[0.95rem] text-emerald-950 shadow-lg shadow-emerald-500/20">
                  {initials}
                </span>
                <div className="text-left">
                  <span className="block text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">Workspace</span>
                  <span className="text-lg font-semibold text-foreground">Omaxe Daily Tracker</span>
                </div>
              </button>
              <div className="flex items-center">
                <NavigationMenu>
                  <NavigationMenuList>
                    {menu.map((item) => (
                      <DesktopMenuItem key={item.title} item={item} activePage={activePage} onPageChange={onPageChange} />
                    ))}
                  </NavigationMenuList>
                </NavigationMenu>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="rounded-2xl border border-border/80 bg-secondary/55 px-4 py-2.5 text-right">
                <p className="text-sm font-semibold text-foreground">{currentUser.name}</p>
                <p className="text-xs font-medium text-muted-foreground">{roleLabel[currentUser.role]} | {pageTitle(activePage)}</p>
              </div>
              <Button variant="outline" size="sm" onClick={onLogout}>
                Logout
              </Button>
            </div>
          </nav>

          <div className="block lg:hidden">
            <div className="flex items-center justify-between rounded-[28px] border border-border/80 bg-white/92 px-4 py-3.5 shadow-[0_18px_40px_rgba(19,26,20,0.1)] backdrop-blur-xl">
              <button type="button" className="flex min-w-0 items-center gap-3" onClick={() => onPageChange(currentUser.role === 'owner' ? 'dashboard' : 'expense')}>
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-linear-to-b from-emerald-400 to-emerald-600 font-black text-[0.95rem] text-emerald-950 shadow-lg shadow-emerald-500/20">
                  {initials}
                </span>
                <div className="min-w-0 text-left">
                  <span className="block text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">Workspace</span>
                  <span className="block truncate text-base font-semibold text-foreground">{pageTitle(activePage)}</span>
                </div>
              </button>
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl">
                    <Menu className="size-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="overflow-y-auto rounded-r-3xl border-r border-border/80 bg-white/96">
                  <SheetHeader>
                    <SheetTitle>
                      <div className="flex items-center gap-3">
                        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-linear-to-b from-emerald-400 to-emerald-600 font-black text-[0.95rem] text-emerald-950 shadow-lg shadow-emerald-500/20">
                          {initials}
                        </span>
                        <div>
                          <span className="block text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">Workspace</span>
                          <span className="text-lg font-semibold text-foreground">Omaxe Daily Tracker</span>
                        </div>
                      </div>
                    </SheetTitle>
                  </SheetHeader>
                  <div className="my-6 flex flex-col gap-6">
                    <div className="rounded-2xl border border-border/80 bg-secondary/55 px-4 py-3">
                      <p className="text-sm font-semibold text-foreground">{currentUser.name}</p>
                      <p className="text-xs font-medium text-muted-foreground">{roleLabel[currentUser.role]} | {pageTitle(activePage)}</p>
                    </div>
                    <Accordion type="single" collapsible className="flex w-full flex-col gap-4">
                      {menu.map((item) => (
                        <MobileMenuItem
                          key={item.title}
                          item={item}
                          activePage={activePage}
                          onPageChange={onPageChange}
                          onClose={() => setMobileOpen(false)}
                        />
                      ))}
                    </Accordion>
                    <div className="flex flex-col gap-3 border-t pt-4">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setMobileOpen(false)
                          onLogout()
                        }}
                      >
                        Logout
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export { Navbar1 }
