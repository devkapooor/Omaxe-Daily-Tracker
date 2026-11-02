import { Children, cloneElement, isValidElement, useContext, useEffect, useId, useMemo, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import {
  BadgeCheck, Banknote, Bell, Building2, ChartPie, ClipboardCheck, Clock,
  FileClock, FileText, HandCoins, History, KeyRound, Landmark, Package,
  PackagePlus, ReceiptText, RotateCcw, ScanBarcode, ShoppingCart,
  SlidersHorizontal, Users, Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { TabsList as BaseTabsList, TabsTrigger as BaseTabsTrigger, TabsNavigationContext } from '@/shared/ui/tabs'
import { useNavigationSubmenuRegistration } from '@/shared/ui/navigation-submenu-context'

type PageHeaderProps = {
  title: string
  tools?: ReactNode
  className?: string
}

export function PageHeader({ title, tools, className }: PageHeaderProps) {
  const navigation = useNavigationSubmenuRegistration()
  const { visibleTools, pageTabs } = useMemo(() => navigation && tools ? splitPageTabs(tools) : { visibleTools: tools, pageTabs: [] as ReactNode[] }, [navigation, tools])
  return (
    <>
      <header className={cn(
        'flex min-h-20 flex-col justify-center gap-2 rounded-md border border-border bg-card p-page-header shadow-sm sm:flex-row sm:items-center sm:justify-between',
        className,
      )}>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        </div>
        {visibleTools && hasRenderableContent(visibleTools) ? (
          <div className="flex w-full min-w-0 shrink-0 items-center rounded-md border border-border bg-muted/50 p-1 sm:w-auto">
            {visibleTools}
          </div>
        ) : null}
      </header>
      {pageTabs.length ? <div className="hidden" aria-hidden="true">{pageTabs}</div> : null}
    </>
  )
}

function splitPageTabs(node: ReactNode): { visibleTools: ReactNode; pageTabs: ReactNode[] } {
  const pageTabs: ReactNode[] = []
  const visit = (value: ReactNode): ReactNode[] => Children.toArray(value).flatMap(child => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return hasRenderableContent(child) ? [child] : []
    if (child.type === PageHeaderTabsList) {
      pageTabs.push(child)
      return []
    }
    if (child.props.children === undefined) return [child]
    const children = visit(child.props.children)
    if (!hasRenderableContent(children)) return []
    return [cloneElement(child, undefined, children)]
  })
  return { visibleTools: visit(node), pageTabs }
}

function hasRenderableContent(node: ReactNode): boolean {
  return Children.toArray(node).some(child => {
    if (child === null || child === undefined || typeof child === 'boolean') return false
    if (typeof child === 'string') return child.trim().length > 0
    if (typeof child === 'number') return true
    if (isValidElement<{ children?: ReactNode }>(child) && child.props.children !== undefined) return hasRenderableContent(child.props.children)
    return true
  })
}

type PageHeaderTabsListProps = ComponentPropsWithoutRef<typeof BaseTabsList>

export function PageHeaderTabsList({ className, ...props }: PageHeaderTabsListProps) {
  const registration = useNavigationSubmenuRegistration()
  const tabs = useContext(TabsNavigationContext)
  const ownerId = useId()
  const items = useMemo(() => Children.toArray(props.children).flatMap(child => {
    if (!isValidElement<{ value?: string; children?: ReactNode }>(child) || typeof child.props.value !== 'string') return []
    const label = textLabel(child.props.children)
    return label ? [{ id: child.props.value, label, icon: sectionIcon(child.props.value, label) }] : []
  }), [props.children])
  const ariaLabel = typeof props['aria-label'] === 'string' ? props['aria-label'] : 'Page sections'
  useEffect(() => {
    if (!registration || !tabs || items.length < 2) return
    registration.register({ ownerId, ariaLabel, activeId: tabs.value, items, onSelect: tabs.onValueChange })
    return () => registration.unregister(ownerId)
  }, [registration, tabs, items, ownerId, ariaLabel])
  if (registration && tabs && items.length >= 2) return null
  return <BaseTabsList className={cn('w-full border-0 bg-transparent p-0 sm:w-auto', className)} {...props} />
}

const sectionIcons: Record<string, LucideIcon> = {
  'pending': Clock,
  'history': History,
  'current stock': Package,
  'receive stock': PackagePlus,
  'grn history': FileClock,
  'stock return': RotateCcw,
  'stock audit': ClipboardCheck,
  'stock history': History,
  'new cashout': Banknote,
  'corrections': BadgeCheck,
  'vendors & parties': Building2,
  'invoices': ReceiptText,
  'payment corrections': BadgeCheck,
  'balances': Wallet,
  'cutover planning': ClipboardCheck,
  'workflow preview': FileText,
  'loans': HandCoins,
  'loan details': FileText,
  'new loan': Banknote,
  'record repayment': HandCoins,
  'repayment history': History,
  'new payment': Banknote,
  'payment history': History,
  'cheques': Landmark,
  'staff': Users,
  'operations': SlidersHorizontal,
  'pos': ScanBarcode,
  'staff notifications': Bell,
  'business identity': Building2,
  'update password': KeyRound,
  'billing': ShoppingCart,
  'dashboard': ChartPie,
  'bills': ReceiptText,
}

function sectionIcon(id: string, label: string): LucideIcon | undefined {
  const normalizedLabel = label.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase()
  return sectionIcons[normalizedLabel] ?? sectionIcons[id.toLowerCase()]
}

function textLabel(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textLabel).join(' ').replace(/\s+/g, ' ').trim()
  if (isValidElement<{ children?: ReactNode }>(node)) return textLabel(node.props.children)
  return ''
}

type PageHeaderTabProps = ComponentPropsWithoutRef<typeof BaseTabsTrigger>

export function PageHeaderTab({ className, ...props }: PageHeaderTabProps) {
  return (
    <BaseTabsTrigger
      className={cn(
        'min-h-8 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm',
        className,
      )}
      {...props}
    />
  )
}
