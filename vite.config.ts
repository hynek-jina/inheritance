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
        name: "Be Cool",
        short_name: "Be Cool",
        description: "Be Cool - bitcoin signet peněženka s dědickými účty",
        theme_color: "#8fd8ff",
        background_color: "#0f172a",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
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
