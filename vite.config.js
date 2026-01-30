import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/syntax-striker/',
  server: {
    port: 5173
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
})
