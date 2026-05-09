import { LoaderCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

type LoadingScreenProps = {
  message: string
}

export function LoadingScreen({ message }: LoadingScreenProps) {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-8">
      <Card className="w-full max-w-xl rounded-[30px] border-white/70 bg-white/80">
        <CardContent className="grid gap-5 p-8 text-center sm:p-10">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-[20px] bg-linear-to-b from-emerald-400 to-emerald-600 text-lg font-black text-emerald-950 shadow-lg shadow-emerald-500/20">
            OT
          </div>
          <div className="space-y-2">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-muted-foreground">Firebase Sync</p>
            <h1 className="text-3xl font-black tracking-tight text-foreground">Preparing Workspace</h1>
            <p className="text-sm leading-7 text-muted-foreground">{message}</p>
          </div>
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border/80 bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Syncing data
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
