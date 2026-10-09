import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3003,
    // Listen on all interfaces so the portal opens from a phone on the same
    // Wi-Fi (needed to test the Didit camera flow on a real mobile device).
    // The /api proxy target stays localhost — it runs on this machine.
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});
