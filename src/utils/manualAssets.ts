import { ASSET_CATALOG, CATEGORY_LABELS } from '../data/assetCatalog.js';
import type { Asset, AssetCategory } from '../types/index.js';

export function createManualAsset(input: { symbol: string; name: string; issuer: string; category: AssetCategory; currency: string; market: string; sourceUrl: string }): Asset {
  const symbol = input.symbol.trim().toUpperCase();
  const market = input.market.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{0,19}$/.test(symbol) || !/^[A-Z0-9][A-Z0-9._-]{1,15}$/.test(market)) throw new Error('Revisá el identificador y el mercado (sin espacios).');
  if (!Object.hasOwn(CATEGORY_LABELS, input.category) || !['ARS', 'USD'].includes(input.currency)) throw new Error('Elegí una categoría y moneda.');
  if (input.name.trim().length < 3 || input.name.length > 160 || input.issuer.trim().length < 3 || input.issuer.length > 160) throw new Error('Completá el nombre y el emisor (3 a 160 caracteres).');
  const url = new URL(input.sourceUrl);
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.') || url.href.length > 600) throw new Error('Indicá un enlace HTTPS a la ficha del instrumento o su prospecto.');
  if (ASSET_CATALOG.some(a => a.symbol === symbol && a.market === market && a.currency === input.currency)) throw new Error('Ese instrumento ya está en el catálogo. Buscalo por ticker.');
  return { id: `${market}:${input.currency}:${symbol}`, symbol, market, currency: input.currency as Asset['currency'],
    name: input.name.trim(), issuer: input.issuer.trim(), category: input.category, sourceUrl: url.href,
    instrumentType: CATEGORY_LABELS[input.category], aliases: [], manual: true,
    lastPrice: 'Sin cotización', dayChange: '—', dayChangePositive: false };
}
export function validateCustomAssets(value: unknown): Asset[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100) throw new Error('Hasta 100 instrumentos manuales por cartera.');
  const assets = value.map(input => {
    if (!input || typeof input !== 'object' || ['symbol', 'name', 'issuer', 'category', 'currency', 'market', 'sourceUrl'].some(k => typeof input[k] !== 'string')) throw new Error('Ficha de instrumento incompleta.');
    const asset = createManualAsset(input);
    if (input.id !== asset.id) throw new Error('El identificador no coincide con mercado, moneda y especie.');
    return asset;
  });
  if (new Set(assets.map(a => a.id)).size !== assets.length) throw new Error('Hay instrumentos duplicados.');
  return assets;
}
