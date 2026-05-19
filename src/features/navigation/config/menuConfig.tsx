import type { ReactNode } from 'react'
import {
  ArrowRightLeft,
  CalendarClock,
  LayoutDashboard,
  LogOut,
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
    case 'planner':
      return 'Payment Planner'
    case 'logs':
      return 'Logs'
    case 'settings':
      return 'Settings'
    default:
      return 'Workspace'
  }
}

export function buildMenu(currentUser: AppUser): NavItem[] {
  const items: NavItem[] = []

  if (currentUser.role === 'owner') {
    items.push({
      icon: <LayoutDashboard className="size-4 shrink-0" />,
      label: 'Dashboard',
      page: 'dashboard',
      gradient: '',
      hoverClass: '',
      activeClass: 'bg-secondary text-foreground',
      action: 'page',
    })
  }

  items.push(
    {
      icon: <Users className="size-4 shrink-0" />,
      label: 'Directory',
      page: 'directory',
      gradient: '',
      hoverClass: '',
      activeClass: 'bg-secondary text-foreground',
      action: 'page',
    },
    {
      icon: <ReceiptText className="size-4 shrink-0" />,
      label: 'Register',
      page: 'expense',
      gradient: '',
      hoverClass: '',
      activeClass: 'bg-secondary text-foreground',
      action: 'page',
    },
    {
      icon: <Wallet className="size-4 shrink-0" />,
      label: 'Cashout',
      page: 'cashout',
      gradient: '',
      hoverClass: '',
      activeClass: 'bg-secondary text-foreground',
      action: 'page',
    },
    {
      icon: <ArrowRightLeft className="size-4 shrink-0" />,
      label: 'Cash Movement',
      page: 'movement',
      gradient: '',
      hoverClass: '',
      activeClass: 'bg-secondary text-foreground',
      action: 'page',
    },
  )

  if (currentUser.role === 'owner' || currentUser.role === 'manager') {
    items.push({
      icon: <CalendarClock className="size-4 shrink-0" />,
      label: 'Payment Planner',
      page: 'planner',
      gradient: '',
      hoverClass: '',
      activeClass: 'bg-secondary text-foreground',
      action: 'page',
    })
  }

  if (currentUser.role === 'owner') {
    items.push({
      icon: <Logs className="size-4 shrink-0" />,
      label: 'Logs',
      page: 'logs',
      gradient: '',
      hoverClass: '',
      activeClass: 'bg-secondary text-foreground',
      action: 'page',
    })
  }

  items.push({
    icon: <Settings className="size-4 shrink-0" />,
    label: 'Settings',
    page: 'settings',
    gradient: '',
    hoverClass: '',
    activeClass: 'bg-secondary text-foreground',
    action: 'page',
  })

  items.push({
    icon: <LogOut className="size-4 shrink-0" />,
    label: 'Logout',
    gradient: '',
    hoverClass: '',
    activeClass: '',
    action: 'logout',
  })

  return items
}
