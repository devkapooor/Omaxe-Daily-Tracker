import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
const demoEnv = {
  VITE_FIREBASE_API_KEY: 'drill-emulator-key', VITE_FIREBASE_AUTH_DOMAIN: 'demo-alphahub-drill.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-alphahub-drill', VITE_FIREBASE_STORAGE_BUCKET: 'demo-alphahub-drill.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789', VITE_FIREBASE_APP_ID: '1:123456789:web:drill',
  VITE_USE_FIREBASE_EMULATORS: 'true', VITE_LOCAL_AUTH_BYPASS: 'false', VITE_LOCAL_AUTH_EMAIL: '', VITE_LOCAL_AUTH_PASSWORD: '',
}
export default defineConfig({
  envDir: path.resolve('tests/drill/no-env'),
  define: Object.fromEntries(Object.entries(demoEnv).map(([name, value]) => [`import.meta.env.${name}`, JSON.stringify(value)])),
  plugins: [react(), tailwindcss()], resolve: { alias: { '@': path.resolve('src') } },
  server: { host: '127.0.0.1', port: 5178, strictPort: true, watch: { ignored: ['**/output/**', '**/docs/**', '**/tests/drill/**/*.cjs', '**/tests/drill/**/*.json', '**/tests/drill/**/*.py', '**/drill.md'] } },
})
