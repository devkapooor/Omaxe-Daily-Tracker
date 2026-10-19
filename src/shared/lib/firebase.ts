import { getApp, getApps, initializeApp, type FirebaseOptions } from 'firebase/app'
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'

const env = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env

const firebaseConfig: FirebaseOptions = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

function missingFirebaseConfig() {
  return Object.entries(firebaseConfig)
    .filter(([, value]) => !value)
    .map(([key]) => key)
}

const missingKeys = missingFirebaseConfig()

if (missingKeys.length > 0) {
  throw new Error(`Missing Firebase environment variables: ${missingKeys.join(', ')}`)
}

export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
export function configureAuthEmulator(instance: Auth) {
  if (env.VITE_USE_FIREBASE_EMULATORS !== 'true') return
  if (firebaseConfig.projectId !== 'demo-alphahub-drill' || typeof window === 'undefined' || !['localhost', '127.0.0.1'].includes(window.location.hostname)) throw new Error('Local Firebase emulator configuration is invalid; no authentication request was sent.')
  if (!instance.emulatorConfig) connectAuthEmulator(instance, 'http://127.0.0.1:9099', { disableWarnings: true })
}
export const auth = getAuth(firebaseApp)
configureAuthEmulator(auth)
export const db = getFirestore(firebaseApp)
export const functions = getFunctions(firebaseApp, 'asia-south1')
if (env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
}
export const isLocalAuthBypassEnabled =
  env.VITE_LOCAL_AUTH_BYPASS === 'true' &&
  typeof window !== 'undefined' &&
  ['localhost', '127.0.0.1'].includes(window.location.hostname)
export const localBypassCredentials = {
  email: env.VITE_LOCAL_AUTH_EMAIL ?? '',
  password: env.VITE_LOCAL_AUTH_PASSWORD ?? '',
}
export { firebaseConfig }
