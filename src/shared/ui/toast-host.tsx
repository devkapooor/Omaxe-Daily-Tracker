import type { AppToast } from '@/app/uiHelpers'

export function ToastHost({ toast }: { toast: AppToast | null }) {
  if (!toast) return null

  return (
    <div
      aria-live="polite"
      className="fixed right-3 top-18 z-[120] max-w-sm rounded-xl border border-cyan-400/30 bg-[linear-gradient(180deg,rgba(15,48,72,0.98),rgba(8,31,50,0.97))] px-3 py-2 text-xs font-semibold text-cyan-50 shadow-[0_18px_42px_rgba(1,10,20,0.4)] sm:text-sm xl:top-18"
      role="status"
    >
      {toast.message}
    </div>
  )
}
