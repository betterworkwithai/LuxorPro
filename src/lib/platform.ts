// Runtime platform detection — safe to call in web context (no-ops when Capacitor is absent).
// Import from here instead of '@capacitor/core' directly so the web build
// doesn't need Capacitor installed at runtime.

let _capacitor: { isNativePlatform: () => boolean; getPlatform: () => string } | null = null

function cap() {
  if (_capacitor) return _capacitor
  try {
    // Capacitor injects itself as window.Capacitor at runtime
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    if (w?.Capacitor?.isNativePlatform) {
      _capacitor = w.Capacitor
      return _capacitor
    }
  } catch { /* not in a browser */ }
  return null
}

/** True when running inside a Capacitor native shell (iOS or Android). */
export function isNative(): boolean {
  return cap()?.isNativePlatform() ?? false
}

/** True when running on iOS (native only). */
export function isIOS(): boolean {
  return isNative() && cap()?.getPlatform() === 'ios'
}

/** True when running on Android (native only). */
export function isAndroid(): boolean {
  return isNative() && cap()?.getPlatform() === 'android'
}
