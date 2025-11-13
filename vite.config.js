import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  base: '/human-head-viewer/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    fs: {
      // Allow serving files from outside the project root
      allow: [
        // Allow the project directory itself
        '.',
        // Allow the actual directories that symlinks point to
        '/Users/thomasribeiro/Documents/tissue_database',
        '/Users/thomasribeiro/Documents/mida'
      ]
    }
  },
  resolve: {
    // Preserve symlinks instead of resolving them
    preserveSymlinks: false
  }
})
