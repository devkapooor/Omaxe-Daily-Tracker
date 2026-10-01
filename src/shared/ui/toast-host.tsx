import type { AppToast } from '@/app/uiHelpers'

export function ToastHost({ toast }: { toast: AppToast | null }) {
  if (!toast) return null

  return (
    <div
      aria-live="polite"
      className="fixed right-3 top-18 z-[120] max-w-sm rounded-xl border border-cyan-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(236,253,255,0.98))] px-3 py-2 text-xs font-semibold text-cyan-800 shadow-[0_18px_42px_rgba(38,78,118,0.16)] sm:text-sm xl:top-18"
      role="status"
    >
      {toast.message}
    </div>
  )
}
