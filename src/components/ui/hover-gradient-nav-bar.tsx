import type { ReactNode } from 'react'
import { motion, type Variants } from 'framer-motion'
import {
  ArrowRightLeft,
  Building2,
  LayoutDashboard,
  LogOut,
  ReceiptText,
  Settings,
  ShoppingCart,
  Wallet,
} from 'lucide-react'
import type { AppUser } from '@/domain/financeTypes'
import type { Page } from '@/domain/appTypes'
import { cn } from '@/lib/utils'

type HoverGradientNavBarProps = {
  currentUser: AppUser
  activePage: Page
  onPageChange: (page: Page) => void
  onLogout: () => void
}

type NavItem = {
  icon: ReactNode
  label: string
  page?: Page
  gradient: string
  hoverClass: string
  activeClass: string
  action: 'page' | 'logout'
}

const itemVariants: Variants = {
  initial: { opacity: 1, y: 0, scale: 1 },
  hover: { opacity: 1, y: -1, scale: 1.01 },
}

const glowVariants: Variants = {
  initial: { opacity: 0, scale: 0.82 },
  hover: {
    opacity: 1,
    scale: 1.55,
    transition: {
      opacity: { duration: 0.35, ease: [0.4, 0, 0.2, 1] },
      scale: { duration: 0.45, type: 'spring', stiffness: 260, damping: 24 },
    },
  },
}

const sharedTransition = {
  type: 'spring' as const,
  stiffness: 220,
  damping: 22,
  duration: 0.24,
}

function buildMenu(currentUser: AppUser): NavItem[] {
  const items: NavItem[] = []

  if (currentUser.role === 'owner') {
    items.push(
      {
        icon: <LayoutDashboard className="h-[18px] w-[18px]" />,
        label: 'Dashboard',
        page: 'dashboard',
        gradient: 'radial-gradient(circle, rgba(66, 133, 244, 0.18) 0%, rgba(59, 130, 246, 0.07) 46%, rgba(59, 130, 246, 0) 100%)',
        hoverClass: 'group-hover:text-blue-600',
        activeClass: 'border border-blue-200 bg-blue-50/95 text-blue-700 shadow-[0_10px_24px_rgba(96,165,250,0.18)]',
        action: 'page',
      },
      {
        icon: <Wallet className="h-[18px] w-[18px]" />,
        label: 'Loans',
        page: 'loans',
        gradient: 'radial-gradient(circle, rgba(245, 158, 11, 0.2) 0%, rgba(217, 119, 6, 0.08) 48%, rgba(180, 83, 9, 0) 100%)',
        hoverClass: 'group-hover:text-amber-700',
        activeClass: 'border border-amber-200 bg-amber-50/95 text-amber-700 shadow-[0_10px_24px_rgba(251,191,36,0.18)]',
        action: 'page',
      },
    )
  }

  items.push(
    {
      icon: <ReceiptText className="h-[18px] w-[18px]" />,
      label: 'Register',
      page: 'expense',
      gradient: 'radial-gradient(circle, rgba(22, 163, 74, 0.18) 0%, rgba(34, 197, 94, 0.07) 48%, rgba(22, 163, 74, 0) 100%)',
      hoverClass: 'group-hover:text-emerald-700',
      activeClass: 'border border-emerald-200 bg-emerald-50/95 text-emerald-700 shadow-[0_10px_24px_rgba(74,222,128,0.18)]',
      action: 'page',
    },
    {
      icon: <Wallet className="h-[18px] w-[18px]" />,
      label: 'Cashout',
      page: 'cashout',
      gradient: 'radial-gradient(circle, rgba(14, 165, 233, 0.18) 0%, rgba(59, 130, 246, 0.07) 48%, rgba(29, 78, 216, 0) 100%)',
      hoverClass: 'group-hover:text-sky-700',
      activeClass: 'border border-sky-200 bg-sky-50/95 text-sky-700 shadow-[0_10px_24px_rgba(56,189,248,0.18)]',
      action: 'page',
    },
    {
      icon: <ShoppingCart className="h-[18px] w-[18px]" />,
      label: 'Purchase',
      page: 'purchase',
      gradient: 'radial-gradient(circle, rgba(168, 85, 247, 0.18) 0%, rgba(147, 51, 234, 0.07) 48%, rgba(107, 33, 168, 0) 100%)',
      hoverClass: 'group-hover:text-violet-700',
      activeClass: 'border border-violet-200 bg-violet-50/95 text-violet-700 shadow-[0_10px_24px_rgba(167,139,250,0.18)]',
      action: 'page',
    },
    {
      icon: <Building2 className="h-[18px] w-[18px]" />,
      label: 'Vendors',
      page: 'vendors',
      gradient: 'radial-gradient(circle, rgba(20, 184, 166, 0.18) 0%, rgba(13, 148, 136, 0.07) 48%, rgba(15, 118, 110, 0) 100%)',
      hoverClass: 'group-hover:text-teal-700',
      activeClass: 'border border-teal-200 bg-teal-50/95 text-teal-700 shadow-[0_10px_24px_rgba(45,212,191,0.18)]',
      action: 'page',
    },
    {
      icon: <ArrowRightLeft className="h-[18px] w-[18px]" />,
      label: 'Cash Movement',
      page: 'movement',
      gradient: 'radial-gradient(circle, rgba(239, 68, 68, 0.16) 0%, rgba(220, 38, 38, 0.07) 48%, rgba(185, 28, 28, 0) 100%)',
      hoverClass: 'group-hover:text-rose-700',
      activeClass: 'border border-rose-200 bg-rose-50/95 text-rose-700 shadow-[0_10px_24px_rgba(251,113,133,0.18)]',
      action: 'page',
    },
  )

  items.push({
    icon: <Settings className="h-[18px] w-[18px]" />,
    label: 'Settings',
    page: 'settings',
    gradient: 'radial-gradient(circle, rgba(99, 102, 241, 0.18) 0%, rgba(79, 70, 229, 0.07) 48%, rgba(67, 56, 202, 0) 100%)',
    hoverClass: 'group-hover:text-indigo-700',
    activeClass: 'border border-indigo-200 bg-indigo-50/95 text-indigo-700 shadow-[0_10px_24px_rgba(129,140,248,0.18)]',
    action: 'page',
  })

  items.push({
    icon: <LogOut className="h-[18px] w-[18px]" />,
    label: 'Logout',
    gradient: 'radial-gradient(circle, rgba(180, 83, 9, 0.18) 0%, rgba(146, 64, 14, 0.08) 48%, rgba(120, 53, 15, 0) 100%)',
    hoverClass: 'group-hover:text-amber-700',
    activeClass: '',
    action: 'logout',
  })

  return items
}

export function HoverGradientNavBar({
  currentUser,
  activePage,
  onPageChange,
  onLogout,
}: HoverGradientNavBarProps) {
  const menuItems = buildMenu(currentUser)

  return (
    <div className="pointer-events-none fixed left-0 top-2 z-50 w-full px-3 sm:top-3 sm:px-4">
      <motion.nav
        className="pointer-events-auto mx-auto flex w-full max-w-7xl items-center gap-3 rounded-[28px] border border-border/80 bg-white/88 px-4 py-3 shadow-[0_18px_40px_rgba(19,26,20,0.1)] backdrop-blur-xl"
        initial="initial"
      >
        <div className="flex-none">
          <button
            type="button"
            className="inline-flex items-center rounded-3xl bg-transparent text-left text-foreground"
            onClick={() => onPageChange(currentUser.role === 'owner' ? 'dashboard' : 'expense')}
            aria-label="Go to home"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-linear-to-b from-emerald-400 to-emerald-600 font-black text-[0.9rem] text-emerald-950 shadow-lg shadow-emerald-500/20">
              OT
            </span>
          </button>
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto scrollbar-none">
          <ul className="flex min-w-max items-center gap-1.5 px-1 py-1.5">
            {menuItems.map((item) => {
              const isActive = item.page === activePage

              return (
                <motion.li key={item.label} className="list-none flex-none overflow-visible">
                  <motion.div
                    className="group relative rounded-3xl"
                    whileHover="hover"
                    initial="initial"
                  >
                    <motion.div
                      className="pointer-events-none absolute inset-[-10px] rounded-[24px] blur-[14px]"
                      variants={glowVariants}
                      style={{ background: item.gradient }}
                    />

                    <motion.button
                      type="button"
                      className={cn(
                        'relative z-10 flex min-h-[40px] min-w-[46px] items-center justify-center gap-2 rounded-xl border border-transparent px-3 text-center text-[13px] font-semibold text-muted-foreground transition-[color,background-color,border-color,box-shadow] duration-200 hover:bg-white/80 md:min-h-[42px] md:px-3.5',
                        item.hoverClass,
                        isActive && item.activeClass,
                      )}
                      variants={itemVariants}
                      transition={sharedTransition}
                      whileHover={{ y: -1, scale: 1.01 }}
                      onClick={() => (item.action === 'logout' ? onLogout() : item.page && onPageChange(item.page))}
                    >
                      <span className="inline-flex items-center justify-center">{item.icon}</span>
                      <span className="hidden whitespace-nowrap md:inline">{item.label}</span>
                    </motion.button>
                  </motion.div>
                </motion.li>
              )
            })}
          </ul>
        </div>
      </motion.nav>
    </div>
  )
}
