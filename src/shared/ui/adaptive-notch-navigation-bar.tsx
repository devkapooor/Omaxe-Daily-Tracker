import { forwardRef, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import { Check, ChevronDown } from 'lucide-react'
import type { ButtonHTMLAttributes, ComponentType, MouseEvent, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import type { NavigationSubmenu } from '@/shared/ui/navigation-submenu-context'

export type NotchPosition = 'top' | 'bottom'
export type NotchItemData = { id: string; label: string; icon?: LucideIcon | ComponentType<{ className?: string }>; badge?: string; disabled?: boolean }
export type NotchWingProps = { position?: NotchPosition; className?: string }

function wingPath(position: NotchPosition, side: 'left' | 'right' | 'corner-left' | 'corner-right') {
  const paths = {
    top: {
      left: 'M 0 0 C 11.046 0 20 8.954 20 20 H 21 V -1 H 0 Z',
      right: 'M 20 0 C 8.954 0 0 8.954 0 20 H -1 V -1 H 20 Z',
      'corner-left': 'M 0 0 H 20 C 8.954 0 0 8.954 0 20 V 0 Z',
      'corner-right': 'M 20 0 H 0 C 11.046 0 20 8.954 20 20 V 0 Z',
    },
    bottom: {
      left: 'M 0 20 C 11.046 20 20 11.046 20 0 H 21 V 21 H 0 Z',
      right: 'M 20 20 C 8.954 20 0 11.046 0 0 H -1 V 21 H 20 Z',
      'corner-left': 'M 0 20 H 20 C 8.954 20 0 11.046 0 0 V 20 Z',
      'corner-right': 'M 20 20 H 0 C 11.046 20 20 11.046 20 0 V 20 Z',
    },
  }
  return paths[position][side]
}

function Wing({ position = 'top', side, className }: NotchWingProps & { side: 'left' | 'right' | 'corner-left' | 'corner-right' }) {
  const placement = side === 'left' ? 'right-full' : side === 'right' ? 'left-full' : side === 'corner-left' ? 'left-0' : 'right-0'
  const vertical = side.startsWith('corner') ? position === 'top' ? 'top-full' : 'bottom-full' : position === 'top' ? 'top-0' : 'bottom-0'
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" shapeRendering="geometricPrecision" className={cn('pointer-events-none absolute size-2.5 overflow-visible select-none text-card md:size-4', placement, vertical, className)}><path d={wingPath(position, side)} fill="currentColor"/></svg>
}

export function NotchLeftWing(props: NotchWingProps) { return <Wing {...props} side="left"/> }
export function NotchRightWing(props: NotchWingProps) { return <Wing {...props} side="right"/> }
export function NotchCornerLeftWing(props: NotchWingProps) { return <Wing {...props} side="corner-left"/> }
export function NotchCornerRightWing(props: NotchWingProps) { return <Wing {...props} side="corner-right"/> }

export interface NotchItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onSelect'> {
  id: string
  label: string
  isActive: boolean
  icon?: LucideIcon | ComponentType<{ className?: string }>
  badge?: string
  disabled?: boolean
  onSelect: (id: string) => void
}

export const NotchItem = forwardRef<HTMLButtonElement, NotchItemProps>(function NotchItem({ id, label, isActive, icon: Icon, badge, disabled, className, onClick, onSelect, ...props }, ref) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (disabled) { event.preventDefault(); return }
    onSelect(id)
    onClick?.(event)
  }
  return <button ref={ref} type="button" role="tab" aria-selected={isActive} aria-disabled={disabled} disabled={disabled} onClick={handleClick} className={cn('relative flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card', isActive ? 'font-semibold text-primary-foreground' : 'text-muted-foreground hover:text-foreground', disabled && 'pointer-events-none cursor-not-allowed opacity-40', className)} {...props}>
    {isActive ? <motion.span layoutId="notch-active-pill" className="absolute inset-0 rounded-full bg-primary" transition={{ type: 'spring', stiffness: 400, damping: 30 }}/> : null}
    <span className="relative z-10 flex items-center gap-1.5">{Icon ? <Icon className="size-3.5 shrink-0"/> : null}<span className="leading-none">{label}</span>{badge ? <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{badge}</span> : null}</span>
  </button>
})
NotchItem.displayName = 'NotchItem'

function NotchDropdownItem({ item, isSelected, onSelect }: { item: NotchItemData; isSelected: boolean; onSelect: (id: string) => void }) {
  const Icon = item.icon
  return <button type="button" role="option" aria-selected={isSelected} disabled={item.disabled} onClick={() => onSelect(item.id)} className={cn('flex min-h-11 w-full cursor-pointer items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring', isSelected ? 'bg-primary font-semibold text-primary-foreground' : 'text-foreground hover:bg-accent', item.disabled && 'pointer-events-none cursor-not-allowed opacity-40')}><span className="flex items-center gap-2.5">{Icon ? <Icon className="size-4 shrink-0"/> : null}<span>{item.label}</span></span>{item.badge ? <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">{item.badge}</span> : isSelected ? <Check className="size-3.5"/> : null}</button>
}

export interface NotchNavProps {
  items: NotchItemData[]
  activeId?: string
  defaultActiveId?: string
  position?: NotchPosition
  logo?: ReactNode
  rightContent?: ReactNode
  showLogo?: boolean
  showRightContent?: boolean
  children?: ReactNode
  onActiveChange?: (id: string) => void
  submenu?: NavigationSubmenu | null
  className?: string
}

export function NotchNav({ items, activeId: controlledActiveId, defaultActiveId, position = 'top', logo, rightContent, showLogo = true, showRightContent = true, children, onActiveChange, submenu = null, className, ...props }: NotchNavProps) {
  const containerRef = useRef<HTMLElement>(null)
  const layoutGroupId = useId()
  const submenuId = useId()
  const reduceMotion = useReducedMotion()
  const [internalActiveId, setInternalActiveId] = useState(defaultActiveId || items[0]?.id || '')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isSubmenuOpen, setIsSubmenuOpen] = useState(false)
  const isBottom = position === 'bottom'
  const activeId = controlledActiveId !== undefined ? controlledActiveId : internalActiveId
  const activeItem = useMemo(() => items.find(item => item.id === activeId) || items[0], [items, activeId])
  const handleSelect = useCallback((id: string) => {
    if (controlledActiveId === undefined) setInternalActiveId(id)
    setIsDropdownOpen(false)
    onActiveChange?.(id)
  }, [controlledActiveId, onActiveChange])
  const closeMenu = useCallback(() => { setIsDropdownOpen(false); setIsSubmenuOpen(false) }, [])

  useEffect(() => {
    const handleOutside = (event: globalThis.MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(event.target as Node)) { setIsDropdownOpen(false); setIsSubmenuOpen(false) }
    }
    if (isDropdownOpen || isSubmenuOpen) document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [isDropdownOpen, isSubmenuOpen])

  useEffect(() => {
    const breakpoint = window.matchMedia('(min-width: 1280px)')
    const closeMenus = () => { setIsDropdownOpen(false); setIsSubmenuOpen(false) }
    breakpoint.addEventListener('change', closeMenus)
    return () => breakpoint.removeEventListener('change', closeMenus)
  }, [])

  const activeSubmenuItem = submenu?.items.find(item => item.id === submenu.activeId)
  const handleSubmenuSelect = (id: string) => { submenu?.onSelect(id); setIsSubmenuOpen(false); setIsDropdownOpen(false) }
  const notch = <motion.header ref={containerRef} role="navigation" aria-label="Application navigation" initial={reduceMotion ? false : { y: position === 'top' ? -14 : 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 24, mass: 0.8 }} className={cn('fixed left-1/2 z-50 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-1.5 overflow-visible bg-card px-2 py-1.5 text-foreground shadow-lg ring-1 ring-border/70 md:gap-2 md:px-3', isBottom ? 'bottom-2 rounded-2xl' : 'top-2 rounded-2xl', className)}>
    {showLogo && logo ? <div className="flex shrink-0 items-center border-r border-border/70 pr-2 md:pr-3">{logo}</div> : null}
    <div role="tablist" aria-label="Main pages" aria-orientation="horizontal" className="hidden min-w-0 items-center gap-0.5 xl:flex"><LayoutGroup id={layoutGroupId}>{items.map(item => <div key={item.id} className="flex shrink-0 items-center"><NotchItem {...item} isActive={item.id === activeId} onSelect={handleSelect}/>{item.id === activeId && submenu?.items.length ? <button type="button" aria-expanded={isSubmenuOpen} aria-haspopup="listbox" aria-controls={`${submenuId}-sections`} aria-label={`Open ${submenu.ariaLabel}`} onClick={() => setIsSubmenuOpen(value => !value)} className="-ml-1 mr-1 grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><ChevronDown className={cn('size-3.5 transition-transform', isSubmenuOpen && 'rotate-180')}/></button> : null}</div>)}</LayoutGroup></div>
    <div className="relative flex min-w-0 items-center gap-1 xl:hidden">
      <button type="button" aria-expanded={isDropdownOpen} aria-haspopup="listbox" aria-controls={`${submenuId}-pages`} aria-label="Choose page" onClick={() => { setIsDropdownOpen(value => !value); setIsSubmenuOpen(false) }} className="flex h-9 min-w-0 max-w-52 items-center gap-1.5 rounded-full px-2 text-sm font-semibold outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">{activeItem?.icon ? <activeItem.icon className="size-4 shrink-0 text-primary"/> : null}<span className="truncate">{activeItem?.label}{activeSubmenuItem ? ` · ${activeSubmenuItem.label}` : ''}</span><ChevronDown className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', isDropdownOpen && 'rotate-180')}/></button>
    </div>
    {showRightContent && rightContent ? <div className="flex shrink-0 items-center border-l border-border/70 pl-1.5 md:pl-2">{rightContent}</div> : null}
    {isSubmenuOpen && submenu?.items.length ? <motion.div id={`${submenuId}-sections`} role="listbox" aria-label={submenu.ariaLabel} initial={reduceMotion ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16 }} className="absolute left-1/2 top-[calc(100%-0.375rem)] hidden max-h-[min(65dvh,34rem)] w-[min(36rem,92vw)] -translate-x-1/2 flex-col gap-0.5 overflow-y-auto rounded-b-2xl border-x border-b border-border bg-card p-2 pt-3 text-foreground shadow-xl xl:flex">{submenu.items.map(option => <NotchDropdownItem key={option.id} item={option} isSelected={option.id === submenu.activeId} onSelect={handleSubmenuSelect}/>)}</motion.div> : null}
    {isDropdownOpen ? <motion.div id={`${submenuId}-pages`} role="listbox" aria-label="Application pages" initial={reduceMotion ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16 }} className="absolute left-1/2 top-full flex max-h-[min(70dvh,36rem)] w-[min(92vw,24rem)] -translate-x-1/2 flex-col gap-0.5 overflow-y-auto rounded-b-2xl border-x border-b border-border bg-card p-2 text-foreground shadow-xl">{items.map(item => <div key={item.id}><NotchDropdownItem item={item} isSelected={item.id === activeId} onSelect={handleSelect}/>{item.id === activeId && submenu?.items.length ? <div className="ml-5 mt-1 border-l border-border pl-2"><p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{submenu.ariaLabel}</p>{submenu.items.map(option => <NotchDropdownItem key={option.id} item={option} isSelected={option.id === submenu.activeId} onSelect={handleSubmenuSelect}/>)}</div> : null}</div>)}</motion.div> : null}
  </motion.header>

  return <div className="fixed inset-0 h-[100dvh] w-screen overflow-hidden bg-background p-0">
    <div className="relative flex h-full w-full flex-col rounded-none border-0 bg-background text-foreground antialiased">
      {notch}
      {(isDropdownOpen || isSubmenuOpen) ? <button type="button" aria-label="Close navigation menu" onClick={closeMenu} className="fixed inset-0 z-40 cursor-default bg-black/50 backdrop-blur-[2px]"/> : null}
      <div className={cn('relative flex h-full w-full min-h-0 flex-col items-start justify-start overflow-y-auto overflow-x-hidden px-2 sm:px-3 md:px-4', isBottom ? 'pb-16 pt-2' : 'pb-2 pt-16')}>
        <main className="flex h-full min-h-0 w-full min-w-0 flex-col">{children}</main>
      </div>
    </div>
  </div>
}
