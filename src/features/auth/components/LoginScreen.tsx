import { useMemo, useState } from 'react'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { TypewriterEffectSmooth } from '@/shared/ui/typewriter-effect'

type LoginScreenProps = {
  authError: string | null
  isBusy: boolean
  onLogin: (email: string, password: string) => Promise<void>
}

export function LoginScreen({ authError, isBusy, onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const heroWords = useMemo(
    () => [
      { text: 'Alpha', className: 'text-foreground' },
      { text: 'Hub', className: 'text-blue-600' },
    ],
    [],
  )

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email.trim() || password.length < 6) {
      setError('Use a valid email and a password with at least 6 characters.')
      return
    }

    try {
      setError('')
      setSuccessMessage('')
      await onLogin(email.trim(), password)
    } catch {
      setPassword('')
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-8">
      <Card variant="quiet" className="w-full max-w-7xl overflow-hidden rounded-[32px] border-white/70 bg-white/80">
        <CardContent className="grid p-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,430px)]">
          <section className="grid content-center gap-5 bg-[radial-gradient(circle_at_12%_12%,rgba(255,249,145,0.58),transparent_30%),radial-gradient(circle_at_top_right,rgba(70,130,180,0.24),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0.02))] px-6 py-10 sm:px-8 lg:px-12 lg:py-14">
            <TypewriterEffectSmooth
              words={heroWords}
              className="my-0 text-[clamp(1.9rem,4vw,4.3rem)] font-black tracking-[-0.04em] text-foreground"
              cursorClassName="h-[clamp(26px,4vw,56px)] w-[5px] rounded-full bg-linear-to-b from-blue-400 to-blue-700"
            />
            <p className="max-w-2xl text-base leading-8 text-muted-foreground">
              Shared finance tracking for expenses, purchases, vendors, loans, cash movement, and cheque planning across every device.
            </p>
            <div className="flex flex-wrap gap-3">
              <div className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border/80 bg-white/70 px-4 text-sm font-semibold text-foreground shadow-sm">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Owner-approved access
              </div>
              <div className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border/80 bg-white/70 px-4 text-sm font-semibold text-foreground shadow-sm">
                <ArrowRight className="h-4 w-4 text-blue-600" />
                Live shared workspace
              </div>
            </div>
          </section>

          <section className="grid content-center bg-white/55 px-6 py-10 backdrop-blur-xl sm:px-8 lg:px-10">
            <div className="space-y-2">
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-muted-foreground">Access</p>
              <h1 className="text-3xl font-black tracking-tight text-foreground">Open the workspace</h1>
              <p className="text-sm leading-7 text-muted-foreground">Sign in with the account details created for you by the owner.</p>
            </div>

            <div className="mt-8">
              <form className="grid gap-5" onSubmit={handleLogin}>
                <label className="grid gap-2 text-sm font-semibold text-foreground">
                  <span>Email</span>
                  <Input
                    aria-label="Email"
                    autoComplete="email"
                    placeholder="name@company.com"
                    type="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value)
                      setError('')
                      setSuccessMessage('')
                    }}
                  />
                </label>

                <label className="grid gap-2 text-sm font-semibold text-foreground">
                  <span>Password</span>
                  <Input
                    aria-label="Password"
                    autoComplete="current-password"
                    placeholder="Enter password"
                    type="password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value)
                      setError('')
                      setSuccessMessage('')
                    }}
                  />
                </label>

                {(error || authError) && <p className="text-sm font-semibold text-destructive">{error || authError}</p>}
                {successMessage && <p className="text-sm font-semibold text-emerald-700">{successMessage}</p>}

                <Button className="h-12 rounded-2xl text-sm font-bold" disabled={isBusy}>
                  {isBusy ? 'Signing In...' : 'Open Workspace'}
                </Button>
              </form>
            </div>
          </section>
        </CardContent>
      </Card>
    </main>
  )
}

