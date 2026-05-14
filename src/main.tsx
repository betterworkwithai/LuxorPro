import { createRoot } from "react-dom/client"
import { BrowserRouter, HashRouter } from "react-router-dom"
import App from "./App.tsx"
import "./index.css"
import { initAnalytics } from "./lib/analytics"

// Initialize PostHog (funnel analytics) + Sentry (error monitoring) before
// React mounts. Wrappers no-op silently if env vars are missing.
initAnalytics()

// file:// protocol (packaged Electron) requires HashRouter; HTTP(S) uses BrowserRouter
const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter

createRoot(document.getElementById("root")!).render(
  <Router>
    <App />
  </Router>
)
