import { ASSET_CATALOG, normalizeAssetText } from '../data/assetCatalog.js';
import type { Asset } from '../types/index.js';

const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function contains(text: string, value: string): boolean {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped(normalizeAssetText(value))}([^\\p{L}\\p{N}]|$)`, 'u').test(text);
}
const finance = /\b(acciones?|bonos?|cedears?|etf|bolsa|bursatil|cotiza\w*|dividendos?|balance\w*|ganancias?|inversores?|deuda|licitacion|tesoro|vencimiento|cupon|obligaciones negociables|financiero|banco|bancos|mercado|capital|inversion\w*)\b/;
const ambiguous = new Set(['apple', 'amazon', 'come', 'long', 'c', 'v', 'f', 'de', 'ba', 'dia', 'ma', 'pg', 'ko', 'vale', 'gold', 'meta', 'visa', 'macro', 'pampa', 'san miguel', 'shell', 'ford', 'santa fe', 'mendoza', 'cordoba', 'entre rios', 'rio negro', 'buenos aires']);
const debtContext = /\b(bonos?|deuda|cupon|canje|amortizacion|acreedores|default|obligaciones negociables|on|calificacion crediticia)\b/;

/** Relations are established from the verified publication, never from generated prose. */
export function recognizeAssetIds(headline: string, assets: Asset[] = ASSET_CATALOG): string[] {
  const text = normalizeAssetText(headline);
  const hasFinance = finance.test(text);
  return assets.filter(asset => {
    const symbol = normalizeAssetText(asset.symbol);
    // A ticker embedded in a word or merely used as an ordinary word is not evidence.
    const explicitSymbol = contains(text, symbol) && (symbol.length > 2 && !ambiguous.has(symbol) ||
      new RegExp(`(?:\\$|\\b(?:ticker|cedear|etf|accion|acciones|bono|especie)\\s+)["']?${escaped(symbol)}(?:[^\\p{L}\\p{N}]|$)`, 'u').test(text));
    if (explicitSymbol) return true;
    if (asset.category === 'bonos' && asset.aliases?.some(alias => /^[A-Z]{2}[0-9]{2}D?$/.test(alias) && contains(text, alias))) return true;
    if (asset.category === 'bonos' && asset.id !== 'BOPREAL' && contains(text, asset.name.replace(/ —.*$/, ''))) return true;
    if (asset.manual && !hasFinance) return false;
    // ETF managers issue many unrelated funds; the manager alone never identifies an ETF.
    const names = asset.instrumentType === 'CEDEAR de ETF' ? [asset.name.replace(/\s*\(CEDEAR\).*$/i, ''), ...(asset.aliases || [])] :
      ['fondos', 'tesoro'].includes(asset.category) ? [asset.name, ...(asset.aliases || [])] :
      [asset.issuer || '', ...(asset.aliases || []), asset.name.replace(/\s*\(CEDEAR\).*$/i, '')];
    const named = names.some(name => {
      if (normalizeAssetText(name).length < 3 || !contains(text, name)) return false;
      if (normalizeAssetText(name) === 'visa') return /\b(tarjetas?|pagos?|visa inc|visa presenta|visa reporta|acciones de visa|balance de visa)\b/.test(text);
      return !ambiguous.has(normalizeAssetText(name)) || hasFinance;
    });
    if (named) {
      if (['provinciales', 'corporativos'].includes(asset.category)) return debtContext.test(text);
      if (asset.category === 'bonos' && asset.id !== 'BOPREAL') return /\b(bonar|global)\b/.test(text) && contains(text, asset.name.replace(/ —.*$/, '')); // A specific bond name includes its maturity.
      if (asset.category === 'tesoro') return asset.manual ? hasFinance : /\b(cer|boncer)\b/.test(text) && debtContext.test(text);
      return true;
    }
    // Narrow, explicit instrument-family context; never assign all bonds to any debt headline.
    if (asset.category === 'bonos' && asset.id !== 'BOPREAL')
      return (isMacroAssetContext(headline) || /\b(bonos soberanos|deuda soberana|bonos argentinos|bonos en dolares|riesgo pais)\b/.test(text)) && !/\b(provincial|corporativ|empresa)/.test(text);
    if (/\b(bcra|banco central)\b/.test(text) && /\b(reservas|tasas|encajes|divisas)\b/.test(text)) return asset.category === 'bonos' && asset.id !== 'BOPREAL' || asset.category === 'divisas';
    return false;
  }).map(asset => asset.id);
}
export function describeAssets(ids: string[], assets: Asset[] = ASSET_CATALOG): string {
  return ids.map(id => {
    const asset = assets.find(a => a.id === id);
    return asset ? `${asset.id}: ${asset.name}; emisor: ${asset.issuer}; ${asset.instrumentType}; ${asset.market}; ${asset.currency}; alias: ${(asset.aliases || []).join(', ')}` : `${id} (identificador sin metadatos; exigir evidencia explícita)`;
  }).join('\n');
}

export const isMacroAssetContext = (headline: string) => /\b(bcra|banco central)\b.*\b(reservas|tasas|encajes|divisas)\b/.test(normalizeAssetText(headline));
