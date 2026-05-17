import { Card, CardContent } from '@/components/ui/card'
import UniqueLoading from '@/components/ui/morph-loading'

type LoadingScreenProps = {
  message: string
  mode?: 'page' | 'screen'
}

export function LoadingScreen({ message, mode = 'screen' }: LoadingScreenProps) {
  if (mode === 'page') {
    return (
      <div className="fixed inset-0 z-[135] flex items-center justify-center bg-slate-950/18 px-4 py-8 backdrop-blur-[2px]">
        <Card className="w-full max-w-sm rounded-[28px] border-white/70 bg-white/88 shadow-[0_20px_60px_rgba(24,32,27,0.14)]">
          <CardContent className="grid gap-4 p-6 text-center sm:p-7">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-[24px] bg-secondary/80 shadow-[0_14px_30px_rgba(24,32,27,0.08)]">
              <UniqueLoading size="sm" className="scale-[0.9]" />
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-muted-foreground">Workspace</p>
              <h2 className="text-xl font-black tracking-tight text-foreground">Opening Page</h2>
              <p className="text-sm leading-6 text-muted-foreground">{message}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-8">
      <Card className="w-full max-w-xl rounded-[30px] border-white/70 bg-white/80">
        <CardContent className="grid gap-5 p-8 text-center sm:p-10">
          <div className="mx-auto grid h-24 w-24 place-items-center rounded-[28px] bg-secondary/75 shadow-[0_18px_42px_rgba(24,32,27,0.08)]">
            <UniqueLoading size="md" />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-muted-foreground">Firebase Sync</p>
            <h1 className="text-3xl font-black tracking-tight text-foreground">Preparing Workspace</h1>
            <p className="text-sm leading-7 text-muted-foreground">{message}</p>
          </div>
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border/80 bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Syncing data
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
