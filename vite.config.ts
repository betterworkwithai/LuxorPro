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
  build: {
    // Lift the warning threshold so chunks split via manualChunks don't trip
    // the default 500 KB warning. We're intentionally large; the manualChunks
    // map below is what keeps these out of the landing's critical path.
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      output: {
        // Split heavy vendor libs out of the main app chunk so the landing
        // page doesn't pay for PDF.js, tesseract, etc. it never uses. Each
        // chunk also caches independently in the browser between deploys.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          // React + ReactDOM + scheduler + router MUST share a chunk — they
          // share runtime internals (`__SECRET_INTERNALS_DO_NOT_USE…`) that
          // break when ReactDOM is loaded from a different chunk than React.
          if (id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/react/') ||
              id.includes('node_modules/react-router/') ||
              id.includes('node_modules/react-router-dom/') ||
              id.includes('node_modules/scheduler/'))          return 'vendor-react'
          if (id.includes('node_modules/@radix-ui/'))          return 'vendor-radix'
          if (id.includes('node_modules/recharts/') ||
              id.includes('node_modules/d3-'))                 return 'vendor-charts'
          if (id.includes('node_modules/@supabase/'))          return 'vendor-supabase'
          if (id.includes('node_modules/pdfjs-dist/'))         return 'vendor-pdfjs'
          if (id.includes('node_modules/tesseract.js'))        return 'vendor-tesseract'
          if (id.includes('node_modules/jspdf'))               return 'vendor-jspdf'
          if (id.includes('node_modules/html2canvas'))         return 'vendor-html2canvas'
          if (id.includes('node_modules/framer-motion/'))      return 'vendor-framer'
          if (id.includes('node_modules/xlsx/'))               return 'vendor-xlsx'
          // NOTE: do NOT route @sentry or posthog-js here — they are
          // dynamically imported inside src/lib/analytics.ts and Vite
          // handles the lazy chunk for us. A manualChunks rule on a
          // dynamic-only module emits an empty named chunk and (worse)
          // can swallow the actual code in some Rollup versions.
          if (id.includes('node_modules/lucide-react/'))       return 'vendor-icons'
          if (id.includes('node_modules/date-fns/'))           return 'vendor-date-fns'
        },
      },
    },
  },
})
