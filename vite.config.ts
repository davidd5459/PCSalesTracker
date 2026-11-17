import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // In development, forward API calls to the local API server (server/dev.ts).
    proxy: { "/api": "http://localhost:3001" },
  },
});
