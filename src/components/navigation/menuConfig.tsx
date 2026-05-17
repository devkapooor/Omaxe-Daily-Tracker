import type { ReactNode } from 'react'
import {
  ArrowRightLeft,
  LayoutDashboard,
  Logs,
  ReceiptText,
  Settings,
  Users,
  Wallet,
} from 'lucide-react'
import type { AppUser } from '@/domain/financeTypes'
import type { Page } from '@/domain/appTypes'

export type NavItem = {
  icon: ReactNode
  label: string
  page?: Page
  gradient: string
  hoverClass: string
  activeClass: string
  action: 'page' | 'logout'
}

export type AppNavbarMenuItem = {
  title: string
  page?: Page
  description?: string
  icon?: ReactNode
  items?: AppNavbarMenuItem[]
  action?: 'logout'
}

export function pageTitle(page: Page) {
  switch (page) {
    case 'dashboard':
      return 'Dashboard'
    case 'directory':
      return 'Directory'
    case 'expense':
      return 'Register'
    case 'cashout':
      return 'Cashout'
    case 'movement':
      return 'Cash Movement'
    case 'logs':
      return 'Logs'
    case 'settings':
      return 'Settings'
    default:
      return 'Workspace'
  }
}

export function buildNavbarMenu(currentUser: AppUser): AppNavbarMenuItem[] {
  const items: AppNavbarMenuItem[] = []

  if (currentUser.role === 'owner') {
    items.push({
      title: 'Dashboard',
      page: 'dashboard',
      icon: <LayoutDashboard className="size-5 shrink-0" />,
      description: 'Owner overview, projections, balances, and day-close summaries.',
    })
  }

  items.push({
    title: 'Directory',
    page: 'directory',
    icon: <Users className="size-5 shrink-0" />,
    description: 'Browse vendors and parties and manage master directory details.',
  })

  items.push({
    title: 'Operations',
    items: [
      {
        title: 'Register',
        page: 'expense',
        icon: <ReceiptText className="size-5 shrink-0" />,
        description: 'Record expenses, vendor payments, purchases, and loan entries.',
      },
      {
        title: 'Cashout',
        page: 'cashout',
        icon: <Wallet className="size-5 shrink-0" />,
        description: 'Capture the daily drawer, audit, and end-of-day cashout details.',
      },
      {
        title: 'Cash Movement',
        page: 'movement',
        icon: <ArrowRightLeft className="size-5 shrink-0" />,
        description: 'Transfer pending cash between holders or to bank with history.',
      },
    ],
  })

  if (currentUser.role === 'owner') {
    items.push({
      title: 'Admin',
      items: [
        {
          title: 'Logs',
          page: 'logs',
          icon: <Logs className="size-5 shrink-0" />,
          description: 'Review sales, payments, loans, cashouts, transfers, and audits.',
        },
        {
          title: 'Settings',
          page: 'settings',
          icon: <Settings className="size-5 shrink-0" />,
          description: 'Manage users, password, operational settings, and app controls.',
        },
      ],
    })
  } else {
    items.push({
      title: 'Settings',
      page: 'settings',
      icon: <Settings className="size-5 shrink-0" />,
      description: 'Update your password and access the allowed workspace settings.',
    })
  }

  return items
}

export function buildMenu(currentUser: AppUser): NavItem[] {
  const pageItems: NavItem[] = buildNavbarMenu(currentUser).flatMap((item): NavItem[] => {
    if (item.items) {
      return item.items.map((subItem) => ({
        icon: subItem.icon ?? null,
        label: subItem.title,
        page: subItem.page,
        gradient: '',
        hoverClass: '',
        activeClass: '',
        action: 'page' as const,
      }))
    }

    return [{
      icon: item.icon ?? null,
      label: item.title,
      page: item.page,
      gradient: '',
      hoverClass: '',
      activeClass: '',
      action: 'page' as const,
    }]
  })

  pageItems.push({
    icon: null,
    label: 'Logout',
    gradient: '',
    hoverClass: '',
    activeClass: '',
    action: 'logout',
  })

  return pageItems
}
