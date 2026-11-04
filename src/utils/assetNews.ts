import { ASSET_CATALOG, normalizeAssetText } from '../data/assetCatalog.js';
import type { Asset } from '../types/index.js';

const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function contains(text: string, value: string): boolean {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped(normalizeAssetText(value))}([^\\p{L}\\p{N}]|$)`, 'u').test(text);
}
const finance = /\b(acciones?|bonos?|cedears?|etf|bolsa|bursatil|cotiza\w*|dividendos?|balance\w*|ganancias?|inversores?|deuda|licitacion|tesoro|vencimiento|cupon|obligaciones negociables|financiero|banco|bancos|mercado|capital|inversion\w*)\b/;
const ambiguous = new Set(['apple', 'amazon', 'come', 'long', 'c', 'v', 'f', 'de', 'ba', 'dia', 'ma', 'pg', 'ko', 'vale', 'gold', 'meta', 'visa', 'macro', 'pampa', 'san miguel', 'shell', 'ford', 'santa fe', 'mendoza', 'cordoba', 'entre rios', 'rio negro', 'buenos aires']);
const debtContext = /\b(bonos?|deuda|cupon|canje|amortizacion|acreedores|default|obligaciones negociables|on|calificacion crediticia)\b/;

function hasMarkedTicker(text: string, caseText: string, symbol: string): boolean {
  const code = normalizeAssetText(symbol);
  if (new RegExp(`\\$${escaped(code)}(?=$|[^\\p{L}\\p{N}])`, 'u').test(text)) return true;
  const marker = new RegExp(`\\b(?:ticker|cedear|etf|accion|acciones|bono|especie)(?:\\s+de)?\\s+["']?${escaped(code)}(?=$|[^\\p{L}\\p{N}])`, 'gu');
  return [...text.matchAll(marker)].some(match => {
    const start = match.index! + match[0].length - code.length;
    return caseText.slice(start, start + code.length) === symbol.toUpperCase();
  });
}

const foreignSovereign = /\b(australia|nueva zelanda|canada|reino unido|inglaterra|suiza|suecia|brasil|brazil|chile|uruguay|paraguay|peru|colombia|venezuela|ecuador|mexico|estados unidos|eeuu|espana|italia|alemania|francia|japon|china)\b/;

/** Relations are established from the verified publication, never from generated prose. */
export function recognizeAssetIds(headline: string, assets: Asset[] = ASSET_CATALOG): string[] {
  const text = normalizeAssetText(headline);
  const caseText = headline.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  const hasFinance = finance.test(text);
  const domesticDebtContext = !foreignSovereign.test(text) || /\b(argentina|argentinos?|argentinas?|bcra)\b/.test(text);
  const sovereignWords = /\b(bonos soberanos|deuda soberana|bonos argentinos|bonos en dolares|riesgo pais)\b/;
  const sovereignContext = !foreignSovereign.test(text) ? sovereignWords.test(text) : text.split(/\s+(?:mientras(?: que)?|pero|en tanto|y)\s+/).some(clause => sovereignWords.test(clause) && (!foreignSovereign.test(clause) || /\b(argentina|argentinos?|argentinas?)\b/.test(clause)));
  return assets.filter(asset => {
    const symbol = normalizeAssetText(asset.symbol);
    // A ticker embedded in a word or merely used as an ordinary word is not evidence.
    const explicitSymbol = contains(text, symbol) && (symbol.length > 2 && !ambiguous.has(symbol) || hasMarkedTicker(text, caseText, asset.symbol));
    if (explicitSymbol) return true;
    if (asset.category === 'bonos' && asset.aliases?.some(alias => /^[A-Z]{2}[0-9]{2}D?$/.test(alias) && contains(text, alias))) return true;
    if (asset.category === 'bonos' && asset.id !== 'BOPREAL' && contains(text, asset.name.replace(/ —.*$/, ''))) return true;
    if (asset.manual && !hasFinance) return false;
    // ETF managers issue many unrelated funds; the manager alone never identifies an ETF.
    const names = asset.instrumentType === 'CEDEAR de ETF' ? [asset.name.replace(/\s*\(CEDEAR\).*$/i, ''), ...(asset.aliases || [])] :
      ['fondos', 'tesoro', 'bonos'].includes(asset.category) ? [asset.name, ...(asset.aliases || [])] :
      [asset.issuer || '', ...(asset.aliases || []), asset.name.replace(/\s*\(CEDEAR\).*$/i, '')];
    const named = names.some(name => {
      if (normalizeAssetText(name).length < 3 || !contains(text, name)) return false;
      if (normalizeAssetText(name) === 'visa') return /\b(visa inc|acciones de visa|balance de visa|visa y mastercard)\b/.test(text) || /\bvisa\b.{0,60}\b(ganancias|dividendos|balance|cotizacion|red de pagos|tarjetas)\b/.test(text);
      if (normalizeAssetText(name) === 'mercado libre') return /\b(Mercado Libre)\b/.test(caseText) && /\b(empresa|acciones|cedear|balance|ganancias|ingresos|logistica|comercio electronico|ecommerce|mercado pago|galperin|anuncio|reporto)\b/.test(text);
      if (normalizeAssetText(name) === 'apple') return hasFinance || /\b(iphone|ipad|macbook|ios|app store|tim cook)\b/.test(text);
      if (normalizeAssetText(name) === 'amazon') return hasFinance || /\b(aws|web services|andy jassy)\b/.test(text);
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
      return ((domesticDebtContext && isMacroAssetContext(headline)) || sovereignContext) && !/\b(provincial|corporativ|empresa)/.test(text);
    if (domesticDebtContext && /\b(bcra|banco central)\b/.test(text) && /\b(reservas|tasas|encajes|divisas)\b/.test(text)) return asset.category === 'bonos' && asset.id !== 'BOPREAL' || asset.category === 'divisas';
    return false;
  }).map(asset => asset.id);
}
export function describeAssets(ids: string[], assets: Asset[] = ASSET_CATALOG): string {
  return ids.map(id => {
    const asset = assets.find(a => a.id === id);
    return asset ? `${asset.id}: ${asset.name}; emisor: ${asset.issuer}; ${asset.instrumentType}; ${asset.market}; ${asset.currency}; alias: ${(asset.aliases || []).join(', ')}` : `${id} (identificador sin metadatos; exigir evidencia explícita)`;
  }).join('\n');
}

export const isMacroAssetContext = (headline: string) => {
  const text = normalizeAssetText(headline);
  return /\b(bcra|banco central)\b/.test(text) && /\b(reservas|tasas|encajes|divisas)\b/.test(text);
};
