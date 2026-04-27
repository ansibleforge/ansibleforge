import { defineConfig } from 'vite'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/ansibleforge/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        slideshow: resolve(__dirname, 'slideshow.html'),
        edaDemos: resolve(__dirname, 'eda-demos.html'),
        trustedAutomation: resolve(__dirname, 'decks/security-collab-eda/index.html'),
      },
    },
  },
})
