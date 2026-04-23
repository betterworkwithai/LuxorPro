// Base path where the Luxor app is mounted in the host site.
export const PF_BASE = '/luxor'

// Build an absolute route under the Luxor base. Pass '/' for the index.
export const pfPath = (p: string) => {
  if (!p || p === '/') return PF_BASE
  return PF_BASE + (p.startsWith('/') ? p : `/${p}`)
}
