import { defineConfig } from 'vite'
import { resolve } from 'path'
import { existsSync } from 'fs'

export default defineConfig({
  base: '/human-head-viewer/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    fs: {
      // Allow serving files from outside the project root
      allow: (() => {
        const paths = ['.'];

        // Optional: Add custom paths from vite.config.local.js if it exists
        const localConfigPath = resolve(__dirname, 'vite.config.local.js');
        if (existsSync(localConfigPath)) {
          try {
            const localConfig = require(localConfigPath);
            if (localConfig.symlinkPaths && Array.isArray(localConfig.symlinkPaths)) {
              paths.push(...localConfig.symlinkPaths);
            }
          } catch (e) {
            console.warn('Could not load vite.config.local.js:', e.message);
          }
        }

        return paths;
      })()
    }
  },
  resolve: {
    // Preserve symlinks instead of resolving them
    preserveSymlinks: false
  }
})
