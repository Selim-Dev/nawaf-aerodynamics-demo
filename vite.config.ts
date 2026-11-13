import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' keeps every asset URL relative, so the build works from any
// sub-path and inside an iframe on the client's existing site.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true },
  preview: { host: true },
  // three.js alone is ~650 kB minified; one ~390 kB gzipped bundle is expected for a 3D page.
  build: { chunkSizeWarningLimit: 1600 },
})
