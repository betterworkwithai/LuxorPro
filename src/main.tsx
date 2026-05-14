import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import App from "./App.tsx"
import "./index.css"
import { initAnalytics } from "./lib/analytics"

// Initialize PostHog (funnel analytics) + Sentry (error monitoring) before
// React mounts. Wrappers no-op silently if env vars are missing.
initAnalytics()

window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled rejection:', e.reason)
})
window.addEventListener('error', (e) => {
  console.error('Uncaught error:', e.message, e.filename, e.lineno)
})

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
)
