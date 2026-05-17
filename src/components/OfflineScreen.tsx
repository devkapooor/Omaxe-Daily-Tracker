import { WifiOff } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

export function OfflineScreen() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-8">
      <Card className="w-full max-w-xl rounded-[30px] border-white/70 bg-white/88 shadow-[0_22px_60px_rgba(24,32,27,0.12)]">
        <CardContent className="grid gap-5 p-8 text-center sm:p-10">
          <div className="mx-auto grid h-24 w-24 place-items-center rounded-[28px] bg-secondary/75 shadow-[0_18px_42px_rgba(24,32,27,0.08)]">
            <WifiOff className="h-10 w-10 text-foreground" />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-muted-foreground">Offline</p>
            <h1 className="text-3xl font-black tracking-tight text-foreground">Internet required</h1>
            <p className="text-sm leading-7 text-muted-foreground">
              Omaxe Daily Tracker uses live Firebase login and shared business data. Reconnect to the internet to open the workspace.
            </p>
          </div>
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border/80 bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
            Waiting for connection
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
