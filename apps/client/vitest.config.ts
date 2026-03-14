/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@nvg/shared': path.resolve(__dirname, '../../packages/shared/src'),
      'react-reconciler/constants': 'react-reconciler/constants.js'
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
  server: {
    port: 3001
  }
})
