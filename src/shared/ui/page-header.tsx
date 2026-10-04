import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'
import { TabsList as BaseTabsList, TabsTrigger as BaseTabsTrigger } from '@/shared/ui/tabs'

type PageHeaderProps = {
  title: string
  tools?: ReactNode
  className?: string
}

export function PageHeader({ title, tools, className }: PageHeaderProps) {
  return (
    <header className={cn(
      'flex min-h-20 flex-col justify-center gap-2 rounded-md border border-border bg-card p-page-header shadow-sm sm:flex-row sm:items-center sm:justify-between',
      className,
    )}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
      </div>
      {tools ? (
        <div className="flex w-full min-w-0 shrink-0 items-center rounded-md border border-border bg-muted/50 p-1 sm:w-auto">
          {tools}
        </div>
      ) : null}
    </header>
  )
}

type PageHeaderTabsListProps = ComponentPropsWithoutRef<typeof BaseTabsList>

export function PageHeaderTabsList({ className, ...props }: PageHeaderTabsListProps) {
  return <BaseTabsList className={cn('w-full border-0 bg-transparent p-0 sm:w-auto', className)} {...props} />
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
