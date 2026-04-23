// Standalone app — routes live at the root.
export const pfPath = (p: string) => {
  if (!p || p === '/') return '/'
  return p.startsWith('/') ? p : `/${p}`
}
