import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  server: {
    port: 5173
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
})
