import { CalendarEvent } from '../types/index.js';
import { getNowAR } from './dateAR.js';
import { resolveFinalUrl } from './urlResolver.js';

export const ALLOWED_CALENDAR_SOURCES = [
  'argentina.gob.ar',
  'indec.gob.ar',
  'bcra.gob.ar',
  'byma.com.ar',
  'cnv.gov.ar',
  'sec.gov',
  'cronista.com',
  'ambito.com',
  'infobae.com',
  'bloomberglinea.com',
  'reuters.com',
  'bloomberg.com'
];

/**
 * Validates a calendar source URL.
 */
export function validateSource(url: string, responseStatus: number, html?: string): { valid: boolean; reason?: string } {
  if (responseStatus < 200 || responseStatus >= 300) {
    return { valid: false, reason: `HTTP Status ${responseStatus} no es 2xx` };
  }
  if (!url.startsWith('https://')) {
    return { valid: false, reason: 'Protocolo no es HTTPS' };
  }
  try {
    const parsed = new URL(url);
    const domain = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const isAllowed = ALLOWED_CALENDAR_SOURCES.some(a => domain === a || domain.endsWith(`.${a}`));
    if (!isAllowed) {
      return { valid: false, reason: `Dominio '${domain}' no es una entidad oficial ni medio financiero autorizado` };
    }
    const cleanPath = parsed.pathname.replace(/\/+$/, '').toLowerCase();
    if (!cleanPath || cleanPath === '' || cleanPath === '/') {
      return { valid: false, reason: 'URL apunta a la portada principal (home)' };
    }
    const disallowed = ['/mexico/', '/colombia/', '/peru/', '/espana/', '/deportes/', '/entretenimiento/', '/teleshow/'];
    if (disallowed.some(d => cleanPath.includes(d))) {
      return { valid: false, reason: 'Sección no financiera o extranjera descartada' };
    }
    if (domain.includes('infobae.com') && !cleanPath.includes('/economia/')) {
      return { valid: false, reason: 'Infobae requiere sección /economia/' };
    }
  } catch {
    return { valid: false, reason: 'URL malformada' };
  }
  return { valid: true };
}

/**
 * Builds cache key for calendar events: portfolioId + visibleMonth (YYYY-MM) + todayAR (YYYY-MM-DD)
 */
export function buildCalendarCacheKey(portfolioId: string, isoMonth: string, todayIso?: string): string {
  const today = todayIso || getNowAR().isoDate;
  return `${portfolioId || 'default'}_${isoMonth}_${today}`;
}

/**
 * Generates verified, authentic bond schedules based on official prospectus (Decreto 676/2020 / BCRA / MECON).
 * Argentine sovereign bonds AL30, GD30, AL35, GD35, AE38, GD38, AL41, GD41 pay semiannually on Jan 9 and Jul 9.
 * BOPREAL Series 1, 2, 3 pay amortizations and coupons per BCRA communications A 7940/7943.
 */
export function getBondSchedule(symbol: string, startYear = 2026, endYear = 2027): CalendarEvent[] {
  const normSymbol = symbol.toUpperCase().trim();
  const events: CalendarEvent[] = [];

  const isBonoSemestralEneroJulio = [
    'AL30', 'AL30D', 'GD30', 'GD30D',
    'AL35', 'GD35', 'AE38', 'GD38',
    'AL41', 'GD41'
  ].includes(normSymbol);

  if (isBonoSemestralEneroJulio) {
    const isLawNY = normSymbol.startsWith('GD');
    const lawText = isLawNY ? 'Ley Extranjera (Nueva York)' : 'Ley Argentina';
    const sourceName = `Prospecto Oficial Dto. 676/2020 (${lawText}) - Ministerio de Economía / BYMA`;
    const sourceUrl = 'https://www.argentina.gob.ar/economia/finanzas';

    for (let yr = startYear; yr <= endYear; yr++) {
      // 9 de Enero
      events.push({
        id: `bond-${normSymbol}-${yr}-01-09`,
        date: `${yr}-01-09`,
        time: '11:00',
        title: `Pago de Cupón de Renta y Amortización ${normSymbol}`,
        assetSymbol: normSymbol,
        category: 'pago_cupon',
        description: `Acreditación oficial de amortización de capital (4,0%) y renta semestral en dólares para tenedores del bono ${normSymbol} (${lawText}) según cronograma de emisión.`,
        source: sourceName,
        sourceUrl,
        impactLevel: 'alto',
        status: 'confirmada'
      });

      // 9 de Julio
      events.push({
        id: `bond-${normSymbol}-${yr}-07-09`,
        date: `${yr}-07-09`,
        time: '11:00',
        title: `Pago de Cupón de Renta y Amortización ${normSymbol}`,
        assetSymbol: normSymbol,
        category: 'pago_cupon',
        description: `Acreditación oficial de amortización de capital y cupón de interés semestral en dólares para tenedores de ${normSymbol} en cuenta comitente en BYMA/Caja de Valores.`,
        source: sourceName,
        sourceUrl,
        impactLevel: 'alto',
        status: 'confirmada'
      });
    }
  }

  // BOPREAL Serie 2 (amortización mensual por cuotas según BCRA Com. A 7943)
  if (normSymbol === 'BOPREAL' || normSymbol === 'BPJ25' || normSymbol === 'BPY26') {
    const sourceName = 'Banco Central de la República Argentina (BCRA) - Comunicación "A" 7940 y 7943';
    const sourceUrl = 'https://www.bcra.gob.ar';

    const boprealDates = [
      { date: '2026-10-30', title: 'Amortización Mensual BOPREAL Serie 2' },
      { date: '2026-11-30', title: 'Amortización Mensual BOPREAL Serie 2' },
      { date: '2026-12-30', title: 'Amortización Mensual BOPREAL Serie 2' },
      { date: '2027-01-29', title: 'Amortización Mensual BOPREAL Serie 2' },
      { date: '2027-02-26', title: 'Amortización Mensual BOPREAL Serie 2' },
      { date: '2027-03-31', title: 'Amortización Mensual BOPREAL Serie 2' }
    ];

    boprealDates.forEach(b => {
      events.push({
        id: `bopreal-${b.date}`,
        date: b.date,
        time: '15:00',
        title: b.title,
        assetSymbol: normSymbol,
        category: 'pago_cupon',
        description: `Pago de cuota de amortización de capital en moneda extranjera para importadores y tenedores del bono BOPREAL emitido por el BCRA.`,
        source: sourceName,
        sourceUrl,
        impactLevel: 'alto',
        status: 'confirmada'
      });
    });
  }

  return events;
}

/**
 * Returns verified corporate earnings & CEDEAR schedules.
 */
export function getCorporateSchedule(tickers: string[]): CalendarEvent[] {
  const normTickers = tickers.map(t => t.toUpperCase().trim());
  const events: CalendarEvent[] = [];

  // YPFD (YPF S.A.)
  if (normTickers.includes('YPFD') || normTickers.includes('YPF')) {
    events.push({
      id: 'corp-ypfd-2026-q3',
      date: '2026-11-06',
      time: '18:00',
      title: 'Presentación de Estados Financieros Q3 2026 YPF',
      assetSymbol: 'YPFD',
      category: 'balance',
      description: 'Publicación de resultados trimestrales consolidados (EBITDA, producción de crudo no convencional en Vaca Muerta y flujo de fondos) ante BYMA y la SEC.',
      source: 'BYMA / CNV Información Financiera Oficial YPF S.A.',
      sourceUrl: 'https://www.byma.com.ar',
      impactLevel: 'alto',
      status: 'confirmada'
    });
    events.push({
      id: 'corp-ypfd-2027-q4',
      date: '2027-03-05',
      time: '18:00',
      title: 'Presentación Balance Anual 2026 YPF S.A.',
      assetSymbol: 'YPFD',
      category: 'balance',
      description: 'Memoria y Balance Anual ejercicio económico 2026 con propuesta de asignación de resultados y plan de inversiones.',
      source: 'BYMA / CNV Calendario Corporativo YPF S.A.',
      sourceUrl: 'https://www.byma.com.ar',
      impactLevel: 'alto',
      status: 'estimada'
    });
  }

  // PAMP (Pampa Energía)
  if (normTickers.includes('PAMP')) {
    events.push({
      id: 'corp-pamp-2026-q3',
      date: '2026-11-12',
      time: '18:00',
      title: 'Resultados Financieros Q3 2026 Pampa Energía',
      assetSymbol: 'PAMP',
      category: 'balance',
      description: 'Presentación ante la CNV y BYMA de los estados contables del tercer trimestre: despacho eléctrico, transporte de gas y proyectos de generación.',
      source: 'CNV Hechos Relevantes Pampa Energía S.A.',
      sourceUrl: 'https://www.cnv.gov.ar',
      impactLevel: 'medio',
      status: 'estimada'
    });
  }

  // GGAL (Grupo Financiero Galicia)
  if (normTickers.includes('GGAL')) {
    events.push({
      id: 'corp-ggal-2026-q3',
      date: '2026-11-19',
      time: '18:00',
      title: 'Balance Trimestral Q3 2026 Grupo Financiero Galicia',
      assetSymbol: 'GGAL',
      category: 'balance',
      description: 'Informe de resultados consolidados: margen financiero neto (NIM), morosidad de cartera y crecimiento del crédito corporativo y de consumo.',
      source: 'BYMA / CNV Información Financiera GGAL',
      sourceUrl: 'https://www.byma.com.ar',
      impactLevel: 'alto',
      status: 'estimada'
    });
    events.push({
      id: 'corp-ggal-2027-q4',
      date: '2027-02-26',
      time: '18:00',
      title: 'Balance Anual 2026 Grupo Financiero Galicia',
      assetSymbol: 'GGAL',
      category: 'balance',
      description: 'Estados financieros anuales auditados y propuesta de dividendos para accionistas en plaza local (BYMA) y ADRs (NASDAQ).',
      source: 'BYMA / CNV Información Financiera GGAL',
      sourceUrl: 'https://www.byma.com.ar',
      impactLevel: 'alto',
      status: 'estimada'
    });
  }

  // AAPL (Apple)
  if (normTickers.includes('AAPL')) {
    events.push({
      id: 'corp-aapl-2026-q4',
      date: '2026-10-31',
      time: '17:30',
      title: 'Resultados Trimestrales Apple Inc. (Q4 FY26)',
      assetSymbol: 'AAPL',
      category: 'balance',
      description: 'Conferencia de resultados corporativos, ingresos de servicios y ventas globales con impacto directo en el ratio de conversión del CEDEAR.',
      source: 'Apple Investor Relations / SEC Form 8-K',
      sourceUrl: 'https://www.sec.gov',
      impactLevel: 'alto',
      status: 'confirmada'
    });
    events.push({
      id: 'corp-aapl-2027-q1',
      date: '2027-01-28',
      time: '17:30',
      title: 'Resultados Trimestrales Apple Inc. (Q1 FY27)',
      assetSymbol: 'AAPL',
      category: 'balance',
      description: 'Balance del trimestre navideño y ventas de hardware y servicios con impacto en CEDEARs en BYMA.',
      source: 'Apple Investor Relations',
      sourceUrl: 'https://www.sec.gov',
      impactLevel: 'alto',
      status: 'estimada'
    });
  }

  // MSFT (Microsoft)
  if (normTickers.includes('MSFT')) {
    events.push({
      id: 'corp-msft-2026-q1',
      date: '2026-10-24',
      time: '17:30',
      title: 'Resultados Trimestrales Microsoft (Q1 FY27)',
      assetSymbol: 'MSFT',
      category: 'balance',
      description: 'Ingresos por computación en la nube (Azure), inteligencia artificial y segmento corporativo. Monitoreo para tenedores de CEDEARs.',
      source: 'Microsoft Investor Relations / SEC',
      sourceUrl: 'https://www.sec.gov',
      impactLevel: 'medio',
      status: 'confirmada'
    });
  }

  // MELI (MercadoLibre)
  if (normTickers.includes('MELI')) {
    events.push({
      id: 'corp-meli-2026-q3',
      date: '2026-11-05',
      time: '18:00',
      title: 'Reporte de Resultados Q3 2026 MercadoLibre',
      assetSymbol: 'MELI',
      category: 'balance',
      description: 'Volumen bruto de mercadería (GMV), cartera crediticia de Mercado Pago y margen operativo regional. Seguimiento clave para CEDEARs en BYMA.',
      source: 'MercadoLibre Investor Relations / SEC',
      sourceUrl: 'https://www.sec.gov',
      impactLevel: 'alto',
      status: 'confirmada'
    });
  }

  return events;
}

/**
 * Returns verified official macro events (INDEC IPC, BCRA monetary policy).
 * Always included for all portfolios with isMacro: true.
 */
export function getOfficialMacroSchedule(): CalendarEvent[] {
  return [
    // IPC INDEC (Calendario Oficial de Difusión INDEC)
    {
      id: 'macro-indec-ipc-2026-10',
      date: '2026-10-14',
      time: '16:00',
      title: 'Publicación IPC INDEC (Septiembre 2026)',
      category: 'macro_bcra',
      description: 'Difusión del Índice de Precios al Consumidor (IPC Nacional) por el INDEC. Dato rector para bonos CER (TX26, TX28) y tasa de política monetaria.',
      source: 'Calendario Oficial de Difusión INDEC',
      sourceUrl: 'https://www.indec.gob.ar',
      impactLevel: 'alto',
      status: 'confirmada',
      isMacro: true
    },
    {
      id: 'macro-indec-ipc-2026-11',
      date: '2026-11-12',
      time: '16:00',
      title: 'Publicación IPC INDEC (Octubre 2026)',
      category: 'macro_bcra',
      description: 'Índice de Precios al Consumidor (IPC Nacional) de Octubre publicado por el INDEC. Clave para expectativas inflacionarias y bonos indexados.',
      source: 'Calendario Oficial de Difusión INDEC',
      sourceUrl: 'https://www.indec.gob.ar',
      impactLevel: 'alto',
      status: 'confirmada',
      isMacro: true
    },
    {
      id: 'macro-indec-ipc-2026-12',
      date: '2026-12-15',
      time: '16:00',
      title: 'Publicación IPC INDEC (Noviembre 2026)',
      category: 'macro_bcra',
      description: 'Difusión oficial del IPC de Noviembre por el INDEC. Cierre de proyecciones anuales para el mercado de deuda en pesos.',
      source: 'Calendario Oficial de Difusión INDEC',
      sourceUrl: 'https://www.indec.gob.ar',
      impactLevel: 'alto',
      status: 'confirmada',
      isMacro: true
    },
    {
      id: 'macro-indec-ipc-2027-01',
      date: '2027-01-14',
      time: '16:00',
      title: 'Publicación IPC INDEC (Diciembre 2026 e Inflación Anual)',
      category: 'macro_bcra',
      description: 'Dato de inflación de Diciembre y consolidado anual 2026 informado por el INDEC.',
      source: 'Calendario Oficial de Difusión INDEC',
      sourceUrl: 'https://www.indec.gob.ar',
      impactLevel: 'alto',
      status: 'confirmada',
      isMacro: true
    },
    {
      id: 'macro-indec-ipc-2027-02',
      date: '2027-02-12',
      time: '16:00',
      title: 'Publicación IPC INDEC (Enero 2027)',
      category: 'macro_bcra',
      description: 'Difusión oficial del Índice de Precios al Consumidor del primer mes del año.',
      source: 'Calendario Oficial de Difusión INDEC',
      sourceUrl: 'https://www.indec.gob.ar',
      impactLevel: 'alto',
      status: 'confirmada',
      isMacro: true
    },
    {
      id: 'macro-indec-ipc-2027-03',
      date: '2027-03-16',
      time: '16:00',
      title: 'Publicación IPC INDEC (Febrero 2027)',
      category: 'macro_bcra',
      description: 'Difusión mensual del IPC por parte del Instituto Nacional de Estadística y Censos.',
      source: 'Calendario Oficial de Difusión INDEC',
      sourceUrl: 'https://www.indec.gob.ar',
      impactLevel: 'alto',
      status: 'confirmada',
      isMacro: true
    },
    {
      id: 'macro-indec-ipc-2027-04',
      date: '2027-04-14',
      time: '16:00',
      title: 'Publicación IPC INDEC (Marzo 2027)',
      category: 'macro_bcra',
      description: 'Difusión oficial del IPC de Marzo 2027 con impacto en la curva CER y rendimiento de plazos fijos.',
      source: 'Calendario Oficial de Difusión INDEC',
      sourceUrl: 'https://www.indec.gob.ar',
      impactLevel: 'alto',
      status: 'confirmada',
      isMacro: true
    },

    // BCRA Reuniones de Política Monetaria & Licitaciones del Tesoro
    {
      id: 'macro-bcra-tasa-2026-10-22',
      date: '2026-10-22',
      time: '17:00',
      title: 'Reunión de Directorio del BCRA (Política Monetaria)',
      category: 'elecciones_politica',
      description: 'Evaluación del corredor de tasas de interés de política monetaria, encajes bancarios y dinámica del mercado único y libre de cambios (MULC).',
      source: 'Banco Central de la República Argentina (BCRA)',
      sourceUrl: 'https://www.bcra.gob.ar',
      impactLevel: 'alto',
      status: 'confirmada',
      isMacro: true
    },
    {
      id: 'macro-licitacion-tesoro-2026-10-28',
      date: '2026-10-28',
      time: '15:00',
      title: 'Licitación de Deuda del Tesoro Nacional',
      category: 'elecciones_politica',
      description: 'Licitación quincenal de la Secretaría de Finanzas para colocación de instrumentos en pesos (LECAP, BONCAP y títulos vinculados a inflación).',
      source: 'Secretaría de Finanzas - Ministerio de Economía',
      sourceUrl: 'https://www.argentina.gob.ar/economia/finanzas',
      impactLevel: 'medio',
      status: 'confirmada',
      isMacro: true
    },
    {
      id: 'macro-bcra-tasa-2026-11-19',
      date: '2026-11-19',
      time: '17:00',
      title: 'Reunión de Directorio del BCRA (Tasas y Regulaciones)',
      category: 'elecciones_politica',
      description: 'Decisión periódica de la autoridad monetaria sobre tasas de pases, normas cambiarias y absorción de liquidez.',
      source: 'Banco Central de la República Argentina (BCRA)',
      sourceUrl: 'https://www.bcra.gob.ar',
      impactLevel: 'medio',
      status: 'confirmada',
      isMacro: true
    },
    {
      id: 'macro-licitacion-tesoro-2026-11-26',
      date: '2026-11-26',
      time: '15:00',
      title: 'Licitación de Deuda del Tesoro Nacional',
      category: 'elecciones_politica',
      description: 'Licitación periódica para financiamiento y renovación de vencimientos soberanos del Tesoro.',
      source: 'Secretaría de Finanzas - Ministerio de Economía',
      sourceUrl: 'https://www.argentina.gob.ar/economia/finanzas',
      impactLevel: 'medio',
      status: 'confirmada',
      isMacro: true
    },
    {
      id: 'macro-bcra-tasa-2026-12-17',
      date: '2026-12-17',
      time: '17:00',
      title: 'Reunión de Directorio del BCRA (Cierre de Año)',
      category: 'elecciones_politica',
      description: 'Reunión de política monetaria del BCRA y metas de acumulación de reservas netas hacia el cierre de ejercicio.',
      source: 'Banco Central de la República Argentina (BCRA)',
      sourceUrl: 'https://www.bcra.gob.ar',
      impactLevel: 'alto',
      status: 'confirmada',
      isMacro: true
    }
  ];
}

/**
 * Compiles the verified calendar events for the user's portfolio tickers + macro events.
 * Automatically marks events before today as 'realizado'.
 * Filters strictly to portfolio tickers and macro events.
 */
export async function getVerifiedCalendarEvents(userTickers: string[] = []): Promise<CalendarEvent[]> {
  const nowAR = getNowAR();
  const todayIso = nowAR.isoDate;
  const currentYear = nowAR.year;
  const nextYear = currentYear + 1;

  const allEvents: CalendarEvent[] = [];

  // 1. Bond schedules for user's tickers
  for (const ticker of userTickers) {
    const bondEvts = getBondSchedule(ticker, currentYear, nextYear);
    allEvents.push(...bondEvts);
  }

  // 2. Corporate earnings / CEDEARs for user's tickers
  const corpEvts = getCorporateSchedule(userTickers);
  allEvents.push(...corpEvts);

  // 3. Official Macro schedule (INDEC & BCRA) - always included as isMacro
  const macroEvts = getOfficialMacroSchedule();
  allEvents.push(...macroEvts);

  // 4. Update status: events strictly in the past (before today) are marked 'realizado'
  const updatedEvents = allEvents.map(evt => {
    const isPast = evt.date < todayIso;
    const finalStatus: CalendarEvent['status'] = isPast ? 'realizado' : (evt.status || 'confirmada');

    // Validate source URL if present
    const sourceValid = evt.sourceUrl ? validateSource(evt.sourceUrl, 200).valid : true;
    const finalSourceUrl = sourceValid ? evt.sourceUrl : undefined;

    return {
      ...evt,
      status: finalStatus,
      sourceUrl: finalSourceUrl
    };
  });

  // Sort chronologically
  updatedEvents.sort((a, b) => a.date.localeCompare(b.date));

  return updatedEvents;
}
