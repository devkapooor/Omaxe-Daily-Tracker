import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '@/shared/lib/firebase'
import { TelegramAlertsSettings } from './components/TelegramAlertsSettings'
import '@/styles/global.css'

function TelegramAlertsEntry() {
  const [session, setSession] = useState<{ ready: boolean; user: User | null }>({ ready: false, user: null })
  useEffect(() => onAuthStateChanged(auth, user => setSession({ ready: true, user })), [])
  return <main className="mx-auto max-w-3xl p-4 sm:p-6">
    <a className="text-sm underline" href="/">Back to AlphaHub</a>
    <h1 className="mt-4 text-xl font-semibold">Telegram alerts</h1>
    {!session.ready ? <p className="mt-4" role="status">Checking your AlphaHub session...</p>
      : session.user ? <TelegramAlertsSettings />
        : <p className="mt-4">Sign in to <a className="underline" href="/">AlphaHub</a> as the owner, then return to this page to manage Telegram alerts.</p>}
  </main>
}

createRoot(document.getElementById('root')!).render(<TelegramAlertsEntry />)
