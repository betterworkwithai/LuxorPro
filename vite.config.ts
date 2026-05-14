import { defineConfig } from "vite"
import react from "@vitejs/plugin-react-swc"
import path from "path"

// VITE_BASE=./ is set by the electron:build script so that asset paths
// in the Electron dist/ are relative (required for the file:// protocol).
// Web and Capacitor builds use the default base: '/'.
const base = (process.env.VITE_BASE as string) ?? '/'

export default defineConfig({
  base,
  server: {
    host: "::",
    port: 8080,
    strictPort: true,
    hmr: { overlay: false },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
})
