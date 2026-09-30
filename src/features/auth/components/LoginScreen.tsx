import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
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
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className="w-full max-w-5xl"
      >
        <Card variant="quiet" className="w-full overflow-hidden border-white/80 bg-white/72 text-slate-950 shadow-[0_30px_100px_rgba(30,64,175,0.18)] backdrop-blur-2xl">
          <CardContent className="grid p-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,396px)]">
          <section className="grid content-center gap-5 border-b border-blue-100/80 bg-[radial-gradient(circle_at_16%_18%,rgba(34,211,238,0.18),transparent_28%),radial-gradient(circle_at_88%_10%,rgba(99,102,241,0.14),transparent_34%),linear-gradient(145deg,rgba(239,249,255,0.94),rgba(238,242,255,0.76))] px-5 py-8 sm:px-7 lg:border-b-0 lg:border-r lg:px-8 lg:py-10">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-200 bg-white/80 text-cyan-700 shadow-[0_12px_30px_rgba(8,145,178,0.16)]">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="space-y-2.5">
              <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-cyan-700">AlphaHub</p>
              <h1 className="max-w-xl text-[clamp(2rem,3.8vw,3.5rem)] font-black tracking-[-0.04em] text-slate-950">
                Finance operations, compact and connected.
              </h1>
              <p className="max-w-xl text-[14px] leading-7 text-slate-600">
                Shared expense, purchase, vendor, loan, cash movement, and cheque planning records for the full workspace.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {trustNotes.map((note, index) => (
                <div
                  key={note}
                  className="rounded-[16px] border border-white/90 bg-white/62 px-3 py-2.5 text-[12px] font-semibold text-slate-700 shadow-sm backdrop-blur"
                >
                  <div className="mb-1 flex items-center gap-2 text-indigo-600">
                    {index === 0 ? <ShieldCheck className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
                    <span className="text-[10px] uppercase tracking-[0.18em]">Access</span>
                  </div>
                  {note}
                </div>
              ))}
            </div>
          </section>

          <section className="grid content-center bg-white/74 px-5 py-8 sm:px-7 lg:px-8 lg:py-10">
            <div className="space-y-2">
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-indigo-600">Access</p>
              <h2 className="text-[1.8rem] font-black tracking-tight text-slate-950">Open the workspace</h2>
              <p className="text-[13px] leading-6 text-slate-600">Sign in with the account details created for you by the owner.</p>
            </div>

            <div className="mt-6">
              <form className="grid gap-4" onSubmit={handleLogin}>
                <label className="grid gap-2 text-sm font-semibold text-slate-800">
                  <span>Email</span>
                  <Input
                    aria-label="Email"
                    autoComplete="email"
                    placeholder="name@company.com"
                    type="email"
                    className="border-blue-200 text-slate-950 placeholder:text-slate-400 focus-visible:ring-blue-500"
                    style={{ background: 'rgba(255, 255, 255, 0.88)' }}
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value)
                      setError('')
                      setSuccessMessage('')
                    }}
                  />
                </label>

                <label className="grid gap-2 text-sm font-semibold text-slate-800">
                  <span>Password</span>
                  <Input
                    aria-label="Password"
                    autoComplete="current-password"
                    placeholder="Enter password"
                    type="password"
                    className="border-blue-200 text-slate-950 placeholder:text-slate-400 focus-visible:ring-blue-500"
                    style={{ background: 'rgba(255, 255, 255, 0.88)' }}
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

                <Button
                  className="mt-1 h-10 rounded-xl border-0 text-[13px] font-bold text-white shadow-[0_12px_28px_rgba(37,99,235,0.24)] hover:brightness-110"
                  disabled={isBusy}
                  style={{ background: 'linear-gradient(90deg, #0891b2, #4f46e5)' }}
                >
                  {isBusy ? 'Signing In...' : 'Open Workspace'}
                </Button>
              </form>
            </div>
          </section>
          </CardContent>
        </Card>
      </motion.div>
    </main>
  )
}

