/**
 * Fixes UTF-8-as-Windows-1252 mojibake — occurs when UTF-8 multi-byte byte
 * sequences are misread as individual Windows-1252 characters.
 *
 * "Itaú"  → stored as "ItaÃº"   (U+00C3, U+00BA)
 * "—"     → stored as "â€""     (U+00E2, U+20AC, U+201D)
 * "🍔"    → stored as "ðŸ"      (U+00F0, U+0178, ...)
 *
 * The critical issue: Windows-1252 bytes 0x80–0x9F map to Unicode code points
 * ABOVE U+00FF (e.g. 0x80 → U+20AC €, 0x97 → U+2014 —, 0x9F → U+0178 Ÿ).
 * A naive charCode & 0xFF would truncate these to the wrong byte values,
 * breaking emoji and punctuation recovery. This table maps them back correctly.
 */

const WIN1252_REVERSE = new Map<number, number>([
  [0x20AC, 0x80], // €
  [0x201A, 0x82], // ‚
  [0x0192, 0x83], // ƒ
  [0x201E, 0x84], // „
  [0x2026, 0x85], // …
  [0x2020, 0x86], // †
  [0x2021, 0x87], // ‡
  [0x02C6, 0x88], // ˆ
  [0x2030, 0x89], // ‰
  [0x0160, 0x8A], // Š
  [0x2039, 0x8B], // ‹
  [0x0152, 0x8C], // Œ
  [0x008D, 0x8D], // (undefined in Win1252 — pass through as control char)
  [0x017D, 0x8E], // Ž
  [0x008F, 0x8F], // (undefined)
  [0x0090, 0x90], // (undefined)
  [0x2018, 0x91], // '
  [0x2019, 0x92], // '
  [0x201C, 0x93], // "
  [0x201D, 0x94], // "
  [0x2022, 0x95], // •
  [0x2013, 0x96], // –
  [0x2014, 0x97], // —
  [0x02DC, 0x98], // ˜
  [0x2122, 0x99], // ™
  [0x0161, 0x9A], // š
  [0x203A, 0x9B], // ›
  [0x0153, 0x9C], // œ
  [0x009D, 0x9D], // (undefined)
  [0x017E, 0x9E], // ž
  [0x0178, 0x9F], // Ÿ
])

export function fixMojibake(str: string): string {
  if (!str || typeof str !== 'string') return str
  // Quick bail: no Latin-1 high bytes means nothing to fix
  if (!/[\xC0-\xFF]/.test(str)) return str
  try {
    const bytes = new Uint8Array(str.length)
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i)
      if (code <= 0x7F) {
        // ASCII — direct
        bytes[i] = code
      } else if (code >= 0xA0 && code <= 0xFF) {
        // Latin-1 supplement — code point equals byte value in Win1252
        bytes[i] = code
      } else {
        const b = WIN1252_REVERSE.get(code)
        if (b !== undefined) {
          bytes[i] = b
        } else {
          // Character outside Win1252 range (e.g. CJK, surrogate) — not mojibake
          return str
        }
      }
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return str
  }
}

export function deepFixMojibake<T>(val: T): T {
  if (typeof val === 'string')  return fixMojibake(val) as unknown as T
  if (Array.isArray(val))       return val.map(deepFixMojibake) as unknown as T
  if (val && typeof val === 'object') {
    const out = {} as T
    for (const key of Object.keys(val as object)) {
      (out as Record<string, unknown>)[key] = deepFixMojibake((val as Record<string, unknown>)[key])
    }
    return out
  }
  return val
}
