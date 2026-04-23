// Base path where the Luxor dashboard is mounted.
const APP_BASE = '/app'

export const pfPath = (p: string) => {
  if (!p || p === '/') return APP_BASE
  return APP_BASE + (p.startsWith('/') ? p : `/${p}`)
}
