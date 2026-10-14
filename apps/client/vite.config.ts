import preact from "@preact/preset-vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    preact(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-180.png"],
      manifest: {
        name: "WORLD",
        short_name: "WORLD",
        description: "The world of Veyra — a medieval fantasy MMORPG on the BLOCK chain.",
        display: "standalone",
        orientation: "any",
        background_color: "#141210",
        theme_color: "#141210",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  server: {
    allowedHosts: [".trycloudflare.com"],
    proxy: {
      "/colyseus": {
        target: "http://localhost:2567",
        ws: true,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/colyseus/, ""),
      },
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
