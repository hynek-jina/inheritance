import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import wasm from "vite-plugin-wasm";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    wasm(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Bitcoin Signet Wallet",
        short_name: "BTC Signet",
        description: "Bitcoin signet peněženka s dědickými účty",
        theme_color: "#1a1a2e",
        background_color: "#1a1a2e",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icon-192x192.svg",
            sizes: "192x192",
            type: "image/svg+xml",
          },
          {
            src: "/icon-512x512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,wasm}"],
      },
    }),
  ],
  define: {
    global: "globalThis",
  },
  optimizeDeps: {
    exclude: ["tiny-secp256k1"],
  },
  server: {
    proxy: {
      "/mempool-api": {
        target: "https://mempool.space/signet/api",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/mempool-api/, ""),
      },
    },
  },
});
