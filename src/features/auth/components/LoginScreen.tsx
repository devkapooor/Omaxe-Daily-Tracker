import { useMemo, useState } from 'react'
import { ArrowRight, Building2, ShieldCheck } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'

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

  const trustNotes = useMemo(() => ['Owner-approved access', 'Live shared workspace', 'Firebase-backed records'], [])

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
    <main className="grid min-h-screen place-items-center px-4 py-6">
      <Card variant="quiet" className="w-full max-w-5xl overflow-hidden border-[#3e3323] bg-[linear-gradient(180deg,rgba(24,25,29,0.98),rgba(17,18,21,0.96))]">
        <CardContent className="grid p-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,396px)]">
          <section className="grid content-center gap-5 border-b border-border/70 bg-[radial-gradient(circle_at_18%_18%,rgba(214,176,108,0.18),transparent_22%),radial-gradient(circle_at_top_right,rgba(126,88,30,0.16),transparent_28%),linear-gradient(180deg,rgba(29,30,34,0.9),rgba(18,19,23,0.96))] px-5 py-8 sm:px-7 lg:border-b-0 lg:border-r lg:border-border/70 lg:px-8 lg:py-10">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#5b4527] bg-[linear-gradient(180deg,rgba(240,180,77,0.16),rgba(92,63,18,0.24))] text-[#d8a048] shadow-[0_10px_22px_rgba(0,0,0,0.2)]">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="space-y-2.5">
              <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#c5a56a]">AlphaHub</p>
              <h1 className="max-w-xl text-[clamp(2rem,3.8vw,3.5rem)] font-black tracking-[-0.04em] text-foreground">
                Finance operations, compact and connected.
              </h1>
              <p className="max-w-xl text-[14px] leading-7 text-muted-foreground">
                Shared expense, purchase, vendor, loan, cash movement, and cheque planning records for the full workspace.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {trustNotes.map((note, index) => (
                <div
                  key={note}
                  className="rounded-[16px] border border-border/70 bg-secondary/40 px-3 py-2.5 text-[12px] font-semibold text-foreground"
                >
                  <div className="mb-1 flex items-center gap-2 text-[#c5a56a]">
                    {index === 0 ? <ShieldCheck className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
                    <span className="text-[10px] uppercase tracking-[0.18em]">Access</span>
                  </div>
                  {note}
                </div>
              ))}
            </div>
          </section>

          <section className="grid content-center bg-[linear-gradient(180deg,rgba(20,21,24,0.84),rgba(16,17,20,0.96))] px-5 py-8 sm:px-7 lg:px-8 lg:py-10">
            <div className="space-y-2">
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#c5a56a]">Access</p>
              <h2 className="text-[1.8rem] font-black tracking-tight text-foreground">Open the workspace</h2>
              <p className="text-[13px] leading-6 text-muted-foreground">Sign in with the account details created for you by the owner.</p>
            </div>

            <div className="mt-6">
              <form className="grid gap-4" onSubmit={handleLogin}>
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

                <Button className="mt-1 h-10 rounded-xl text-[13px] font-bold" disabled={isBusy}>
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

