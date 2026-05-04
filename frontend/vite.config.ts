import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const API_URL = process.env.VITE_API_URL;

export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 3000,
    proxy: API_URL
      ? undefined
      : {
          "/api": {
            target: "http://localhost:5002",
            changeOrigin: true,
            ws: true,
          },
        },
  },
  preview: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: process.env.VITE_ALLOWED_HOSTS
      ? process.env.VITE_ALLOWED_HOSTS.split(",").map((h: string) => h.trim())
      : undefined,
    proxy: API_URL
      ? undefined
      : {
          "/api": {
            target: "http://localhost:5002",
            changeOrigin: true,
            ws: true,
          },
        },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
}));
