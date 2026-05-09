import type { AppUser } from '@/domain/financeTypes'
import type { Page } from '@/domain/appTypes'
import { HoverGradientNavBar } from '@/components/ui/hover-gradient-nav-bar'

type AppTopBarProps = {
  currentUser: AppUser
  activePage: Page
  onPageChange: (page: Page) => void
  onLogout: () => void
}

export function AppTopBar({ currentUser, activePage, onPageChange, onLogout }: AppTopBarProps) {
  return <HoverGradientNavBar currentUser={currentUser} activePage={activePage} onPageChange={onPageChange} onLogout={onLogout} />
}
