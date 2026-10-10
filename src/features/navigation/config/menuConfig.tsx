import type { ReactNode } from 'react'
import {
  ArrowRightLeft,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Logs,
  PackageSearch,
  HandCoins,
  ReceiptText,
  ScanBarcode,
  Settings,
  TestTube2,
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
    case 'actions':
      return 'Action Centre'
    case 'pos-test':
      return 'POS'
    case 'stock':
      return 'Current Stock'
    case 'vendor-preview':
      return 'Vendor Workspace'
    case 'directory':
      return 'Party Directory'
    case 'expense':
      return 'Register'
    case 'loans':
      return 'Loans'
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

export function buildMenu(currentUser: AppUser): NavItem[] {
  const items: NavItem[] = []

  if (currentUser.role === 'owner') {
    items.push({
      icon: <HandCoins className="size-4 shrink-0" />,
      label: 'Loans',
      page: 'loans',
      gradient: '',
      hoverClass: '',
      activeClass: 'bg-secondary text-foreground',
      action: 'page',
    })
    items.push({
      icon: <LayoutDashboard className="size-4 shrink-0" />,
      label: 'Dashboard',
      page: 'dashboard',
      gradient: '',
      hoverClass: '',
      activeClass: 'bg-secondary text-foreground',
      action: 'page',
    })
    items.push({
      icon: <ClipboardCheck className="size-4 shrink-0" />,
      label: 'Action Centre',
      page: 'actions',
      gradient: '',
      hoverClass: '',
      activeClass: 'bg-secondary text-foreground',
      action: 'page',
    })
  }

  items.push({
    icon: <ScanBarcode className="size-4 shrink-0" />,
    label: 'POS',
    page: 'pos-test',
    gradient: '',
    hoverClass: '',
    activeClass: 'bg-secondary text-foreground',
    action: 'page',
  })

  items.push({
    icon: <PackageSearch className="size-4 shrink-0" />,
    label: 'Current Stock',
    page: 'stock',
    gradient: '',
    hoverClass: '',
    activeClass: 'bg-secondary text-foreground',
    action: 'page',
  })

  items.push({
    icon: <TestTube2 className="size-4 shrink-0" />,
    label: 'Vendor Workspace',
    page: 'vendor-preview',
    gradient: '',
    hoverClass: '',
    activeClass: 'bg-secondary text-foreground',
    action: 'page',
  })

  items.push(
    {
      icon: <Users className="size-4 shrink-0" />,
      label: 'Party Directory',
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
