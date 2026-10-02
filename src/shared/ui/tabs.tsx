import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/shared/lib/utils'

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'grid w-full auto-cols-fr grid-flow-col items-center gap-0.75 rounded-[16px] border border-border/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,246,252,0.96))] p-0.5 text-muted-foreground shadow-[0_8px_20px_rgba(38,78,118,0.07)] dark:bg-none dark:bg-card dark:shadow-black/20',
      className,
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex min-h-7 items-center justify-center rounded-lg px-2 py-1 text-[9px] leading-none font-semibold whitespace-nowrap tracking-[0.02em] transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=active]:bg-[linear-gradient(180deg,#4b91f7,#2563eb)] data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_6px_16px_rgba(37,99,235,0.24)] min-w-0 sm:text-[10px]',
      className,
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn('mt-1 min-h-0 outline-none', className)} {...props} />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }

