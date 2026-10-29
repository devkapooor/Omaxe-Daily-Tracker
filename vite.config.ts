import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [
    // Production bundles need Firebase's public config, never local login values.
    { name: 'public-build-env', apply: 'build', config: () => ({ envPrefix: 'VITE_FIREBASE_' }) },
    react(), tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Retain the isolated owner controls in later normal Hosting releases too.
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        telegram: path.resolve(__dirname, 'telegram-settings.html'),
      },
    },
  },
})
