import { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'
import type { AppUser } from '@/domain/financeTypes'
import type { Page } from '@/domain/appTypes'
import { buildMenu, pageTitle } from '@/components/navigation/menuConfig'
import { cn } from '@/lib/utils'

type MobileDrawerNavProps = {
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

export function MobileDrawerNav({ currentUser, activePage, onPageChange, onLogout }: MobileDrawerNavProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuItems = buildMenu(currentUser)
  const initials = userInitials(currentUser.name)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false)
    }

    if (!isOpen) return
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  function handleSelect(item: (typeof menuItems)[number]) {
    setIsOpen(false)
    if (item.action === 'logout') {
      onLogout()
      return
    }
    if (item.page) onPageChange(item.page)
  }

  return (
    <>
      <div className="fixed left-0 top-0 z-50 w-full px-2 pt-3 lg:hidden">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between rounded-[28px] border border-border/80 bg-white/90 px-4 py-3.5 shadow-[0_18px_40px_rgba(19,26,20,0.1)] backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border/80 bg-secondary/65 text-foreground transition-colors hover:bg-secondary"
              aria-label={isOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setIsOpen((current) => !current)}
            >
              {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <button
              type="button"
              className="inline-flex items-center rounded-3xl bg-transparent text-left text-foreground"
              onClick={() => onPageChange(currentUser.role === 'owner' ? 'dashboard' : 'expense')}
              aria-label="Go to home"
            >
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-linear-to-b from-emerald-400 to-emerald-600 font-black text-[0.95rem] text-emerald-950 shadow-lg shadow-emerald-500/20">
                {initials}
              </span>
            </button>
            <div className="min-w-0">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">Workspace</p>
              <p className="truncate text-[15px] font-bold text-foreground">{pageTitle(activePage)}</p>
            </div>
          </div>
          <div className="w-12 flex-none" aria-hidden="true" />
        </div>
      </div>

      <div
        className={cn(
          'fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[1px] transition-opacity duration-200 lg:hidden',
          isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => setIsOpen(false)}
      />

      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-full w-[min(88vw,380px)] flex-col border-r border-border/80 bg-white/96 shadow-[24px_0_48px_rgba(19,26,20,0.16)] backdrop-blur-xl transition-transform duration-300 ease-out lg:hidden',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-hidden={!isOpen}
      >
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-4.5">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">Navigation</p>
            <p className="text-base font-black text-foreground">{currentUser.name}</p>
          </div>
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border/80 bg-secondary/65 text-foreground transition-colors hover:bg-secondary"
            aria-label="Close menu"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-4">
          <ul className="grid gap-2.5">
            {menuItems.map((item) => {
              const isActive = item.page === activePage
              return (
                <li key={item.label}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-3 rounded-2xl border border-transparent px-4 py-3.5 text-left text-sm font-semibold text-muted-foreground transition-all duration-200 hover:bg-secondary/80',
                      isActive && item.activeClass,
                    )}
                    onClick={() => handleSelect(item)}
                  >
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 shadow-sm">{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
      </aside>
    </>
  )
}
