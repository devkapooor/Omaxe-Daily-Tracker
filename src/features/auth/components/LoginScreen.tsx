import { useState } from 'react'
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion'
import { ArrowRight, Building2, Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react'
import { Input } from '@/shared/ui/input'

type LoginScreenProps = {
  authError: string | null
  isBusy: boolean
  onLogin: (email: string, password: string) => Promise<void>
}

type FocusedField = 'email' | 'password' | null

export function LoginScreen({ authError, isBusy, onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [focusedField, setFocusedField] = useState<FocusedField>(null)
  const [showPassword, setShowPassword] = useState(false)
  const prefersReducedMotion = useReducedMotion()
  const pointerX = useMotionValue(0)
  const pointerY = useMotionValue(0)
  const rotateX = useTransform(pointerY, [-260, 260], [4, -4])
  const rotateY = useTransform(pointerX, [-260, 260], [-4, 4])

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email.trim() || password.length < 6) {
      setError('Use a valid email and a password with at least 6 characters.')
      return
    }

    try {
      setError('')
      await onLogin(email.trim(), password)
    } catch {
      setPassword('')
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (prefersReducedMotion || event.pointerType !== 'mouse') return
    const rect = event.currentTarget.getBoundingClientRect()
    pointerX.set(event.clientX - rect.left - rect.width / 2)
    pointerY.set(event.clientY - rect.top - rect.height / 2)
  }

  function resetTilt() {
    pointerX.set(0)
    pointerY.set(0)
  }

  return (
    <main className="relative grid min-h-[100dvh] place-items-center overflow-hidden px-4 py-8 text-foreground">
      <div className="pointer-events-none absolute left-1/2 top-6 z-10 flex -translate-x-1/2 items-center gap-2 text-blue-700/80 dark:text-blue-300/90">
        <Building2 className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
        <span className="text-[11px] font-extrabold uppercase tracking-[0.26em]">AlphaHub</span>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.65, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-[390px]"
        style={{ perspective: 1400 }}
      >
        <motion.div
          className="group relative"
          style={prefersReducedMotion ? undefined : { rotateX, rotateY }}
          onPointerLeave={resetTilt}
          onPointerMove={handlePointerMove}
        >
          <div className="absolute -inset-5 rounded-[36px] bg-blue-500/12 opacity-70 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />
          <div className="absolute -inset-px overflow-hidden rounded-[25px]">
            <motion.span
              aria-hidden="true"
              className="absolute left-0 top-0 h-px w-1/2 bg-linear-to-r from-transparent via-cyan-200 to-transparent shadow-[0_0_14px_rgba(34,211,238,0.8)]"
              animate={prefersReducedMotion ? undefined : { x: ['-100%', '300%'] }}
              transition={{ duration: 3.8, repeat: Infinity, repeatDelay: 0.8, ease: 'easeInOut' }}
            />
            <motion.span
              aria-hidden="true"
              className="absolute bottom-0 right-0 h-px w-1/2 bg-linear-to-r from-transparent via-blue-300 to-transparent shadow-[0_0_14px_rgba(59,130,246,0.8)]"
              animate={prefersReducedMotion ? undefined : { x: ['100%', '-300%'] }}
              transition={{ duration: 3.8, repeat: Infinity, repeatDelay: 0.8, delay: 1.9, ease: 'easeInOut' }}
            />
          </div>

          <section className="relative overflow-hidden rounded-[24px] border border-blue-100 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(244,248,252,0.94))] p-5 shadow-[0_32px_90px_rgba(38,78,118,0.2)] backdrop-blur-2xl sm:p-6 dark:border-border dark:bg-none dark:bg-card/95 dark:shadow-black/40">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-[0.035]"
              style={{
                backgroundImage: 'linear-gradient(135deg,#2563eb 0.5px,transparent 0.5px),linear-gradient(45deg,#22d3ee 0.5px,transparent 0.5px)',
                backgroundSize: '28px 28px',
              }}
            />
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-10 top-0 h-24 bg-cyan-300/8 blur-3xl" />

            <div className="relative text-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.5, delay: 0.1 }}
                className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-cyan-200 bg-cyan-50 text-cyan-700 shadow-[0_12px_34px_rgba(8,145,178,0.12)] dark:border-info/30 dark:bg-info/10 dark:text-info"
              >
                <ShieldCheck className="h-5 w-5" />
              </motion.div>
              <p className="mt-4 text-[10px] font-extrabold uppercase tracking-[0.24em] text-cyan-700 dark:text-info">Secure Workspace</p>
              <h1 className="mt-1 text-2xl font-bold tracking-[-0.035em] text-foreground">Welcome back</h1>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">Sign in with the account created for you by the owner.</p>
            </div>

            <form className="relative mt-6 grid gap-3.5" onSubmit={handleLogin}>
              <label className="grid gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-secondary-foreground">
                Email
                <div className="relative">
                  <Mail className={`pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 transition-colors ${focusedField === 'email' ? 'text-cyan-600' : 'text-muted-foreground'}`} />
                  <Input
                    aria-label="Email"
                    autoComplete="email"
                    placeholder="name@company.com"
                    type="email"
                    className="h-10 border-blue-200 bg-white/90 pl-10 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-cyan-400 focus-visible:ring-cyan-400/12 dark:border-input dark:bg-background/70"
                    value={email}
                    onBlur={() => setFocusedField(null)}
                    onChange={(event) => {
                      setEmail(event.target.value)
                      setError('')
                    }}
                    onFocus={() => setFocusedField('email')}
                  />
                </div>
              </label>

              <label className="grid gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-secondary-foreground">
                Password
                <div className="relative">
                  <Lock className={`pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 transition-colors ${focusedField === 'password' ? 'text-cyan-600' : 'text-muted-foreground'}`} />
                  <Input
                    aria-label="Password"
                    autoComplete="current-password"
                    placeholder="Enter password"
                    type={showPassword ? 'text' : 'password'}
                    className="h-10 border-blue-200 bg-white/90 pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-cyan-400 focus-visible:ring-cyan-400/12 dark:border-input dark:bg-background/70"
                    value={password}
                    onBlur={() => setFocusedField(null)}
                    onChange={(event) => {
                      setPassword(event.target.value)
                      setError('')
                    }}
                    onFocus={() => setFocusedField('password')}
                  />
                  <button
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-1.5 top-1/2 z-10 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-cyan-50 hover:text-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-info/10 dark:hover:text-info"
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>

              {(error || authError) ? (
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-destructive/30 dark:bg-destructive/10 dark:text-destructive">
                  {error || authError}
                </motion.p>
              ) : null}

              <motion.button
                whileHover={prefersReducedMotion ? undefined : { scale: 1.015 }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.985 }}
                className="group/button relative mt-1 flex h-10 items-center justify-center overflow-hidden rounded-xl border border-cyan-200/20 bg-[linear-gradient(90deg,#0891b2,#2563eb)] px-4 text-sm font-bold text-white shadow-[0_14px_34px_rgba(37,99,235,0.3)] transition-[filter,box-shadow] hover:brightness-110 hover:shadow-[0_16px_40px_rgba(37,99,235,0.4)] disabled:cursor-not-allowed disabled:opacity-65"
                disabled={isBusy}
                type="submit"
              >
                <AnimatePresence mode="wait" initial={false}>
                  {isBusy ? (
                    <motion.span key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-4 w-4 rounded-full border-2 border-white/35 border-t-white motion-safe:animate-spin" />
                  ) : (
                    <motion.span key="ready" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                      Open Workspace
                      <ArrowRight className="h-4 w-4 transition-transform group-hover/button:translate-x-0.5" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            </form>

            <p className="relative mt-5 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Owner-approved access only
            </p>
          </section>
        </motion.div>
      </motion.div>
    </main>
  )
}
