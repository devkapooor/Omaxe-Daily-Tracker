import { defineConfig, mergeConfig } from 'vite'
import path from 'node:path'
import baseConfig from './vite.config'

export default mergeConfig(baseConfig, defineConfig({
  publicDir: false,
  build: {
    outDir: path.resolve(__dirname, 'output/telegram-settings-dist'),
    assetsDir: 'telegram-assets',
    rollupOptions: { input: path.resolve(__dirname, 'telegram-settings.html') },
  },
}))
