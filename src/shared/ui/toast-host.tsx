import type { AppToast } from '@/app/uiHelpers'

export function ToastHost({ toast }: { toast: AppToast | null }) {
  if (!toast) return null

  return (
    <div
      aria-live="polite"
      className="fixed right-3 top-18 z-[120] max-w-sm rounded-xl border border-[#5f4823] bg-[linear-gradient(180deg,rgba(49,38,20,0.96),rgba(37,28,15,0.94))] px-3 py-2 text-xs font-semibold text-amber-100 shadow-xl sm:text-sm xl:top-18"
      role="status"
    >
      {toast.message}
    </div>
  )
}
