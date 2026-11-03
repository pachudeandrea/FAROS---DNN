import type { Asset, AssetCategory, Portfolio } from '../types/index.js';

export const CATEGORY_LABELS: Record<AssetCategory, string> = {
  acciones: 'Acciones argentinas', cedears: 'CEDEARs (empresas y ETF)', bonos: 'Bonos soberanos y BCRA',
  provinciales: 'Bonos provinciales', corporativos: 'Obligaciones negociables', tesoro: 'Tesoro y letras',
  fondos: 'Fondos', divisas: 'Divisas'
};
// Reference directories, not quote feeds. Symbols identify the local species;
// never infer a USD/cable species by appending a suffix to another symbol.
export const CATALOG_SOURCES = {
  byma: 'https://www.byma.com.ar/productos/acciones/',
  cedears: 'https://www.comafi.com.ar/custodiaglobal/Programas-Cedear-2483.note.aspx',
  debt: 'https://www.argentina.gob.ar/economia/finanzas/deudapublica',
  bonds: 'https://open.bymadata.com.ar/',
  funds: 'https://www.cafci.org.ar/'
};
type Row = [symbol: string, name: string, issuer: string, aliases?: string];
function entries(category: AssetCategory, type: string, currency: Asset['currency'], sourceUrl: string, rows: Row[]): Asset[] {
  return rows.map(([symbol, name, issuer, aliases]) => ({
    id: symbol, symbol, name, issuer, aliases: aliases?.split('|') || [], category, currency,
    market: category === 'divisas' ? 'Referencia cambiaria' : 'BYMA', instrumentType: type, sourceUrl,
    lastPrice: 'Sin cotización', dayChange: '—', dayChangePositive: false
  }));
}
export const ASSET_CATALOG: Asset[] = [
  ...entries('acciones', 'Acción argentina', 'ARS', CATALOG_SOURCES.byma, [
    ['YPFD', 'YPF S.A.', 'YPF', 'Yacimientos Petrolíferos Fiscales'],
    ['GGAL', 'Grupo Financiero Galicia', 'Grupo Financiero Galicia', 'Banco Galicia'],
    ['PAMP', 'Pampa Energía S.A.', 'Pampa Energía'],
    ['BMA', 'Banco Macro S.A.', 'Banco Macro'], ['BBAR', 'Banco BBVA Argentina', 'BBVA Argentina', 'Banco Francés'],
    ['SUPV', 'Grupo Supervielle S.A.', 'Grupo Supervielle', 'Banco Supervielle'],
    ['BHIP', 'Banco Hipotecario S.A.', 'Banco Hipotecario'], ['BPAT', 'Banco Patagonia S.A.', 'Banco Patagonia'],
    ['BYMA', 'Bolsas y Mercados Argentinos', 'Bolsas y Mercados Argentinos'],
    ['VALO', 'Banco de Valores S.A.', 'Banco de Valores'], ['COME', 'Sociedad Comercial del Plata', 'Sociedad Comercial del Plata'],
    ['ALUA', 'Aluar Aluminio Argentino', 'Aluar'], ['TXAR', 'Ternium Argentina S.A.', 'Ternium Argentina', 'Siderar'],
    ['CRES', 'Cresud S.A.C.I.F. y A.', 'Cresud'], ['IRSA', 'IRSA Inversiones y Representaciones', 'IRSA'],
    ['EDN', 'Edenor S.A.', 'Edenor', 'Empresa Distribuidora y Comercializadora Norte'],
    ['CEPU', 'Central Puerto S.A.', 'Central Puerto'], ['TGNO4', 'Transportadora de Gas del Norte', 'Transportadora de Gas del Norte', 'TGN'],
    ['TGSU2', 'Transportadora de Gas del Sur', 'Transportadora de Gas del Sur', 'TGS'],
    ['TRAN', 'Transener S.A.', 'Transener'], ['TECO2', 'Telecom Argentina S.A.', 'Telecom Argentina', 'Personal Telecom'],
    ['LOMA', 'Loma Negra C.I.A.S.A.', 'Loma Negra'], ['HARG', 'Holcim Argentina S.A.', 'Holcim Argentina'],
    ['MIRG', 'Mirgor S.A.', 'Mirgor'], ['METR', 'Metrogas S.A.', 'Metrogas'],
    ['DGCU2', 'Distribuidora de Gas Cuyana', 'Distribuidora de Gas Cuyana', 'Ecogas Cuyana'],
    ['CGPA2', 'Camuzzi Gas Pampeana', 'Camuzzi Gas Pampeana'], ['AGRO', 'Agrometal S.A.I.', 'Agrometal'],
    ['SAMI', 'San Miguel S.A.', 'San Miguel cítricos'], ['MOLI', 'Molinos Río de la Plata', 'Molinos Río de la Plata'],
    ['MOLA', 'Molinos Agro S.A.', 'Molinos Agro'], ['AUSO', 'Autopistas del Sol S.A.', 'Autopistas del Sol'],
    ['OEST', 'Grupo Concesionario del Oeste', 'Grupo Concesionario del Oeste'],
    ['BOLT', 'Boldt S.A.', 'Boldt'], ['CVH', 'Cablevisión Holding S.A.', 'Cablevisión Holding'],
    ['GCLA', 'Grupo Clarín S.A.', 'Grupo Clarín'], ['INVJ', 'Inversora Juramento S.A.', 'Inversora Juramento'],
    ['LEDE', 'Ledesma S.A.A.I.', 'Ledesma'], ['LONG', 'Longvie S.A.', 'Longvie'],
    ['FERR', 'Ferrum S.A.', 'Ferrum'], ['SEMI', 'Molinos Juan Semino S.A.', 'Molinos Juan Semino']
  ]),
  ...entries('cedears', 'CEDEAR de empresa', 'ARS', CATALOG_SOURCES.cedears, [
    ['AAPL', 'Apple Inc. (CEDEAR)', 'Apple', 'Apple Inc'], ['NVDA', 'NVIDIA Corporation (CEDEAR)', 'NVIDIA'],
    ['MELI', 'MercadoLibre Inc. (CEDEAR)', 'MercadoLibre', 'Mercado Libre'],
    ['MSFT', 'Microsoft Corporation (CEDEAR)', 'Microsoft'], ['AMZN', 'Amazon.com Inc. (CEDEAR)', 'Amazon'],
    ['GOOGL', 'Alphabet Inc. clase A (CEDEAR)', 'Alphabet', 'Google'], ['META', 'Meta Platforms (CEDEAR)', 'Meta Platforms', 'Facebook'],
    ['TSLA', 'Tesla Inc. (CEDEAR)', 'Tesla'], ['AMD', 'Advanced Micro Devices (CEDEAR)', 'Advanced Micro Devices'],
    ['INTC', 'Intel Corporation (CEDEAR)', 'Intel'], ['NFLX', 'Netflix Inc. (CEDEAR)', 'Netflix'],
    ['IBM', 'International Business Machines (CEDEAR)', 'IBM'], ['ORCL', 'Oracle Corporation (CEDEAR)', 'Oracle'],
    ['ADBE', 'Adobe Inc. (CEDEAR)', 'Adobe'], ['CRM', 'Salesforce Inc. (CEDEAR)', 'Salesforce'],
    ['QCOM', 'Qualcomm Inc. (CEDEAR)', 'Qualcomm'], ['AVGO', 'Broadcom Inc. (CEDEAR)', 'Broadcom'],
    ['TSM', 'Taiwan Semiconductor Manufacturing (CEDEAR)', 'Taiwan Semiconductor Manufacturing', 'TSMC'],
    ['KO', 'The Coca-Cola Company (CEDEAR)', 'Coca-Cola', 'Coca Cola'], ['PEP', 'PepsiCo Inc. (CEDEAR)', 'PepsiCo'],
    ['WMT', 'Walmart Inc. (CEDEAR)', 'Walmart'], ['MCD', "McDonald’s Corporation (CEDEAR)", 'McDonald’s', 'McDonalds'],
    ['DIS', 'The Walt Disney Company (CEDEAR)', 'Walt Disney', 'Disney'], ['NKE', 'Nike Inc. (CEDEAR)', 'Nike'],
    ['SBUX', 'Starbucks Corporation (CEDEAR)', 'Starbucks'], ['PG', 'Procter & Gamble (CEDEAR)', 'Procter & Gamble'],
    ['JNJ', 'Johnson & Johnson (CEDEAR)', 'Johnson & Johnson'], ['PFE', 'Pfizer Inc. (CEDEAR)', 'Pfizer'],
    ['MRK', 'Merck & Co. (CEDEAR)', 'Merck'], ['ABBV', 'AbbVie Inc. (CEDEAR)', 'AbbVie'],
    ['JPM', 'JPMorgan Chase & Co. (CEDEAR)', 'JPMorgan Chase', 'JP Morgan'], ['BAC', 'Bank of America (CEDEAR)', 'Bank of America'],
    ['C', 'Citigroup Inc. (CEDEAR)', 'Citigroup', 'Citibank'], ['GS', 'Goldman Sachs (CEDEAR)', 'Goldman Sachs'],
    ['V', 'Visa Inc. (CEDEAR)', 'Visa Inc', 'Visa'], ['MA', 'Mastercard Inc. (CEDEAR)', 'Mastercard'],
    ['XOM', 'Exxon Mobil Corporation (CEDEAR)', 'Exxon Mobil', 'ExxonMobil'], ['CVX', 'Chevron Corporation (CEDEAR)', 'Chevron'],
    ['SHEL', 'Shell plc (CEDEAR)', 'Shell'], ['PBR', 'Petrobras (CEDEAR)', 'Petrobras'],
    ['VALE', 'Vale S.A. (CEDEAR)', 'Vale S.A.'], ['BBD', 'Banco Bradesco (CEDEAR)', 'Banco Bradesco'],
    ['ITUB', 'Itaú Unibanco (CEDEAR)', 'Itaú Unibanco'], ['BABA', 'Alibaba Group (CEDEAR)', 'Alibaba'],
    ['BIDU', 'Baidu Inc. (CEDEAR)', 'Baidu'], ['JD', 'JD.com Inc. (CEDEAR)', 'JD.com'],
    ['NU', 'Nu Holdings (CEDEAR)', 'Nu Holdings', 'Nubank'], 
    ['GLOB', 'Globant S.A. (CEDEAR)', 'Globant'], ['VIST', 'Vista Energy (CEDEAR)', 'Vista Energy', 'Vista Oil & Gas'],
    ['GOLD', 'Barrick Gold (CEDEAR)', 'Barrick', 'Barrick Gold'], ['NEM', 'Newmont Corporation (CEDEAR)', 'Newmont'],
    ['CAT', 'Caterpillar Inc. (CEDEAR)', 'Caterpillar'], ['DE', 'Deere & Company (CEDEAR)', 'Deere & Company', 'John Deere'],
    ['BA', 'The Boeing Company (CEDEAR)', 'Boeing'], ['GE', 'GE Aerospace (CEDEAR)', 'General Electric'],
    ['GM', 'General Motors (CEDEAR)', 'General Motors'], ['F', 'Ford Motor Company (CEDEAR)', 'Ford Motor', 'Ford']
  ]),
  ...entries('cedears', 'CEDEAR de ETF', 'ARS', CATALOG_SOURCES.cedears, [
    ['SPY', 'SPDR S&P 500 ETF Trust (CEDEAR)', 'State Street', 'S&P 500|SPDR S&P 500'],
    ['QQQ', 'Invesco QQQ Trust (CEDEAR)', 'Invesco', 'Nasdaq 100|Invesco QQQ'],
    ['DIA', 'SPDR Dow Jones Industrial Average ETF (CEDEAR)', 'State Street', 'Dow Jones Industrial Average'],
    ['IWM', 'iShares Russell 2000 ETF (CEDEAR)', 'BlackRock', 'Russell 2000'],
    ['EEM', 'iShares MSCI Emerging Markets ETF (CEDEAR)', 'BlackRock', 'MSCI Emerging Markets'],
    ['EWZ', 'iShares MSCI Brazil ETF (CEDEAR)', 'BlackRock', 'MSCI Brazil'],
    ['XLE', 'Energy Select Sector SPDR Fund (CEDEAR)', 'State Street', 'Energy Select Sector'],
    ['XLF', 'Financial Select Sector SPDR Fund (CEDEAR)', 'State Street', 'Financial Select Sector'],
    ['ARKK', 'ARK Innovation ETF (CEDEAR)', 'ARK Invest', 'ARK Innovation']
  ]),
  ...entries('bonos', 'Bono soberano USD, ley argentina; especie ARS', 'ARS', CATALOG_SOURCES.debt,
    [['AL29', 'Bonar 2029', 'República Argentina'], ['AL30', 'Bonar 2030', 'República Argentina'],
     ['AL35', 'Bonar 2035', 'República Argentina'], ['AE38', 'Bonar 2038', 'República Argentina'], ['AL41', 'Bonar 2041', 'República Argentina']]),
  ...entries('bonos', 'Bono soberano USD, ley Nueva York; especie ARS', 'ARS', CATALOG_SOURCES.debt,
    [['GD29', 'Global 2029', 'República Argentina'], ['GD30', 'Global 2030', 'República Argentina'],
     ['GD35', 'Global 2035', 'República Argentina'], ['GD38', 'Global 2038', 'República Argentina'],
     ['GD41', 'Global 2041', 'República Argentina'], ['GD46', 'Global 2046', 'República Argentina']]),
  ...entries('bonos', 'Bono soberano USD; especie dólar local', 'USD', CATALOG_SOURCES.debt,
    [['AL29D', 'Bonar 2029 — dólar local', 'República Argentina'], ['AL30D', 'Bonar 2030 — dólar local', 'República Argentina'],
     ['AL35D', 'Bonar 2035 — dólar local', 'República Argentina'], ['AE38D', 'Bonar 2038 — dólar local', 'República Argentina'],
     ['AL41D', 'Bonar 2041 — dólar local', 'República Argentina'], ['GD29D', 'Global 2029 — dólar local', 'República Argentina'],
     ['GD30D', 'Global 2030 — dólar local', 'República Argentina'], ['GD35D', 'Global 2035 — dólar local', 'República Argentina'],
     ['GD38D', 'Global 2038 — dólar local', 'República Argentina'], ['GD41D', 'Global 2041 — dólar local', 'República Argentina'],
     ['GD46D', 'Global 2046 — dólar local', 'República Argentina']]),
  ...entries('bonos', 'Familia BOPREAL (referencia heredada, no especie negociable)', 'USD', CATALOG_SOURCES.bonds,
    [['BOPREAL', 'BOPREAL — referencia general BCRA', 'Banco Central de la República Argentina', 'Bono para la Reconstrucción de una Argentina Libre']]),
  ...entries('provinciales', 'Bono provincial USD; especie dólar local', 'USD', CATALOG_SOURCES.bonds,
    [['BA37D', 'Buenos Aires 2037 — dólar local', 'Provincia de Buenos Aires']]),
  ...entries('provinciales', 'Bono provincial USD; especie ARS', 'ARS', CATALOG_SOURCES.bonds,
    [['CO29', 'Córdoba 2029', 'Provincia de Córdoba'], ['PMM29', 'Mendoza 2029', 'Provincia de Mendoza']]),
  ...entries('corporativos', 'Obligación negociable USD; especie ARS', 'ARS', CATALOG_SOURCES.bonds, [
    ['YMCJO', 'YPF — ON clase XXXI 2033', 'YPF'],
    ['IRCFO', 'IRSA — ON clase XV 2028', 'IRSA']
  ]),
  ...entries('tesoro', 'Bono del Tesoro ajustado por CER', 'ARS', CATALOG_SOURCES.debt, [
    ['TX28', 'BONCER 2028', 'Tesoro Nacional', 'Bonos del Tesoro CER'],
    ['TX31', 'BONCER 2031', 'Tesoro Nacional', 'Bonos del Tesoro CER']
  ]),
  ...entries('divisas', 'Referencia cambiaria', 'ARS', CATALOG_SOURCES.bonds,
    [['MEP', 'Dólar Bolsa MEP', 'Mercado cambiario', 'Dólar MEP|Dólar Bolsa'],
     ['CCL', 'Dólar Contado con Liquidación', 'Mercado cambiario', 'Contado con liqui|Dólar CCL']])
];

// Explicit relationships between already-listed species of the same bond. IDs,
// market and currency remain distinct in portfolios, selectors and persistence.
for (const [ars, usd] of [['AL29', 'AL29D'], ['AL30', 'AL30D'], ['AL35', 'AL35D'], ['AE38', 'AE38D'], ['AL41', 'AL41D'], ['GD29', 'GD29D'], ['GD30', 'GD30D'], ['GD35', 'GD35D'], ['GD38', 'GD38D'], ['GD41', 'GD41D'], ['GD46', 'GD46D']]) {
  ASSET_CATALOG.find(asset => asset.id === ars)!.aliases!.push(usd);
  ASSET_CATALOG.find(asset => asset.id === usd)!.aliases!.push(ars);
}

export const normalizeAssetText = (text: string): string => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export function searchAssets(query: string, assets: Asset[] = ASSET_CATALOG): Asset[] {
  const terms = normalizeAssetText(query).split(/\s+/).filter(Boolean);
  return assets.filter(asset => {
    const text = normalizeAssetText([asset.id, asset.symbol, asset.name, asset.issuer, asset.market, asset.currency,
      asset.instrumentType, CATEGORY_LABELS[asset.category], ...(asset.aliases || [])].join(' '));
    return terms.every(term => text.includes(term));
  }).sort((a, b) => Number(normalizeAssetText(b.symbol) === normalizeAssetText(query)) - Number(normalizeAssetText(a.symbol) === normalizeAssetText(query)));
}
export function portfolioAssets(portfolio?: Pick<Portfolio, 'customAssets'>): Asset[] {
  return [...ASSET_CATALOG, ...(portfolio?.customAssets || []).filter(a => !ASSET_CATALOG.some(known => known.id === a.id))];
}
