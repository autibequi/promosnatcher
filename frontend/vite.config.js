import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://promo-snatcher-backend:8000',
        changeOrigin: true,
      },
      '/r/': {
        target: 'http://promo-snatcher-backend:8000',
        changeOrigin: true,
      },
    },
  },
})
