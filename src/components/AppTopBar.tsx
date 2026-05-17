import type { AppUser } from '@/domain/financeTypes'
import type { Page } from '@/domain/appTypes'
import { Navbar1 } from '@/components/ui/shadcnblocks-com-navbar1'

type AppTopBarProps = {
  currentUser: AppUser
  activePage: Page
  onPageChange: (page: Page) => void
  onLogout: () => void
}

export function AppTopBar({ currentUser, activePage, onPageChange, onLogout }: AppTopBarProps) {
  return <Navbar1 currentUser={currentUser} activePage={activePage} onPageChange={onPageChange} onLogout={onLogout} />
}
