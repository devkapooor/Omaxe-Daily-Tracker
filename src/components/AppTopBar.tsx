import { useEffect, useRef, useState } from 'react'
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
  const [isHidden, setIsHidden] = useState(false)
  const previousScrollY = useRef(0)

  useEffect(() => {
    function handleScroll() {
      const currentScrollY = window.scrollY
      const delta = currentScrollY - previousScrollY.current

      if (currentScrollY < 24) {
        setIsHidden(false)
      } else if (delta > 10) {
        setIsHidden(true)
      } else if (delta < -10) {
        setIsHidden(false)
      }

      previousScrollY.current = currentScrollY
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <HoverGradientNavBar
      currentUser={currentUser}
      activePage={activePage}
      isHidden={isHidden}
      onPageChange={onPageChange}
      onLogout={onLogout}
    />
  )
}
