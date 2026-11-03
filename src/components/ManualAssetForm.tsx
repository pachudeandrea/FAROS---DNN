import React, { useState } from 'react';
import { CATEGORY_LABELS } from '../data/assetCatalog';
import { createManualAsset } from '../utils/manualAssets';
import type { Asset, AssetCategory } from '../types';

export function ManualAssetForm({ onSelect }: { onSelect: (asset: Asset) => void }) {
  const [error, setError] = useState('');
  return <details className="rounded-xl border border-ink-200 p-3 text-xs">
    <summary className="cursor-pointer font-semibold">¿No encontrás tu instrumento? Cargar identificación</summary>
    <p className="text-muted my-3">Usá la especie exacta de tu comprobante y una ficha oficial o prospecto. Se guardará solo en tu cartera como identificación manual, sin verificación automática ni cotización. Letras y fondos requieren su emisión o clase exacta.</p>
    <form className="grid grid-cols-1 sm:grid-cols-2 gap-3" onSubmit={event => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      try {
        const asset = createManualAsset({ symbol: String(data.get('symbol')), name: String(data.get('name')), issuer: String(data.get('issuer')), market: String(data.get('market')), currency: String(data.get('currency')), category: String(data.get('category')) as AssetCategory, sourceUrl: String(data.get('sourceUrl')) });
        onSelect(asset); setError('');
      } catch (failure) { setError(failure instanceof Error ? failure.message : 'Revisá la ficha del instrumento.'); }
    }}>
      {([['symbol', 'Identificador o especie', ''], ['name', 'Nombre completo', ''], ['issuer', 'Emisor', ''], ['market', 'Mercado', 'BYMA'], ['sourceUrl', 'Enlace a ficha o prospecto', '']] as const).map(([name, label, defaultValue]) => <label key={name} className="min-w-0">{label}<input name={name} defaultValue={defaultValue} required maxLength={name === 'sourceUrl' ? 600 : name === 'symbol' ? 20 : name === 'market' ? 16 : 160} type={name === 'sourceUrl' ? 'url' : 'text'} className="block w-full border border-ink-300 rounded-lg p-2 mt-1" /></label>)}
      <label>Categoría<select aria-label="Categoría" name="category" className="block w-full border border-ink-300 rounded-lg p-2 mt-1">{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Moneda de la especie<select aria-label="Moneda de la especie" name="currency" className="block w-full border border-ink-300 rounded-lg p-2 mt-1"><option>ARS</option><option>USD</option></select></label>
      {error && <p role="alert" className="sm:col-span-2 text-danger-text">{error}</p>}
      <button type="submit" className="bg-brand-950 text-paper rounded-lg p-3">Revisar LONG / SHORT</button>
    </form>
  </details>;
}
