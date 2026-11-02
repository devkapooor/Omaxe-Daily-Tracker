import { createContext, useContext } from 'react'
import type { ComponentType } from 'react'

export type NavigationSubmenuItem = { id: string; label: string; icon?: ComponentType<{ className?: string }> }
export type NavigationSubmenu = {
  ownerId: string
  ariaLabel: string
  activeId: string
  items: NavigationSubmenuItem[]
  onSelect: (id: string) => void
}
export type NavigationSubmenuRegistration = {
  register: (menu: NavigationSubmenu) => void
  unregister: (ownerId: string) => void
}

export const NavigationSubmenuRegistrationContext = createContext<NavigationSubmenuRegistration | null>(null)
export const useNavigationSubmenuRegistration = () => useContext(NavigationSubmenuRegistrationContext)
