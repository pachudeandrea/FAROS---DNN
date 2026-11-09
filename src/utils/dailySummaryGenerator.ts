import { Portfolio, NewsItem, CalendarEvent } from '../types/index';
import { NowAR, getNowAR } from './dateAR';
import { calculateEstimatedDuration } from './audioController';
import { getPortfolioAffectedAssetIds, getPortfolioNewsImpact } from './portfolioNews';
import { distinctMediaSources } from './sourceGrounding';
import { portfolioAssets, normalizeAssetText } from '../data/assetCatalog';
import { sourcesCoverSameEvent } from './newsCoverage';
import { argentinaNewsDay } from './dailyNews';
import type { Asset, MediaCoverage } from '../types/index';

export interface DailySummaryResult {
  script: string;
  wordCount: number;
  durationText: string;
  durationSeconds: number;
  timeSlot: 'manana' | 'mediodia' | 'cierre';
  generatedAtIso: string;
  disclaimerNotice?: string;
}

/**
 * Counts words accurately in Spanish text.
 */
export function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Determines the market day slot in Argentina timezone.
 * Mañana: < 12:00
 * Mediodía: 12:00 - 16:00
 * Cierre: >= 16:00
 */
export function getTimeSlot(hour: number): 'manana' | 'mediodia' | 'cierre' {
  if (hour < 12) return 'manana';
  if (hour < 16) return 'mediodia';
  return 'cierre';
}

/**
 * Naturalizes text for natural Argentine Rioplatense neural speech synthesis.
 * - Short conversational sentences with voseo
 * - Replaces symbols (%, $, &, /) with natural spoken words ("por ciento", "dólares", "pesos", "y")
 * - Spells out tickers and acronyms ("AL treinta", "GD treinta", "dólar MEP", "S y P quinientos")
 * - Removes abbreviations that TTS can mispronounce
 */
export function naturalizeScriptForSpeech(raw: string): string {
  if (!raw) return '';

  let text = raw;

  // Clean markdown or html tags
  text = text.replace(/<[^>]*>/g, ' ');
  text = text.replace(/[*#_~`]/g, '');

  // 1. Specific index and ticker replacements before generic & or / replacements
  text = text.replace(/\bS\s*&\s*P\s*500\b/gi, 'S y P quinientos');
  text = text.replace(/\bS\s*&\s*P\b/gi, 'S y P');
  text = text.replace(/\bSPY\b/g, 'S y P quinientos');
  text = text.replace(/\bAL30\b/g, 'A L treinta');
  text = text.replace(/\bGD30\b/g, 'G D treinta');
  text = text.replace(/\bAL29\b/g, 'A L veintinueve');
  text = text.replace(/\bGD35\b/g, 'G D treinta y cinco');
  text = text.replace(/\bGD38\b/g, 'G D treinta y ocho');
  text = text.replace(/\bGD46\b/g, 'G D cuarenta y seis');
  text = text.replace(/\bYPFD\b/g, 'YPF');
  text = text.replace(/\bGGAL\b/g, 'Galicia');
  text = text.replace(/\bPAMP\b/g, 'Pampa Energía');
  text = text.replace(/\bBOPREAL\b/g, 'Bopreal');
  text = text.replace(/\bMELI\b/g, 'MercadoLibre');
  text = text.replace(/\bMSFT\b/g, 'Microsoft');
  text = text.replace(/\bAAPL\b/g, 'Apple');
  text = text.replace(/\bNVDA\b/g, 'Nvidia');
  text = text.replace(/\bBBAR\b/g, 'Banco Francés');
  text = text.replace(/\bBMA\b/g, 'Banco Macro');
  text = text.replace(/\bTXAR\b/g, 'Ternium');
  text = text.replace(/\bEDN\b/g, 'Edenor');
  text = text.replace(/\bCRES\b/g, 'Cresud');
  text = text.replace(/\bCEPU\b/g, 'Central Puerto');
  text = text.replace(/\bTGSU2\b/g, 'Transportadora de Gas del Sur');
  text = text.replace(/\bLECAPS?\b/gi, 'Lecaps');
  text = text.replace(/\bBONCER\b/gi, 'Boncer');

  // Currency & MEP: avoid "dólar dólar MEP"
  text = text.replace(/\bd[oó]lar\s+MEP\b/gi, 'dólar MEP');
  text = text.replace(/\b(?<!d[oó]lar\s)MEP\b/gi, 'dólar MEP');
  text = text.replace(/\bd[oó]lar\s+CCL\b/gi, 'dólar Contado con Liquidación');
  text = text.replace(/\b(?<!d[oó]lar\s)CCL\b/gi, 'Contado con Liquidación');

  // Abbreviations to spoken words
  text = text.replace(/\bvs\.?\s*/gi, 'frente a ');
  text = text.replace(/\bej\.?\s*/gi, 'por ejemplo ');
  text = text.replace(/\betc\.?\s*/gi, 'entre otras variables ');
  text = text.replace(/\baprox\.?\s*/gi, 'aproximadamente ');
  text = text.replace(/\bpb\b/gi, 'puntos básicos');
  text = text.replace(/\bbps\b/gi, 'puntos básicos');
  text = text.replace(/\bTIR\b/g, 'tasa interna de retorno');
  text = text.replace(/\bBYMA\b/g, 'Bolsas y Mercados Argentinos');
  text = text.replace(/\bMAE\b/g, 'Mercado Abierto Electrónico');
  text = text.replace(/\bCNV\b/g, 'Comisión Nacional de Valores');
  text = text.replace(/\bBCRA\b/g, 'Banco Central');
  text = text.replace(/Banco Central de la Rep[uú]blica Argentina\s*\(?Banco Central\)?/gi, 'Banco Central');
  text = text.replace(/\bMULC\b/g, 'mercado libre de cambios');
  text = text.replace(/\bADR\b/g, 'A D R');

  // Numbers & Symbols to words
  text = text.replace(/(\d+)[.,](\d+)\s*%/g, '$1 coma $2 por ciento');
  text = text.replace(/(\d+)\s*%/g, '$1 por ciento');
  text = text.replace(/%/g, ' por ciento');
  const spokenNumber = (value: string) => value.replace(/\.(?=\d{3}(?:[.,]|$))/g, '').replace(/[.,]/, ' coma ');
  text = text.replace(/(?:u\$s|\busd)\s*(\d+(?:[.,]\d+)*)(?:\s+(mill(?:ones|ón|on)|bill(?:ones|ón|on)))?/gi,
    (_match, amount: string, scale: string | undefined) => `${spokenNumber(amount)}${scale ? ` ${scale} de` : ''} dólares`);
  text = text.replace(/\$\s*(\d+(?:[.,]\d+)*)(?:\s+(mill(?:ones|ón|on)|bill(?:ones|ón|on)))?/g,
    (_match, amount: string, scale: string | undefined) => `${spokenNumber(amount)}${scale ? ` ${scale} de` : ''} pesos`);
  text = text.replace(/\$/g, 'pesos');
  text = text.replace(/\s*&\s*/g, ' y ');
  text = text.replace(/(\w+)\/(\w+)/g, '$1 o $2');

  // Remove parenthesis, brackets and strange quotes
  text = text.replace(/[()[\]{}"«»]/g, ' ');

  // Standardize spaces and punctuation
  text = text.replace(/\s+/g, ' ');
  text = text.replace(/\s+([.,;:])/g, '$1');
  text = text.trim();

  return text;
}

type NarrativeContext = { channels: Set<string>; interpretations: Set<string> };
const narrativeContext = (): NarrativeContext => ({ channels: new Set(), interpretations: new Set() });
const advice = /\b(?:recomiend\w*|recomendamos|aconsej\w*|conviene|deberias|tenes que (?:comprar|vender)|compra ahora|vende ahora|hay que (?:comprar|vender)|objetivo de precio|rentabilidad garantizada|ganancia garantizada|oportunidad de (?:compra|inversion)|(?:puede ser|seria|es|resulta) (?:una? )?(?:buena?|excelente|mejor|atractiva?) inversion|tiene sentido para quien|(?:mejor|buena|recomendable) (?:opcion|alternativa).{0,20}(?:comprar|vender|invertir))\b|(?:^|[.!?;:]\s*)(?:compra|vende|inverti|compralo|vendelo)\s+(?!(?:de|del)\b)/;
const plain = (value: string) => value.replace(/<[^>]*>/g, ' ').replace(/https?:\/\/\S+/g, '').replace(/([.!?])(?=[A-ZÁÉÍÓÚÑ])/g, '$1 ').replace(/\s+/g, ' ').trim();
const sentenceEnd = (value: string) => /[.!?…]$/.test(value) ? value : `${value}.`;
const joinNames = (names: string[]) => names.length < 2 ? names[0] || 'tus activos' : `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`;
const companyName = (value: string) => value.replace(/\s*\(CEDEAR\).*$/i, '').replace(/(?:,?\s+(?:inc\.?|corporation|corp\.?|s\.?a\.?|plc|llc))$/i, '').trim();
const assetLabel = (asset: Asset | undefined, id: string) => {
  if (!asset) return id;
  if (asset.category === 'divisas') return asset.symbol;
  if (asset.instrumentType === 'CEDEAR de ETF') return asset.aliases?.[0] || companyName(asset.name);
  return asset.issuer && asset.issuer !== 'República Argentina' ? companyName(asset.issuer) : asset.symbol;
};
const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function namesFor(asset: Asset): string[] {
  return [...new Set([asset.symbol, asset.issuer || '', asset.name, ...(asset.aliases || [])]
    .map(value => normalizeAssetText(companyName(value))).filter(value => value.length >= 3))];
}
function namesAsset(text: string, asset: Asset): boolean {
  return namesFor(asset).some(name => new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped(name)}(?=$|[^\\p{L}\\p{N}])`, 'u').test(text));
}
function assetClauses(news: NarrativeNews, asset: Asset): string {
  return news.text.split(/\s+(?:mientras(?: que)?|pero|aunque|en tanto(?: que)?|por su parte|tras|ante|despues de|durante|y)\s+|[;!?]+|\.\s+/)
    .filter(clause => namesAsset(clause, asset)).join('. ');
}

type NarrativeNews = { item: NewsItem; sources: MediaCoverage[]; selected: string[]; assets: Asset[]; text: string; referenceOnly: boolean; comparisonOnly: boolean };
function prepareNarrative(portfolio: Portfolio, item: NewsItem, allowUnrelated = false): NarrativeNews | null {
  const selected = getPortfolioAffectedAssetIds(item, portfolio.assetIds);
  const sources = distinctMediaSources(item.sources).filter(source => source.originalHeadline?.trim());
  if (!selected.length && !allowUnrelated || !sources.length || !item.headline?.trim() || !['confirmado', 'en_analisis'].includes(item.factCheck.status)) return null;
  const catalog = portfolioAssets(portfolio);
  const assets = selected.flatMap(id => catalog.filter(asset => asset.id === id));
  // A publisher's excerpt is the evidence. Generated summaries and scripts are
  // never fed back as facts about the company or the portfolio.
  const text = normalizeAssetText(`${sources[0].originalHeadline}. ${sources[0].articleSummary || ''}`);
  const headline = normalizeAssetText(sources[0].originalHeadline);
  const referenceOnly = assets.some(asset => [asset.issuer || '', asset.name, ...(asset.aliases || [])].some(value => {
    const name = normalizeAssetText(companyName(value)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/mercadolibre/g, 'mercado\\s*libre');
    return name.length >= 3 && new RegExp(`\\b(?:la|el)\\s+(?:proxim[ao]|nuev[ao]|siguiente)\\s+${name}\\b`, 'u').test(headline);
  }));
  const comparisonOnly = assets.some(asset => asset.instrumentType === 'CEDEAR de ETF') && /\b(?:inversion|invertir|conviene|ladrillos)\b/.test(headline) && /\b(?:vs|frente|compar\w*|cual|gana)\b/.test(headline);
  return { item, sources, selected, assets, text, referenceOnly: referenceOnly || comparisonOnly, comparisonOnly };
}

/** Select complete publisher sentences, avoiding recommendations and repeated
 * headline/deck copies. Never cut before a negation or invent missing detail. */
function publisherFact(news: NarrativeNews): string {
  const summary = plain(news.sources[0].articleSummary || '').slice(0, 1200);
  const sentences = summary && typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter('es-AR', { granularity: 'sentence' }).segment(summary)].map(part => part.segment.trim())
    : summary.split(/(?<=[.!?])\s+/u);
  const unique = new Set<string>();
  const candidates: { sentence: string; index: number; score: number }[] = [];
  for (const [index, raw] of sentences.entries()) {
    const sentence = plain(raw).replace(/^(?:Valor del|Precio del|A cu[aá]nto (?:cotiza|opera))[^.!?]{0,140}?\s+(?=El d[oó]lar|La divisa)/i, '');
    const normalized = normalizeAssetText(sentence).replace(/[.!?…]+$/g, '');
    if (sentence.length < 20 || sentence.length > 360 || advice.test(normalized) || unique.has(normalized)
      || /[¿?]/.test(sentence) || /^(?:la|el) (?:primera?|segunda?|tercera?|ultima?|otra|otro|variable)\b|^(?:tambien|esa|ese|esas|esos|esto|aquello)\b|^todo (?:esto|ello|se puede traducir|puede derivar|se traduce)\b/.test(normalized)
      || summary.length >= 1190 && raw === sentences.at(-1) && !/[.!?…]$/.test(raw)) continue;
    unique.add(normalized);
    const company = news.assets.some(asset => namesAsset(normalized, asset));
    const sovereign = news.assets.some(asset => asset.category === 'bonos' && asset.issuer === 'República Argentina')
      && /\b(?:riesgo pais|bonos(?: en dolares| argentinos| soberanos)?|deuda|vencimientos?|refinanci\w*)\b/.test(normalized);
    const financial = /\b(?:riesgo pais|bonos?|deuda|cotiza\w*|capitalizacion|tasa\w*|margen\w*|ganancia\w*|ingreso\w*|costo\w*|produccion|exportaci\w*|indemnizaci\w*|fallo\w*|conden\w*|embargo\w*|sancion\w*|justicia|s&p|nasdaq|dolar\w*)\b/.test(normalized);
    const observed = /\b(?:subi\w*|sube\w*|cay\w*|cae\w*|cayeron|baj\w*|aument\w*|reduj\w*|reduc\w*|creci\w*|perdio|perdieron|evapor\w*|ordeno|anulo|rechazo|cotiza\w*)\b/.test(normalized);
    const opinion = /\b(?:es clave|es importante|parece|sobrerreaccion|en mi opinion|a mi juicio|preocupante)\b/.test(normalized);
    const duplicateTitle = normalized === normalizeAssetText(news.sources[0].originalHeadline).replace(/[.!?…]+$/g, '');
    candidates.push({ sentence: sentenceEnd(sentence), index, score: Number(company) * 5 + Number(sovereign) * 4 + Number(financial) * 2 + Number(observed) * 2 + Number(/\d/.test(normalized) && financial) - Number(opinion) * 3 - Number(duplicateTitle) * 8 });
  }
  candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  const accepted = candidates.slice(0, 2);
  if (accepted.length > 1 && accepted.reduce((sum, value) => sum + value.sentence.length, 0) > 280) accepted.pop();
  if (accepted.length) return accepted.sort((a, b) => a.index - b.index).map(value => value.sentence).join(' ');
  const headline = plain(news.sources[0].originalHeadline);
  return advice.test(normalizeAssetText(headline)) ? 'La publicación disponible no aporta un hecho que podamos resumir sin reproducir una recomendación.' : sentenceEnd(headline);
}

function exposureLabel(news: NarrativeNews, ids = news.selected): string {
  const assets = news.assets.filter(asset => ids.includes(asset.id));
  const sovereign = assets.length === ids.length && assets.every(asset => asset.category === 'bonos' && asset.issuer === 'República Argentina');
  if (sovereign) return ids.length === 1 ? `tu bono ${ids[0]}` : `tus bonos ${joinNames(ids)}`;
  const names = [...new Set(ids.map(id => assetLabel(news.assets.find(asset => asset.id === id), id)))];
  return `tu exposición a ${joinNames(names)}`;
}

function explainTransmission(news: NarrativeNews, context: NarrativeContext): string[] {
  const lines: string[] = [];
  const { text, assets } = news;
  let recognized = false;
  const add = (key: string, line: string) => { recognized = true; if (!context.channels.has(key)) { context.channels.add(key); lines.push(line); } };
  const sovereign = assets.filter(asset => asset.category === 'bonos' && asset.issuer === 'República Argentina');
  const debt = assets.filter(asset => ['bonos', 'provinciales', 'corporativos', 'tesoro'].includes(asset.category));
  const equities = assets.filter(asset => ['acciones', 'cedears', 'fondos'].includes(asset.category) && asset.instrumentType !== 'CEDEAR de ETF');
  const funds = assets.filter(asset => asset.instrumentType === 'CEDEAR de ETF');
  const fx = assets.filter(asset => asset.category === 'divisas');
  const legalTerms = /\b(?:justicia|tribunal\w*|juez\w*|corte|juicio\w*|judicial\w*|litigio\w*|conden\w*|fallo\w*|sentencia\w*|embarg\w*|indemnizaci\w*|amicus|jurisdiccion)\b/;
  const marketTerms = /\b(?:bolsa|wall street|cotiza\w*|acciones|indice|nasdaq|s&p|capitalizacion|toma de ganancias)\b/;
  const resultsTerms = /\b(?:balance\w*|resultados? (?:trimestrales?|anuales?|operativos?)|ganancias? (?:trimestrales?|anuales?|record)|beneficios?|ingresos?|margenes?|costos?|ebitda|ventas?)\b/;
  const legalAssets = equities.filter(asset => legalTerms.test(assetClauses(news, asset)));
  const governanceAssets = equities.filter(asset => {
    const clauses = assetClauses(news, asset);
    return /\b(?:ceo|director ejecutivo|consejo de administracion|conduccion)\b/.test(clauses)
      && /\b(?:investiga\w*|espionaje|espia\w*|inteligencia extranjera)\b/.test(clauses);
  });
  const resultsAssets = equities.filter(asset => {
    const clauses = assetClauses(news, asset).replace(/\btoma de ganancias\b/g, '');
    return resultsTerms.test(clauses) || /\b(?:presento|publico|reporto|difundio)\b.{0,25}\bresultados\b/.test(clauses);
  });
  const marketAssets = equities.filter(asset => news.item.relevanceType !== 'contexto_macro' && news.item.relevanceType !== 'ruido'
    && !legalAssets.includes(asset) && !resultsAssets.includes(asset) && !governanceAssets.includes(asset)
    && (marketTerms.test(assetClauses(news, asset)) || namesAsset(text, asset) && marketTerms.test(text)));
  const operationsAssets = equities.filter(asset => /\b(?:produccion|exportaci\w*|petroleo|crudo|gasoducto|oleoducto|energia|inversion\w*)\b/.test(assetClauses(news, asset)));
  if (sovereign.length && /\b(?:riesgo pais|prima de riesgo|bonos soberanos|deuda soberana)\b/.test(text)) {
    add('sovereign-risk', `Para ${exposureLabel(news, sovereign.map(asset => asset.id))}, el canal es la prima que exige el mercado para financiar al Estado. Esa exigencia de rendimiento influye en la valoración de la deuda.`);
  } else if (debt.length && /\b(?:deuda|bonos?|cupon|pagos?|vencimiento\w*|default|calificacion)\b/.test(text)) {
    add(`debt:${debt.map(asset => asset.id).join(',')}`, `En ${exposureLabel(news, debt.map(asset => asset.id))}, importa la capacidad del emisor de pagar intereses y devolver el capital.`);
  }
  if (sovereign.length && /\b(?:pagar|pago|vencimiento\w*|refinanciar|refinanciacion)\b/.test(text)) {
    add('sovereign-funding', `En ${exposureLabel(news, sovereign.map(asset => asset.id))}, importa cómo el Estado consigue los dólares para pagar y refinanciar sus vencimientos. Esa capacidad de pago es parte del riesgo que asumen tus bonos.`);
  }
  if (legalAssets.length) {
    const label = exposureLabel(news, legalAssets.map(asset => asset.id));
    const legalText = legalAssets.map(asset => assetClauses(news, asset)).join(' ');
    const direction = getPortfolioNewsImpact(news.item, { assetIds: legalAssets.map(asset => asset.id), assetPositions: {} });
    if (direction === 'favorable' || direction === 'positivo') {
      add(`legal-relief:${equities.map(asset => asset.id).join(',')}`, `El canal para ${label} es la exposición legal. Una resolución que reduce o levanta una obligación o una restricción alivia un factor de riesgo del negocio.`);
    } else if (direction !== 'neutral' && /\b(?:pagar|pago|indemnizaci\w*|multa\w*)\b/.test(legalText)) {
      add(`legal-payment:${equities.map(asset => asset.id).join(',')}`, `El vínculo con ${label} es la exposición legal: una obligación de pago puede comprometer recursos de la compañía. Esa es una señal de valoración, aunque la nota no mida una reacción bursátil.`);
    } else if (direction !== 'neutral' && /\b(?:control|acciones|participacion|embarg\w*)\b/.test(legalText)) {
      add(`legal-control:${equities.map(asset => asset.id).join(',')}`, `El vínculo con ${label} está en las restricciones sobre activos o acciones y en el control de la compañía. La responsabilidad del Estado no equivale automáticamente a deuda de la empresa.`);
    } else {
      add(`legal-watch:${equities.map(asset => asset.id).join(',')}`, `Para ${label}, el proceso merece seguimiento por su posible efecto sobre la exposición legal. Con este texto no podemos atribuir una nueva obligación de pago o un cambio concreto de control a la compañía.`);
    }
  }
  if (resultsAssets.length) {
    add(`results:${resultsAssets.map(asset => asset.id).join(',')}`, `En ${exposureLabel(news, resultsAssets.map(asset => asset.id))}, el vínculo es la capacidad de generar resultados: ingresos, costos y márgenes sostienen la valoración del negocio.`);
  }
  if (governanceAssets.length) {
    add(`governance:${governanceAssets.map(asset => asset.id).join(',')}`, `Para ${exposureLabel(news, governanceAssets.map(asset => asset.id))}, la investigación reportada sobre la conducción de la empresa agrega incertidumbre de gobierno corporativo y reputación. Ese riesgo puede influir en la confianza de los inversores y en la valoración de la compañía.`);
  }
  if (marketAssets.length) {
    add(`market:${marketAssets.map(asset => asset.id).join(',')}`, `Para ${exposureLabel(news, marketAssets.map(asset => asset.id))}, importa su sensibilidad al sector y a la disposición de los inversores a asumir riesgo. Es un canal de valoración de mercado, no una medida de sus ventas o ganancias.`);
  } else if (operationsAssets.length) {
    add(`operations:${operationsAssets.map(asset => asset.id).join(',')}`, `Para ${exposureLabel(news, operationsAssets.map(asset => asset.id))}, el canal es la actividad del negocio y su capacidad de generar fondos.${/\b(?:anunci\w*|proyecto\w*|inversion\w*)\b/.test(text) ? ' Un proyecto anunciado no equivale a ingresos ya obtenidos.' : ''}`);
  }
  if (funds.length && !news.comparisonOnly) {
    add(`funds:${funds.map(asset => asset.id).join(',')}`, `Para ${exposureLabel(news, funds.map(asset => asset.id))}, el canal es el conjunto de acciones que sigue el fondo. El movimiento de su índice de referencia no equivale por sí solo a la cotización local del CEDEAR.`);
  }
  if (fx.length) {
    add(`fx:${fx.map(asset => asset.id).join(',')}`, `En ${exposureLabel(news, fx.map(asset => asset.id))}, el canal es el valor de conversión entre pesos y dólares. Una señal sobre los bonos no demuestra por sí sola un movimiento de esas cotizaciones cambiarias.`);
  }
  if (!recognized && !context.channels.has(`general:${news.item.relevanceType}`)) {
    if (news.item.relevanceType === 'contexto_macro') add('general:contexto_macro', 'La relación con tu cartera es indirecta: las condiciones de financiación, inflación o actividad pueden cambiar el entorno de los emisores. Esta publicación no mide por sí sola el efecto sobre tus instrumentos.');
    else if (news.item.relevanceType === 'ruido') add('general:ruido', 'La mención al activo no alcanza para establecer un cambio en el negocio o en su precio. La información disponible queda como contexto, sin convertir una expectativa en un hecho.');
    else if (news.item.relevanceType === 'impacto_precio') add('general:impacto_precio', `El movimiento informado corresponde a ${exposureLabel(news)}. Describe esa observación y no anticipa el siguiente movimiento.`);
    else add('general:valoracion_mercado', `La relación con ${exposureLabel(news)} está en la información sobre el emisor. El texto disponible no permite precisar un cambio concreto en sus flujos o en su exposición al riesgo.`);
  }
  return lines;
}

function explainPosition(news: NarrativeNews, portfolio: Portfolio, context: NarrativeContext): string[] {
  const groups = new Map<string, string[]>();
  for (const id of news.selected) {
    const effect = getPortfolioNewsImpact(news.item, { assetIds: [id], assetPositions: portfolio.assetPositions });
    const position = portfolio.assetPositions?.[id] === 'short' ? 'short' : 'long';
    const key = `${effect === 'positivo' ? 'favorable' : effect === 'negativo' ? 'alerta' : effect}:${position}`;
    const group = groups.get(key) || []; group.push(id); groups.set(key, group);
  }
  const lines: string[] = [];
  for (const [group, ids] of groups) {
    const key = `${group}:${ids.join(',')}:${news.item.factCheck.status}`;
    if (context.interpretations.has(key)) continue;
    context.interpretations.add(key);
    const [effect, position] = group.split(':');
    const label = exposureLabel(news, ids);
    const condition = news.item.factCheck.status === 'en_analisis' ? 'Si se confirma, ' : '';
    const start = condition || '';
    if (effect === 'favorable') lines.push(position === 'short'
      ? `${condition}${condition ? 'tu' : 'Tu'} posición vendida hace que una señal adversa para ${label} tenga el sentido contrario para tu exposición. No equivale a una ganancia realizada.`
      : `${start}${condition ? 'esta' : 'Esta'} información suma un factor favorable para ${label}, donde mantenés una posición comprada.`);
    else if (effect === 'alerta') lines.push(position === 'short'
      ? `${condition}${condition ? 'una' : 'Una'} señal favorable al activo juega en contra de tu posición vendida en ${label}.`
      : `${start}${condition ? 'esta' : 'Esta'} información suma un factor adverso para ${label}, donde mantenés una posición comprada.`);
    else if (news.item.relevanceType !== 'contexto_macro' && news.item.relevanceType !== 'ruido' && !context.interpretations.has('neutral-limit')) { context.interpretations.add('neutral-limit'); lines.push(`Para ${label}, esta noticia no alcanza para fijar una dirección; la exposición permanece y el efecto queda por confirmar.`); }
  }
  const directions = new Set([...groups.keys()].map(key => key.split(':')[0]).filter(effect => effect !== 'neutral'));
  if (directions.size > 1 && !context.interpretations.has('mixed')) {
    context.interpretations.add('mixed');
    lines.push('Hay efectos opuestos entre tus posiciones. Sin sus montos y ponderaciones no se puede calcular un resultado neto para la cartera.');
  }
  return lines;
}

function narrativeLines(portfolio: Portfolio, news: NarrativeNews, context: NarrativeContext): string[] {
  if (news.comparisonOnly) return [`${news.sources[0].mediaName} compara ${joinNames(news.assets.map(asset => assetLabel(asset, asset.id)))} con otras formas de inversión. Es una comparación de estrategias; no informa un hecho nuevo del fondo ni una variación de tu CEDEAR. No trasladamos sus recomendaciones a tu cartera.`];
  if (news.referenceOnly) return [`${news.sources[0].mediaName} usa ${joinNames(news.assets.map(asset => assetLabel(asset, asset.id)))} como comparación para hablar de otros negocios. Esa referencia no acredita un cambio en el emisor que tenés en cartera; el riesgo de esas inversiones no se traslada automáticamente a tu posición.`];
  const lines = news.item.factCheck.status === 'en_analisis' ? ['El hecho sigue en análisis; todavía no está confirmado.'] : [];
  lines.push(`Según ${news.sources[0].mediaName}: ${publisherFact(news)}`);
  lines.push(...explainTransmission(news, context), ...explainPosition(news, portfolio, context));
  return lines;
}

/** Narrates a single verified event through its relationship with the selected
 * portfolio. Used by the daily briefing and individual news audio alike. */
export function generatePortfolioNewsScript(portfolio: Portfolio, item: NewsItem): string {
  const news = prepareNarrative(portfolio, item, true);
  if (!news) return '';
  if (!news.selected.length) return naturalizeScriptForSpeech([
    ...(item.factCheck.status === 'en_analisis' ? ['El hecho sigue en análisis; todavía no está confirmado.'] : []),
    `Según ${news.sources[0].mediaName}: ${publisherFact(news)}`,
    'Esta noticia no se vincula con activos seleccionados en tu cartera actual; no atribuimos un efecto a tus posiciones.'
  ].join(' '));
  return naturalizeScriptForSpeech(narrativeLines(portfolio, news, narrativeContext()).join(' '));
}

/** A portfolio briefing: verified facts, transmission channels and exposure.
 * No price targets, trade recommendations or generated facts are introduced. */
export function generateDailySummaryScript(
  portfolio: Portfolio,
  newsList: NewsItem[],
  calendarEvents: CalendarEvent[],
  customNowAR?: NowAR
): DailySummaryResult {
  const nowAR = customNowAR || getNowAR();
  const timeSlot = getTimeSlot(nowAR.hour);
  const userTickers = new Set(portfolio.assetIds);
  const sections = [`Resumen FAROS del ${nowAR.formattedSpanish}, para ${portfolio.name || 'tu cartera principal'}.`];
  if (!userTickers.size) sections.push('Tu cartera no tiene activos seleccionados.');
  const prepared = newsList.flatMap(item => {
    const news = prepareNarrative(portfolio, item);
    if (!news) return [];
    const at = news.sources[0].publishedTimestamp ?? Date.parse(news.sources[0].publishedDateIso || '');
    return Number.isFinite(at) && argentinaNewsDay(at) !== nowAR.isoDate ? [] : [news];
  });
  const relevantNews: NarrativeNews[] = [];
  for (const news of prepared) {
    if (relevantNews.some(previous => previous.item.id === news.item.id || previous.sources.some(source => news.sources.some(other => other.sourceUrl === source.sourceUrl)) || sourcesCoverSameEvent(previous.sources[0], news.sources[0]))) continue;
    relevantNews.push(news);
  }
  const priority = (news: NarrativeNews) => news.referenceOnly ? -1 : ['alerta', 'negativo'].includes(getPortfolioNewsImpact(news.item, portfolio)) ? 3 : ['favorable', 'positivo'].includes(getPortfolioNewsImpact(news.item, portfolio)) ? 2 : news.item.relevanceType === 'valoracion_mercado' ? 1 : 0;
  relevantNews.sort((a, b) => priority(b) - priority(a));
  if (!relevantNews.length) sections.push('No hay noticias verificadas para tus activos en esta consulta. Esto no demuestra ausencia de riesgos.');
  else {
    const selected = relevantNews.slice(0, 6);
    sections.push(relevantNews.length > selected.length ? `Explicamos ${selected.length} de las ${relevantNews.length} novedades relacionadas con tu cartera, empezando por sus señales más directas.` : `El foco está en ${selected.length} ${selected.length === 1 ? 'novedad relacionada' : 'novedades relacionadas'} con tus activos.`);
    const context = narrativeContext();
    selected.forEach(news => sections.push(...narrativeLines(portfolio, news, context)));
  }

  const upcomingEvents = [...new Map(calendarEvents.map(event => [event.id, event])).values()]
    .filter(event => event.date >= nowAR.isoDate && (event.assetSymbol
      ? userTickers.has(event.assetSymbol)
      : event.isMacro || event.category === 'macro_bcra' || event.category === 'elecciones_politica'))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
  if (upcomingEvents.length) {
    sections.push('En tu calendario:');
    for (const event of upcomingEvents.slice(0, 3)) {
      const status = event.isCustom ? 'recordatorio personal, sin validación como evento oficial'
        : event.status === 'estimada' ? 'fecha estimada'
          : event.status === 'confirmada' ? 'confirmado en el calendario recibido'
            : event.status === 'realizado' ? 'registrado como realizado'
              : 'sin estado de confirmación informado';
      const asset = event.assetSymbol ? `, para ${event.assetSymbol}` : ', de alcance general';
      const time = event.time?.trim() ? `, a las ${event.time}` : ', sin horario informado';
      sections.push(`${event.title}${asset}, el ${event.date}${time}: ${status}.`);
    }
  } else {
    sections.push('No recibimos eventos próximos para tu cartera. Puede haber otros eventos o vencimientos.');
  }
  sections.push('Las lecturas de impacto son condicionales, no anticipan cotizaciones. Este resumen es informativo, sin recomendaciones de compra o venta.');

  const script = naturalizeScriptForSpeech(sections.join(' '));
  const durationEst = calculateEstimatedDuration(script, 1.0);
  return {
    script,
    wordCount: countWords(script),
    durationText: `${durationEst.formatted} min`,
    durationSeconds: durationEst.seconds,
    timeSlot,
    generatedAtIso: new Date().toISOString(),
  };
}
