import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,

  plugins: [
    react(),
  ],

  server: {
    // The administrative frontend must not listen on external interfaces.
    host: "127.0.0.1",
    port: 5174,

    proxy: {
      "/api": {
        target: "http://127.0.0.1:4174",
      },
    },
  },

  preview: {
    host: "127.0.0.1",
    port: 4175,
  },
});
