import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Local development stays on Vite's port while API calls remain
    // same-origin in application code. Vite forwards /api to FastAPI.
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
