import { 
  Asset, 
  Portfolio, 
  NewsItem, 
  CalendarEvent, 
  UserPreferences 
} from '../types/index.js';
import { REAL_GROUNDED_NEWS } from './groundedRealNews.js';

export const MOCK_ASSETS: Asset[] = [
  {
    id: 'AL30',
    symbol: 'AL30',
    name: 'Bonar 2030 USD Ley Arg.',
    category: 'bonos',
    currency: 'USD',
    lastPrice: '62.40 USD',
    dayChange: '+2.1%',
    dayChangePositive: true,
    sector: 'Renta Fija Soberana'
  },
  {
    id: 'GD30',
    symbol: 'GD30',
    name: 'Global 2030 USD Ley NY',
    category: 'bonos',
    currency: 'USD',
    lastPrice: '67.85 USD',
    dayChange: '+1.8%',
    dayChangePositive: true,
    sector: 'Renta Fija Soberana'
  },
  {
    id: 'BOPREAL',
    symbol: 'BOPREAL',
    name: 'Bono Reconstrucción BCRA Serie 1',
    category: 'bonos',
    currency: 'USD',
    lastPrice: '88.10 USD',
    dayChange: '+0.4%',
    dayChangePositive: true,
    sector: 'Deuda BCRA'
  },
  {
    id: 'YPFD',
    symbol: 'YPFD',
    name: 'YPF Sociedad Anónima',
    category: 'acciones',
    currency: 'ARS',
    lastPrice: '$32.450',
    dayChange: '+4.3%',
    dayChangePositive: true,
    sector: 'Energía & Petróleo'
  },
  {
    id: 'GGAL',
    symbol: 'GGAL',
    name: 'Grupo Financiero Galicia',
    category: 'acciones',
    currency: 'ARS',
    lastPrice: '$5.820',
    dayChange: '-1.2%',
    dayChangePositive: false,
    sector: 'Bancario & Financiero'
  },
  {
    id: 'PAMP',
    symbol: 'PAMP',
    name: 'Pampa Energía S.A.',
    category: 'acciones',
    currency: 'ARS',
    lastPrice: '$3.940',
    dayChange: '+1.6%',
    dayChangePositive: true,
    sector: 'Generación Eléctrica'
  },
  {
    id: 'AAPL',
    symbol: 'AAPL',
    name: 'Apple Inc. (CEDEAR)',
    category: 'cedears',
    currency: 'ARS',
    lastPrice: '$18.950',
    dayChange: '+0.9%',
    dayChangePositive: true,
    sector: 'Tecnología Global'
  },
  {
    id: 'NVDA',
    symbol: 'NVDA',
    name: 'NVIDIA Corporation (CEDEAR)',
    category: 'cedears',
    currency: 'ARS',
    lastPrice: '$24.600',
    dayChange: '+3.7%',
    dayChangePositive: true,
    sector: 'Semiconductores & IA'
  },
  {
    id: 'SPY',
    symbol: 'SPY',
    name: 'SPDR S&P 500 ETF (CEDEAR)',
    category: 'cedears',
    currency: 'ARS',
    lastPrice: '$31.200',
    dayChange: '+0.5%',
    dayChangePositive: true,
    sector: 'Índice General EE.UU.'
  },
  {
    id: 'MELI',
    symbol: 'MELI',
    name: 'MercadoLibre Inc. (CEDEAR)',
    category: 'cedears',
    currency: 'ARS',
    lastPrice: '$29.400',
    dayChange: '-0.8%',
    dayChangePositive: false,
    sector: 'E-commerce & Fintech'
  },
  {
    id: 'MEP',
    symbol: 'MEP',
    name: 'Dólar Bolsa MEP',
    category: 'divisas',
    currency: 'ARS',
    lastPrice: '$1.285',
    dayChange: '-0.3%',
    dayChangePositive: false,
    sector: 'Tipo de Cambio Financiero'
  },
  {
    id: 'CCL',
    symbol: 'CCL',
    name: 'Dólar Contado con Liquidación',
    category: 'divisas',
    currency: 'ARS',
    lastPrice: '$1.315',
    dayChange: '+0.2%',
    dayChangePositive: true,
    sector: 'Tipo de Cambio Financiero'
  }
];

export const MOCK_PORTFOLIOS: Portfolio[] = [
  {
    id: 'port-principal',
    name: 'Cartera Principal Diversificada',
    description: 'Exposición equilibrada a bonos soberanos, acciones líderes del Merval y CEDEARs tecnológicos.',
    profile: 'moderado',
    assetIds: ['AL30', 'GD30', 'BOPREAL', 'YPFD', 'GGAL', 'PAMP', 'AAPL', 'NVDA', 'SPY', 'MELI', 'MEP', 'CCL'],
    assetPositions: {
      AL30: 'long',
      GD30: 'long',
      BOPREAL: 'long',
      YPFD: 'long',
      GGAL: 'long',
      PAMP: 'long',
      AAPL: 'long',
      NVDA: 'long',
      SPY: 'long',
      MELI: 'long',
      MEP: 'long',
      CCL: 'short'
    }
  },
  {
    id: 'port-renta-fija',
    name: 'Cartera Renta Fija en USD',
    description: 'Orientada al devengamiento de cupones semestrales en dólares y bonos del BCRA.',
    profile: 'conservador',
    assetIds: ['AL30', 'GD30', 'BOPREAL', 'MEP'],
    assetPositions: {
      AL30: 'long',
      GD30: 'long',
      BOPREAL: 'long',
      MEP: 'long'
    }
  },
  {
    id: 'port-crecimiento-tech',
    name: 'Cartera Crecimiento Global & CEDEARs',
    description: 'Foco en activos de renta variable internacional con cobertura implícita en dólar CCL.',
    profile: 'dinamico',
    assetIds: ['AAPL', 'NVDA', 'SPY', 'MELI', 'CCL', 'GGAL'],
    assetPositions: {
      AAPL: 'long',
      NVDA: 'long',
      SPY: 'long',
      MELI: 'long',
      CCL: 'short',
      GGAL: 'long'
    }
  }
];

// Curated authentic grounded news with real sources and direct URLs
export const MOCK_NEWS: NewsItem[] = REAL_GROUNDED_NEWS;

export const MOCK_CALENDAR_EVENTS: CalendarEvent[] = [
  {
    id: 'cal-1',
    date: '2026-10-14',
    time: '16:00 hs',
    title: 'Publicación del Índice de Precios al Consumidor (IPC)',
    category: 'macro_bcra',
    description: 'Difusión del dato oficial de inflación mensual de septiembre a nivel nacional.',
    source: 'INDEC - Instituto Nacional de Estadística y Censos',
    impactLevel: 'alto'
  },
  {
    id: 'cal-2',
    date: '2026-10-18',
    time: '17:30 hs',
    title: 'Resultados del 4° Trimestre Fiscal de Apple Inc.',
    assetSymbol: 'AAPL',
    category: 'balance',
    description: 'Presentación de estados contables, ingresos por servicios e impacto de ventas globales.',
    source: 'Apple Investor Relations / Formulario SEC 10-K',
    impactLevel: 'alto'
  },
  {
    id: 'cal-3',
    date: '2026-10-22',
    time: '10:00 hs',
    title: 'Corte y Acreditación de Cupón Semestral AL30 y GD30',
    assetSymbol: 'AL30',
    category: 'pago_cupon',
    description: 'Acreditación de renta de interés y amortización periódica de capital en cuentas comitentes.',
    source: 'Caja de Valores / Prospecto de emisión MECON',
    impactLevel: 'alto'
  },
  {
    id: 'cal-4',
    date: '2026-10-24',
    time: '18:00 hs',
    title: 'Reunión de Directorio del Banco Central sobre Encajes',
    category: 'macro_bcra',
    description: 'Revisión periódica de la tasa de política monetaria y regulaciones de liquidez bancaria.',
    source: 'Banco Central de la República Argentina',
    impactLevel: 'medio'
  },
  {
    id: 'cal-5',
    date: '2026-10-28',
    time: '17:00 hs',
    title: 'Presentación de Resultados Trimestrales de YPF S.A.',
    assetSymbol: 'YPFD',
    category: 'balance',
    description: 'Publicación de métricas de producción en Vaca Muerta, capex y flujo de fondos operativo.',
    source: 'Comisión Nacional de Valores (CNV) / Hecho Relevante',
    impactLevel: 'alto'
  },
  {
    id: 'cal-6',
    date: '2026-10-29',
    time: '17:30 hs',
    title: 'Balance Trimestral de Pampa Energía S.A.',
    assetSymbol: 'PAMP',
    category: 'balance',
    description: 'Difusión de estados financieros correspondientes a generación eléctrica y transporte de gas.',
    source: 'CNV / Relación con Inversores Pampa Energía',
    impactLevel: 'medio'
  },
  {
    id: 'cal-7',
    date: '2026-11-03',
    time: '16:00 hs',
    title: 'Reunión de Política Monetaria de la Reserva Federal (FOMC)',
    category: 'elecciones_politica',
    description: 'Decisión sobre la tasa de interés de referencia de los fondos federales de Estados Unidos.',
    source: 'Federal Reserve Board (Washington)',
    impactLevel: 'alto'
  },
  {
    id: 'cal-8',
    date: '2026-11-07',
    time: '18:00 hs',
    title: 'Balance Trimestral de MercadoLibre Inc.',
    assetSymbol: 'MELI',
    category: 'balance',
    description: 'Reporte de volumen total procesado (TPV) en Mercado Pago y margen operativo regional.',
    source: 'MercadoLibre Investor Relations / SEC',
    impactLevel: 'alto'
  },
  {
    id: 'cal-9',
    date: '2026-11-12',
    time: '11:00 hs',
    title: 'Licitación Periódica de Deuda en Dólares del BCRA (BOPREAL)',
    assetSymbol: 'BOPREAL',
    category: 'pago_cupon',
    description: 'Subasta de rescate y liquidación de cuotas de títulos comerciales.',
    source: 'Comunicación "A" del Banco Central',
    impactLevel: 'medio'
  },
  {
    id: 'cal-10',
    date: '2026-11-18',
    time: '18:00 hs',
    title: 'Resultados Trimestrales de NVIDIA Corporation',
    assetSymbol: 'NVDA',
    category: 'balance',
    description: 'Conferencia de ingresos de centros de datos de IA y guías operativas para el próximo ejercicio.',
    source: 'Nvidia Corp. Investor Relations / SEC Form 10-Q',
    impactLevel: 'alto'
  }
];

export const DEFAULT_PREFERENCES: UserPreferences = {
  investorProfile: 'moderado',
  enabledRelevanceTypes: ['impacto_precio', 'valoracion_mercado', 'ruido', 'contexto_macro'],
  prioritizedTopics: ['deuda_soberana', 'energia', 'cedears_tech', 'balances', 'regulaciones_bcra', 'macro_tasas'],
  notificationsEnabled: true,
  alertOnHighImpactOnly: false,
  audioSpeed: 1.0
};
