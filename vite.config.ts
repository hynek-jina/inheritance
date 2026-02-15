import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import wasm from 'vite-plugin-wasm'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    wasm(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Bitcoin Testnet Wallet',
        short_name: 'BTC Testnet',
        description: 'Bitcoin testnet peněženka s dědickými účty',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: '/icon-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}']
      }
    })
  ],
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    exclude: ['tiny-secp256k1']
  }
})