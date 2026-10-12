import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) }
  },
  server: {
    // MIRROR_API_TARGET=http://192.168.1.185:4174 previews against the Pi's real data.
    proxy: {
      "/api": process.env.MIRROR_API_TARGET || "http://localhost:4174",
      "/media": process.env.MIRROR_API_TARGET || "http://localhost:4174",
      "/screensaver": process.env.MIRROR_API_TARGET || "http://localhost:4174"
    }
  }
});
