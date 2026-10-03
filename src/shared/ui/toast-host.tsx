import type { AppToast } from '@/app/uiHelpers'

export function ToastHost({ toast }: { toast: AppToast | null }) {
  if (!toast) return null

  return (
    <div
      aria-live="polite"
      className="fixed right-4 top-16 z-[120] max-w-sm rounded-md border border-border bg-popover px-4 py-3 text-[13px] font-medium text-foreground shadow-lg sm:top-5 xl:top-5"
      role="status"
    >
      {toast.message}
    </div>
  )
}
