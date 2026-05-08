import { useMemo, useState, type ReactNode } from 'react'
import {
  ArrowRightLeft,
  Building2,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  Settings,
  ShoppingCart,
  Wallet,
} from 'lucide-react'
import type { AppUser } from '../../domain/financeTypes'
import type { Page } from '../../domain/appTypes'

type NavChildItem = {
  title: string
  page: Page
  description: string
  icon: ReactNode
}

type NavItem = {
  title: string
  page?: Page
  items?: NavChildItem[]
}

type Navbar1Props = {
  currentUser: AppUser
  activePage: Page
  onPageChange: (page: Page) => void
  onLogout: () => void
}

function buildMenu(currentUser: AppUser): NavItem[] {
  const overviewItems: NavChildItem[] = []
  if (currentUser.role === 'owner') {
    overviewItems.push(
      {
        title: 'Dashboard',
        page: 'dashboard',
        description: 'Sales, expenses, projections, and month-level performance.',
        icon: <LayoutDashboard className="nav-dropdown-icon" />,
      },
      {
        title: 'Loans',
        page: 'loans',
        description: 'Track loans taken and promised payoff dates.',
        icon: <Wallet className="nav-dropdown-icon" />,
      },
    )
  }

  const operationsItems: NavChildItem[] = [
    {
      title: 'Register',
      page: 'expense',
      description: 'Record expense entries and payment activity.',
      icon: <ReceiptText className="nav-dropdown-icon" />,
    },
    {
      title: 'Cashout',
      page: 'cashout',
      description: 'Save daily cashout and sales drawer details.',
      icon: <Wallet className="nav-dropdown-icon" />,
    },
    {
      title: 'Purchase',
      page: 'purchase',
      description: 'Capture vendor purchases and invoice details.',
      icon: <ShoppingCart className="nav-dropdown-icon" />,
    },
  ]

  const resourcesItems: NavChildItem[] = [
    {
      title: 'Vendors',
      page: 'vendors',
      description: 'Manage the vendor directory and supplier information.',
      icon: <Building2 className="nav-dropdown-icon" />,
    },
    {
      title: 'Cash Movement',
      page: 'movement',
      description: 'Move pending cash between people and bank.',
      icon: <ArrowRightLeft className="nav-dropdown-icon" />,
    },
  ]

  if (currentUser.role === 'owner') {
    resourcesItems.push({
      title: 'Settings',
      page: 'settings',
      description: 'Manage user access and workspace settings.',
      icon: <Settings className="nav-dropdown-icon" />,
    })
  }

  return [
    ...(overviewItems.length > 0 ? [{ title: 'Overview', items: overviewItems }] : []),
    { title: 'Operations', items: operationsItems },
    { title: 'Resources', items: resourcesItems },
  ]
}

function itemGroupIsActive(item: NavItem, activePage: Page) {
  if (item.page) return item.page === activePage
  return item.items?.some((subItem) => subItem.page === activePage) ?? false
}

export function Navbar1({ currentUser, activePage, onPageChange, onLogout }: Navbar1Props) {
  const menu = useMemo(() => buildMenu(currentUser), [currentUser])
  const [openDesktopMenu, setOpenDesktopMenu] = useState<string | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [openMobileSection, setOpenMobileSection] = useState<string | null>(null)

  return (
    <header className="cashout-header app-navbar">
      <div className="app-navbar-brand">
        <button
          type="button"
          className="app-navbar-logo"
          onClick={() => onPageChange(currentUser.role === 'owner' ? 'dashboard' : 'expense')}
        >
          <span className="app-navbar-logo-mark">OT</span>
          <span className="app-navbar-logo-copy">
            <strong>Omaxe Daily Tracker</strong>
            <span>
              {currentUser.name} | {currentUser.role}
            </span>
          </span>
        </button>
      </div>

      <nav className="app-navbar-desktop" aria-label="Primary">
        {menu.map((item) => {
          const isActive = itemGroupIsActive(item, activePage)
          const hasChildren = Boolean(item.items?.length)

          if (!hasChildren && item.page) {
            return (
              <button
                key={item.title}
                type="button"
                className={`top-nav-link app-navbar-link ${isActive ? 'active' : ''}`}
                onClick={() => onPageChange(item.page!)}
              >
                {item.title}
              </button>
            )
          }

          return (
            <div
              key={item.title}
              className="app-navbar-dropdown-wrap"
              onMouseEnter={() => setOpenDesktopMenu(item.title)}
              onMouseLeave={() => setOpenDesktopMenu((current) => (current === item.title ? null : current))}
            >
              <button
                type="button"
                className={`top-nav-link app-navbar-trigger ${isActive ? 'active' : ''}`}
                onClick={() => setOpenDesktopMenu((current) => (current === item.title ? null : item.title))}
              >
                {item.title}
                <ChevronDown className={`app-navbar-chevron ${openDesktopMenu === item.title ? 'open' : ''}`} />
              </button>
              {openDesktopMenu === item.title && item.items && (
                <div className="app-navbar-dropdown">
                  <div className="app-navbar-dropdown-grid">
                    {item.items.map((subItem) => (
                      <button
                        key={subItem.title}
                        type="button"
                        className={`app-navbar-dropdown-item ${subItem.page === activePage ? 'active' : ''}`}
                        onClick={() => {
                          onPageChange(subItem.page)
                          setOpenDesktopMenu(null)
                        }}
                      >
                        {subItem.icon}
                        <span className="app-navbar-dropdown-copy">
                          <strong>{subItem.title}</strong>
                          <span>{subItem.description}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </nav>

      <div className="app-navbar-actions">
        <button type="button" className="top-nav-link app-navbar-logout" onClick={onLogout}>
          <LogOut className="app-navbar-action-icon" />
          Logout
        </button>
        <button
          type="button"
          className="top-nav-link app-navbar-mobile-toggle"
          aria-expanded={mobileMenuOpen}
          aria-label="Toggle navigation menu"
          onClick={() => setMobileMenuOpen((current) => !current)}
        >
          <Menu className="app-navbar-action-icon" />
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="app-navbar-mobile-panel">
          <div className="app-navbar-mobile-sections">
            {menu.map((item) => {
              if (!item.items?.length && item.page) {
                return (
                  <button
                    key={item.title}
                    type="button"
                    className={`app-navbar-mobile-link ${item.page === activePage ? 'active' : ''}`}
                    onClick={() => {
                      onPageChange(item.page!)
                      setMobileMenuOpen(false)
                    }}
                  >
                    {item.title}
                  </button>
                )
              }

              const isOpen = openMobileSection === item.title
              return (
                <div key={item.title} className="app-navbar-mobile-section">
                  <button
                    type="button"
                    className={`app-navbar-mobile-section-trigger ${itemGroupIsActive(item, activePage) ? 'active' : ''}`}
                    onClick={() => setOpenMobileSection((current) => (current === item.title ? null : item.title))}
                  >
                    <span>{item.title}</span>
                    <ChevronDown className={`app-navbar-chevron ${isOpen ? 'open' : ''}`} />
                  </button>
                  {isOpen && item.items && (
                    <div className="app-navbar-mobile-submenu">
                      {item.items.map((subItem) => (
                        <button
                          key={subItem.title}
                          type="button"
                          className={`app-navbar-mobile-item ${subItem.page === activePage ? 'active' : ''}`}
                          onClick={() => {
                            onPageChange(subItem.page)
                            setMobileMenuOpen(false)
                            setOpenMobileSection(null)
                          }}
                        >
                          {subItem.icon}
                          <span className="app-navbar-mobile-copy">
                            <strong>{subItem.title}</strong>
                            <span>{subItem.description}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </header>
  )
}
