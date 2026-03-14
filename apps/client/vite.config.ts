import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@nvg/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  server: {
    port: 3001
  }
})
