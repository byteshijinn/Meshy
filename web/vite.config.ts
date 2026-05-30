import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      // SSE event stream proxy to the backend daemon.
      '/events': {
        target: 'http://localhost:9120',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['cache-control'] = 'no-cache'
            proxyRes.headers['x-accel-buffering'] = 'no'
          })
        },
      },
      // JSON-RPC over HTTP POST proxy to the backend daemon.
      '/rpc': {
        target: 'http://localhost:9120',
        changeOrigin: true,
      },
      // WebSocket proxy for development.
      '/ws': {
        target: 'ws://localhost:9120',
        ws: true,
      },
    },
  },
})
