import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // Static previews (hash routing) are served from a sub-folder, so they need
  // relative asset paths. Production uses real URLs like /configurator.
  base: process.env.VITE_HASH_ROUTER ? './' : '/',
  build: {
    chunkSizeWarningLimit: 1200,
  },
})
