import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/natation-app/',     // nom exact du repo
  server: { port: 5173, open: true, host: true },
})
