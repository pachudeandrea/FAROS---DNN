/**
 * Structural exposure between catalog instruments.
 *
 * A verified event about one instrument (the "driver") also reaches other
 * instruments that hold it or depend on it. Example: a fall in NVIDIA is
 * mechanically transmitted to SPY/QQQ/DIA because NVIDIA is one of the largest
 * constituents of the S&P 500, the Nasdaq 100 and the Dow Jones.
 *
 * Kinds of link:
 * - `indice`: the target ETF holds the driver as a constituent. The driver's
 *   direction is transmitted always (in proportion to its weight).
 * - `cadena`: supplier/customer dependency (NVIDIA orders → TSMC production).
 *   The direction is transmitted always.
 * - `riesgo`: balance-sheet exposure (Argentine banks hold sovereign debt).
 *   The direction is transmitted always.
 * - `sector`: peers of the same industry. Only an observed price movement is
 *   transmitted ("arrastre sectorial"); a company-specific result of a peer
 *   may favour or hurt competitors, so no direction is assumed in that case.
 *
 * Index memberships come from public index compositions (S&P 500, Nasdaq 100,
 * Dow Jones Industrial Average, Select Sector SPDRs, MSCI Brazil/EM, ARK
 * Innovation). Weights are qualitative tiers, not quotes: `alta` marks the
 * largest constituents of the index. Review on index rebalancing.
 */
export type ExposureKind = 'indice' | 'cadena' | 'riesgo' | 'sector';
export type ExposureWeight = 'alta' | 'media' | 'baja';
export interface ExposureLink { driver: string; target: string; kind: ExposureKind; weight: ExposureWeight; detail: string }

const INDEX_NAMES: Record<string, string> = {
  SPY: 'el S&P 500', QQQ: 'el Nasdaq 100', DIA: 'el Dow Jones', XLE: 'el sector energético del S&P 500 (XLE)',
  XLF: 'el sector financiero del S&P 500 (XLF)', EWZ: 'el índice MSCI Brazil', EEM: 'el índice MSCI de mercados emergentes', ARKK: 'la cartera de ARK Innovation'
};

// [index, top-weight constituents, other constituents]
const INDEX_MEMBERS: [string, string[], string[]][] = [
  ['SPY', ['NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'AVGO', 'TSLA'],
    ['AMD', 'INTC', 'NFLX', 'IBM', 'ORCL', 'ADBE', 'CRM', 'QCOM', 'KO', 'PEP', 'WMT', 'MCD', 'DIS', 'NKE', 'SBUX', 'PG', 'JNJ', 'PFE', 'MRK', 'ABBV', 'JPM', 'BAC', 'C', 'GS', 'V', 'MA', 'XOM', 'CVX', 'NEM', 'CAT', 'DE', 'BA', 'GE', 'GM', 'F']],
  ['QQQ', ['NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'AVGO', 'TSLA'],
    ['AMD', 'INTC', 'NFLX', 'ADBE', 'QCOM', 'MELI', 'PEP', 'SBUX']],
  // The Dow is price-weighted: high-priced shares weigh the most.
  ['DIA', ['GS', 'MSFT', 'CAT', 'V'], ['NVDA', 'AAPL', 'AMZN', 'KO', 'WMT', 'MCD', 'DIS', 'NKE', 'PG', 'JNJ', 'MRK', 'JPM', 'CVX', 'BA', 'IBM', 'CRM']],
  ['XLE', ['XOM', 'CVX'], []],
  ['XLF', ['JPM', 'V', 'MA', 'BAC'], ['GS', 'C']],
  ['EWZ', ['VALE', 'ITUB', 'PBR'], ['BBD']],
  ['EEM', ['TSM'], ['BABA', 'PBR', 'VALE', 'ITUB', 'BBD', 'BIDU', 'JD']],
  ['ARKK', ['TSLA'], []]
];

const SUPPLY_CHAIN: [driver: string, target: string, detail: string][] = [
  ['NVDA', 'TSM', 'TSMC fabrica los chips de NVIDIA: la demanda de NVIDIA se traduce en pedidos de producción para TSMC'],
  ['AMD', 'TSM', 'TSMC fabrica los procesadores de AMD: la demanda de AMD se traduce en pedidos de producción para TSMC'],
  ['AAPL', 'TSM', 'TSMC fabrica los procesadores de Apple, uno de sus principales clientes'],
  ['NVDA', 'MSFT', 'Microsoft es uno de los mayores compradores de infraestructura de IA de NVIDIA'],
  ['VIST', 'YPFD', 'Vista y YPF comparten la cuenca de Vaca Muerta y su infraestructura de evacuación'],
  ['YPFD', 'VIST', 'YPF y Vista comparten la cuenca de Vaca Muerta y su infraestructura de evacuación']
];

const SECTORS: [name: string, members: string[]][] = [
  ['semiconductores', ['NVDA', 'AMD', 'INTC', 'QCOM', 'AVGO', 'TSM']],
  ['grandes tecnológicas', ['AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN']],
  ['software empresarial', ['MSFT', 'ORCL', 'ADBE', 'CRM', 'IBM', 'GLOB']],
  ['comercio electrónico', ['AMZN', 'MELI', 'BABA', 'JD']],
  ['tecnología latinoamericana', ['MELI', 'GLOB', 'NU']],
  ['medios y entretenimiento', ['NFLX', 'DIS']],
  ['automotrices', ['TSLA', 'GM', 'F']],
  ['industriales y maquinaria', ['CAT', 'DE', 'GE', 'BA']],
  ['consumo masivo', ['KO', 'PEP', 'PG', 'WMT']],
  ['consumo discrecional', ['MCD', 'NKE', 'SBUX', 'DIS']],
  ['farmacéuticas', ['JNJ', 'PFE', 'MRK', 'ABBV']],
  ['bancos de Estados Unidos', ['JPM', 'BAC', 'C', 'GS', 'XLF']],
  ['redes de pago', ['V', 'MA']],
  ['petroleras integradas', ['XOM', 'CVX', 'SHEL', 'PBR', 'XLE']],
  ['minería y materiales', ['VALE', 'ALUA', 'TXAR', 'LOMA', 'HARG']],
  ['mineras de oro', ['GOLD', 'NEM']],
  ['índices de Wall Street', ['SPY', 'QQQ', 'DIA', 'IWM']],
  ['mercados emergentes', ['EEM', 'EWZ']],
  ['tecnológicas chinas', ['BABA', 'BIDU', 'JD']],
  ['bancos brasileños', ['ITUB', 'BBD', 'NU']],
  ['energía de Vaca Muerta', ['YPFD', 'VIST', 'PAMP', 'TGSU2']],
  ['bancos argentinos', ['GGAL', 'BMA', 'BBAR', 'SUPV', 'BHIP', 'BPAT', 'VALO']],
  ['mercado de capitales argentino', ['BYMA', 'VALO']],
  ['utilities argentinas', ['EDN', 'CEPU', 'TRAN', 'TGNO4', 'METR', 'DGCU2', 'CGPA2']],
  ['agroindustria argentina', ['CRES', 'AGRO', 'SAMI', 'MOLI', 'MOLA', 'LEDE', 'SEMI', 'INVJ']],
  ['inmobiliarias argentinas', ['IRSA', 'CRES']],
  ['telecomunicaciones y medios argentinos', ['TECO2', 'CVH', 'GCLA']],
  ['concesiones viales', ['AUSO', 'OEST']],
  ['industria argentina', ['MIRG', 'LONG', 'FERR', 'BOLT', 'COME']]
];

const SOVEREIGN_BONDS = ['AL29', 'AL30', 'AL35', 'AE38', 'AL41', 'GD29', 'GD30', 'GD35', 'GD38', 'GD41', 'GD46',
  'AL29D', 'AL30D', 'AL35D', 'AE38D', 'AL41D', 'GD29D', 'GD30D', 'GD35D', 'GD38D', 'GD41D', 'GD46D'];
const SOVEREIGN_EXPOSED_BANKS = ['GGAL', 'BMA', 'BBAR', 'SUPV', 'BHIP', 'BPAT', 'VALO'];
// Leading local shares (Merval panel) and provincial debt priced off the
// sovereign curve: the country risk sets their cost of capital.
const SOVEREIGN_EXPOSED_EQUITIES = ['YPFD', 'PAMP', 'TGSU2', 'TGNO4', 'CEPU', 'EDN', 'TRAN', 'TXAR', 'ALUA', 'TECO2', 'LOMA', 'CRES', 'IRSA', 'BYMA', 'COME', 'MIRG', 'METR', 'VIST'];
const PROVINCIAL_BONDS = ['BA37D', 'CO29', 'PMM29'];

function buildLinks(): ExposureLink[] {
  const links: ExposureLink[] = [];
  for (const [index, top, others] of INDEX_MEMBERS) {
    for (const [members, weight] of [[top, 'alta'], [others, 'media']] as const) for (const driver of members) {
      links.push({ driver, target: index, kind: 'indice', weight,
        detail: `${driver} integra ${INDEX_NAMES[index]}${weight === 'alta' ? ' y está entre sus mayores ponderaciones' : ''}: su variación se transmite al fondo ${index} en proporción a su peso` });
    }
  }
  for (const [driver, target, detail] of SUPPLY_CHAIN) links.push({ driver, target, kind: 'cadena', weight: 'media', detail });
  for (const [name, members] of SECTORS) for (const driver of members) for (const target of members) {
    if (driver !== target) links.push({ driver, target, kind: 'sector', weight: 'baja', detail: `${target} comparte con ${driver} el sector de ${name}; un movimiento bursátil del sector suele arrastrar a sus pares` });
  }
  for (const driver of SOVEREIGN_BONDS) {
    for (const target of SOVEREIGN_EXPOSED_BANKS) links.push({ driver, target, kind: 'riesgo', weight: 'media', detail: `los bancos argentinos como ${target} tienen una alta tenencia de títulos públicos en su balance: la valoración de la deuda soberana incide en su patrimonio` });
    for (const target of SOVEREIGN_EXPOSED_EQUITIES) links.push({ driver, target, kind: 'riesgo', weight: 'baja', detail: `la prima de riesgo soberana incide en el costo de financiamiento de las empresas argentinas como ${target} y en la demanda de sus acciones` });
    for (const target of PROVINCIAL_BONDS) links.push({ driver, target, kind: 'riesgo', weight: 'media', detail: `la deuda provincial como ${target} se valúa con referencia a la curva soberana: un cambio en los bonos de la Nación se traslada a su rendimiento` });
  }
  // Reverse index links: a general move of the index drags its constituents.
  // Treated as sector contagion (only an observed price move is transmitted).
  for (const [index, top, others] of INDEX_MEMBERS) for (const target of [...top, ...others]) {
    links.push({ driver: index, target, kind: 'sector', weight: 'baja', detail: `${target} forma parte de ${INDEX_NAMES[index]}: un movimiento general del índice suele arrastrar a sus componentes` });
  }
  return links;
}

export const EXPOSURE_LINKS: ExposureLink[] = buildLinks();

const byDriver = new Map<string, ExposureLink[]>();
for (const link of EXPOSURE_LINKS) {
  const list = byDriver.get(link.driver) || [];
  // Keep the strongest link per driver/target pair (index > chain > risk > sector).
  const previous = list.findIndex(other => other.target === link.target);
  const rank = (kind: ExposureKind) => ({ indice: 3, cadena: 2, riesgo: 1, sector: 0 })[kind];
  if (previous === -1) list.push(link);
  else if (rank(link.kind) > rank(list[previous].kind)) list[previous] = link;
  byDriver.set(link.driver, list);
}

export function exposureLinksFrom(driver: string): ExposureLink[] {
  return byDriver.get(driver) || [];
}

/** Instruments whose news can reach `target` indirectly (used to prioritize
 * candidate articles for a portfolio that only holds the index or the peer). */
export function exposureDriversOf(targets: Iterable<string>): Set<string> {
  const wanted = new Set(targets);
  const drivers = new Set<string>();
  for (const link of EXPOSURE_LINKS) if (wanted.has(link.target) && link.kind !== 'sector') drivers.add(link.driver);
  return drivers;
}
