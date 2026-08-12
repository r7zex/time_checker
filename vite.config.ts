import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/time_checker/',
  plugins: [react()],
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  server: {
    host: 'localhost',
    port: 5173,
  },
  preview: {
    host: 'localhost',
    port: 4173,
  },
})
