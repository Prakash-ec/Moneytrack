import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://127.0.0.1:8000'

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: false,
        },
      },
    },
    preview: {
      host: true,
      port: 4173,
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (id.includes('recharts') || id.includes('d3-')) return 'charts'
            if (id.includes('lucide-react')) return 'icons'
            if (id.includes('react-router')) return 'router'
            if (
              id.includes('react-hook-form') ||
              id.includes('@hookform') ||
              id.includes('zod')
            ) {
              return 'forms'
            }
            return 'vendor'
          },
        },
      },
    },
  }
})
