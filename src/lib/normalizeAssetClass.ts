// ─── Asset class normalization ───────────────────────────────────────────────
// Maps any historical / custom asset-class string into one of the 13 canonical
// classes the rest of the app (allocation, suitability, Pluggy import) uses.

import type { Investment, AssetClass } from './types'

export const CANONICAL_ASSET_CLASSES = [
  'CDB', 'LCI', 'LCA', 'Tesouro Direto', 'Ações B3', 'FII',
  'US Stocks', 'ETF', 'USD Cash', 'Crypto', 'Real Estate', 'Previdência', 'Other',
] as const
export type CanonicalAssetClass = typeof CANONICAL_ASSET_CLASSES[number]

const CANONICAL_SET = new Set<string>(CANONICAL_ASSET_CLASSES)

/** Returns true if the given class is already one of the 13 canonical values. */
export function isCanonicalAssetClass(cls: string): cls is CanonicalAssetClass {
  return CANONICAL_SET.has(cls)
}

/**
 * Best-guess mapper from any string to a canonical asset class. Uses the
 * class name itself plus location/currency/asset name as supporting signals.
 * Always returns one of the 13 canonical values; falls back to 'Other'.
 */
export function normalizeAssetClass(inv: Pick<Investment, 'assetClass' | 'location' | 'currency' | 'name' | 'ticker'>): CanonicalAssetClass {
  if (isCanonicalAssetClass(inv.assetClass)) return inv.assetClass

  const c   = (inv.assetClass ?? '').toLowerCase()
  const n   = (inv.name ?? '').toLowerCase()
  const t   = (inv.ticker ?? '').toLowerCase()
  const loc = inv.location
  const cur = inv.currency
  const isOffshore = loc === 'offshore' || cur === 'USD' || cur === 'EUR'

  // Helper: any signal string contains a fragment
  const has = (frag: string) => c.includes(frag) || n.includes(frag) || t.includes(frag)

  // Previdência (highest specificity — beats all)
  if (has('previd') || has('pgbl') || has('vgbl')) return 'Previdência'

  // Crypto
  if (has('crypto') || has('bitcoin') || has('btc') || has('ether') || has('eth ')) return 'Crypto'

  // Real Estate (physical / private)
  if (loc === 'physical-re' || has('imóvel') || has('imovel') || has('terreno') || has('private real estate')) {
    return 'Real Estate'
  }

  // FII / Brazilian REIT
  if (has('fii') || has('fundo imobil') || has('tijolo') || has('alt. fii')) return 'FII'

  // ETF
  if (has('etf')) return 'ETF'

  // Tesouro Direto (BRL government bonds)
  if (!isOffshore && (has('tesouro') || has('selic') || has('ipca') || has('prefix') || has('lft') || has('ltn') || has('ntn'))) {
    return 'Tesouro Direto'
  }

  // CDB / LCI / LCA — explicit wins
  if (has('cdb')) return 'CDB'
  if (has('lci')) return 'LCI'
  if (has('lca')) return 'LCA'

  // Onshore equities
  if (!isOffshore && (has('ação') || has('acoes') || has('ações') || has('rv ibovespa') || has('rv s&p (brl)') || has('equity'))) {
    return 'Ações B3'
  }

  // Offshore equities (US/global)
  if (isOffshore && (has('rv us') || has('rv europe') || has('rv asia') || has('rv emerging') || has('us stock') || has('stock') || has('equity'))) {
    return 'US Stocks'
  }

  // USD Cash
  if (isOffshore && (has('cash') || has('cd ') || has('savings'))) return 'USD Cash'

  // Everything else (Pós-Fixado, Prefixado, Renda Fixa Ativo, Multimercados,
  // Alt. Crédito Estruturado, Alt. PE/VC, Hedge Funds, Private Credit, Gold,
  // Commodities, US Treasury, US IG/HY, EM Govt/Corp, Developed Govt/Corp, ...)
  // → land in Other so the user can re-classify if they want a tighter bucket.
  return 'Other'
}

/**
 * Returns true if normalization would actually change the class.
 * Used by the migration to skip already-canonical investments cheaply.
 */
export function needsNormalization(inv: Pick<Investment, 'assetClass'>): boolean {
  return !isCanonicalAssetClass(inv.assetClass)
}
