import { motion, type Variants } from 'framer-motion'
import type { AppUser } from '@/domain/financeTypes'
import type { Page } from '@/domain/appTypes'
import { buildMenu } from '@/features/navigation/config/menuConfig'
import { cn } from '@/shared/lib/utils'

type HoverGradientNavBarProps = {
  currentUser: AppUser
  activePage: Page
  isHidden?: boolean
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

export function HoverGradientNavBar({
  currentUser,
  activePage,
  isHidden = false,
  onPageChange,
  onLogout,
}: HoverGradientNavBarProps) {
  const menuItems = buildMenu(currentUser)
  const initials = userInitials(currentUser.name)

  return (
    <div
      className={cn(
        'pointer-events-none fixed left-0 top-3 z-50 hidden w-full px-2 transition-transform duration-300 ease-out lg:block lg:px-4',
        isHidden ? '-translate-y-[120%]' : 'translate-y-0',
      )}
    >
      <motion.nav
        className="pointer-events-auto mx-auto flex w-full max-w-[1800px] items-center gap-4 rounded-[30px] border border-border/80 bg-white/88 px-5 py-3.5 shadow-[0_18px_40px_rgba(19,26,20,0.1)] backdrop-blur-xl"
        initial="initial"
      >
        <div className="flex-none">
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
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto scrollbar-none">
          <ul className="flex min-w-max items-center gap-2 px-1 py-1.5">
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
                        'relative z-10 flex min-h-[44px] min-w-[52px] items-center justify-center gap-2.5 rounded-2xl border border-transparent px-4 text-center text-[13px] font-semibold text-muted-foreground transition-[color,background-color,border-color,box-shadow] duration-200 hover:bg-white/80 md:min-h-[46px] md:px-4.5',
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

