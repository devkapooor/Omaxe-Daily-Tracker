import { useState } from 'react'

type LoginScreenProps = {
  authError: string | null
  isBusy: boolean
  onLogin: (email: string, password: string) => Promise<void>
}

export function LoginScreen({ authError, isBusy, onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
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

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="login-logo">OT</div>
        <p className="eyebrow">Firebase Login</p>
        <h1>Welcome Back</h1>
        <p className="login-copy">Sign in with your Firebase email and password to open the shared workspace.</p>
        <form className="pin-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              aria-label="Email"
              autoComplete="email"
              placeholder="name@company.com"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                setError('')
              }}
            />
          </label>
          <label>
            Password
            <input
              aria-label="Password"
              autoComplete="current-password"
              placeholder="Enter password"
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                setError('')
              }}
            />
          </label>
          {(error || authError) && <p className="form-error">{error || authError}</p>}
          <button className="primary" disabled={isBusy}>
            {isBusy ? 'Signing In...' : 'Open Workspace'}
          </button>
        </form>
      </section>
    </main>
  )
}
