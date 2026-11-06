import { ASSET_CATALOG, normalizeAssetText } from '../data/assetCatalog.js';
import { recognizeAssetIds } from './assetNews.js';
import type { Asset, NewsImpact, NewsItem, RelevanceType } from '../types/index.js';

export interface NewsRelevanceAnalysis {
  affectedAssetIds: string[];
  relevanceType: RelevanceType;
  impact: NewsImpact;
  assetImpacts: Record<string, NewsImpact>;
  topicCategory: NewsItem['topicCategory'];
  relationships: Record<string, string>;
  explanation: string;
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasName = (text: string, value: string) => !!value && new RegExp(`(^|[^\\p{L}\\p{N}])${escape(normalizeAssetText(value))}([^\\p{L}\\p{N}]|$)`, 'u').test(text);
const debt = /\b(bonos?|deuda|cupon|canje|amortizacion|acreedores|default|obligaciones negociables|calificacion crediticia)\b/;
const macro = /\b(bcra|banco central|fed|reserva federal|inflacion|ipc|indec|pbi|politica monetaria|tasas de interes|encajes|reservas internacionales|riesgo pais|licitacion del tesoro|deficit fiscal|superavit fiscal)\b/;
const corporate = /\b(balance\w*|resultados?|ganancias?|beneficios?|perdidas?|costos?|ingresos?|margenes?|inversion\w*|fusion\w*|adquisicion\w*|dividendos?|recompra\w*|produccion|exportacion\w*|proyecto\w*|precios?|tarifas?|cupon|amortizacion|pagos?|tir|rendimientos?|rinde|contratos?|regulacion|sancion|litigio|multas?|iphone|ipad|productos?|demanda|ventas?|calificacion crediticia)\b/;
const uncertain = /\b(rumores?|trascendidos?|especulacion\w*|podria\w*|podr[aá]|esperan? que|se espera|expectativas?|pronostico\w*|analistas?|expertos?|recomienda\w*|potencial|sin confirmar|no confirmado)\b/;
const failedPayment = /\b(incumple|incumplio|incumplimiento|cesacion de pagos|no pago|no pagara|dejo de pagar)\b|\b(?:entra|entro|cae|cayo|declara|declaro|incurre|incurrio) (?:en )?default\b|\bsuspend\w* (?:el )?pago\b/;
const avoidedFailure = /\b(evita|evito|evitara|descarta|descarto|desmiente|desmintio|resuelve|resolvio)\b.{0,40}\b(default|incumplimiento|cesacion de pagos)\b|\bno (?:ha |habia |habra |se )?(?:incumplio|incumple|incumplira|hubo incumplimiento|entro en default)\b/;
const avoidedCredit = /\bno (?:ha |habia |se )?(?:suspend\w*|dejo de pagar|dejara de pagar)\b|\b(evita|evito|descarta|descarto|desmiente|desmintio)\b.{0,55}\b(rebaja|recorte|reduccion|default|incumplimiento|calificacion)\b/;
const lowerRating = /\b(rebaj\w*|reduc\w*|recort\w*)\b.{0,45}\bcalificacion\b|\bcalificacion\b.{0,35}\b(rebaj\w*|reduc\w*|recort\w*)\b/;
const higherRating = /\b(elev\w*|mejor\w*)\b.{0,45}\bcalificacion\b|\bcalificacion\b.{0,35}\b(elev\w*|mejor\w*)\b/;
const deniedRating = /\bno\b.{0,20}\b(mejor\w*|elev\w*|reduc\w*|rebaj\w*|recort\w*)\b.{0,45}\bcalificacion\b|\bcalificacion\b.{0,40}\bno\b.{0,20}\b(mejor\w*|elev\w*|reduc\w*|rebaj\w*|recort\w*)\b/;
const payment = /(?<!el )(?<!del )\b(paga|pagara|pago|abona|abonara|abono|anuncia|anuncio|declara|declaro|confirma|confirmo)\b.{0,45}\b(cupon|dividendos?|amortizacion)\b/;
const upSimple = '(?:sube|suben|subio|subieron|subiendo|trepa|trepan|trepo|treparon|avanza|avanzan|avanzo|avanzaron|repunta|repuntan|repunto|rebota|rebotan|reboto|rebotaron|salta|saltan|salto|saltaron|aumenta|aumentan|aumento|aumentaron|se recupera|se recuperan|se recupero|se recuperaron|se dispara|se disparan|se disparo|se dispararon)';
const downSimple = '(?:cae|caen|cayo|cayeron|cayendo|baja|bajan|bajo|bajaron|bajando|retrocede|retroceden|retrocedio|retrocedieron|se hunde|se hunden|se hundio|se hundieron|se desploma|se desploman|se desplomo|se desplomaron|se derrumba|se derrumban|se derrumbo|se derrumbaron)';
// A repeated observed movement is still a fact, unlike "podría volver a subir".
const up = `(?:${upSimple}|(?:vuelve|volvio|vuelven|volvieron) a (?:subir|trepar|avanzar|repuntar|rebotar|saltar|aumentar|recuperarse|dispararse))`;
const down = `(?:${downSimple}|(?:vuelve|volvio|vuelven|volvieron) a (?:caer|bajar|retroceder|hundirse|desplomarse|derrumbarse))`;
// A percentage between the verb and its commercial object is not a quote:
// "Apple subió un 5% el precio del iPhone", "YPF bajó 9% su producción".
const commercialObject = /^\s*(?:(?:un|una|en|hasta|cerca de|mas de|menos de|al menos|aproximadamente|nuevamente|de nuevo)\s+)*(?:[-+]?\d+(?:[.,]\d+)?\s*(?:%|por ciento)\s*)?(?:(?:el|la|los|las|su|sus)\s+)?(?:riesgo|inflacion|tasas?|tir|rendimientos?|costos?|ventas?|ingresos?|ganancias?|beneficios?|margenes?|produccion|reservas|salarios|precios?|tarifas?|inversion|deuda)\b/;

const deniedMovement = new RegExp(`\\bno (?:ha |han |habia |habian )?(?:${up}|${down})\\b`);
const stockLike = (asset: Asset) => asset.category === 'acciones' || asset.category === 'cedears' || asset.category === 'fondos';

function issuerIn(text: string, asset: Asset): boolean {
  return [asset.issuer || '', asset.name.replace(/\s*\(CEDEAR\).*$/i, ''), ...(asset.aliases || []).filter(alias => !/^[A-Z]{2}\d{2}D?$/.test(alias))].some(value => value.length >= 3 && hasName(text, value));
}
function relatedClause(text: string, asset: Asset): boolean {
  return hasName(text, asset.symbol) || issuerIn(text, asset);
}

function creditBelongsTo(clause: string, asset: Asset, affected: Asset[]): boolean {
  const issuers = new Set(affected.filter(other => relatedClause(clause, other)).map(other => other.issuer || other.id));
  if (issuers.size < 2) return true;
  const target = [asset.symbol, asset.issuer || ''].filter(Boolean).map(value => escape(normalizeAssetText(value))).join('|');
  const subject = new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${target})\\s*[:,]?\\s+(?:(?:ha|habia|se)\\s+)?(?:incumpl\\w*|no pago|no pagara|dejo de pagar|entra en default|entro en default|recibe|recibio|sufre|sufrio)\\b`, 'u');
  const object = new RegExp(`\\b(?:calificacion(?: crediticia)?|deuda|bonos?|cupon)\\s+(?:de|del|para)\\s+(?:la empresa\\s+)?(?:${target})(?=$|[^\\p{L}\\p{N}])`, 'u');
  return subject.test(clause) || object.test(clause);
}

/** A movement must have the security/company as its grammatical subject. A
 * verb elsewhere in the headline (costs, inflation, product prices) is not a quote. */
function priceDirections(text: string, asset: Asset): ('favorable' | 'alerta')[] {
  if (deniedMovement.test(text)) return [];
  const names = [asset.symbol];
  if (stockLike(asset) && asset.instrumentType !== 'CEDEAR de ETF') names.push(asset.issuer || '', ...(asset.aliases || []));
  const found = new Set<'favorable' | 'alerta'>();
  for (const name of names.filter(Boolean)) {
    const subject = escape(normalizeAssetText(name));
    const start = `(?:^|[^\\p{L}\\p{N}])${subject}(?:[^\\p{L}\\p{N}]|$)`;
    const addMovement = (prefix: string, movement: string, direction: 'favorable' | 'alerta') => {
      const match = new RegExp(`${prefix}${movement}\\b([^;!?]*)`, 'u').exec(text);
      if (match && !commercialObject.test(match[1])) found.add(direction);
    };
    addMovement(`${start}[\\s,:-]*`, up, 'favorable');
    addMovement(`${start}[\\s,:-]*`, down, 'alerta');
    const signedPercent = new RegExp(`${start}[\\s,:]*([+-])\\s*\\d+(?:[.,]\\d+)?\\s*%([^;!?]*)`, 'u').exec(text);
    if (signedPercent && !commercialObject.test(signedPercent[2])) found.add(signedPercent[1] === '+' ? 'favorable' : 'alerta');
    const security = '(?:acciones?|bonos?|cedears?|etfs?|cotizacion(?:es)?|papeles)';
    const prefix = `\\b${security}\\s+(?:de\\s+)?${subject}(?:[^\\p{L}\\p{N}]|$)[\\s,:-]*`;
    addMovement(prefix, up, 'favorable');
    addMovement(prefix, down, 'alerta');
    const inverse = `\\s+(?:(?:las?|los?)\\s+)?${security}\\s+(?:de\\s+)?${subject}(?:[^\\p{L}\\p{N}]|$)`;
    if (new RegExp(`\\b${up}\\b${inverse}`, 'u').test(text)) found.add('favorable');
    if (new RegExp(`\\b${down}\\b${inverse}`, 'u').test(text)) found.add('alerta');
    if (new RegExp(`${start}[\\s,:]*(?:gana|ganan|gano)\\s+\\d+(?:[.,]\\d+)?\\s*(?:%|puntos)`, 'u').test(text)) found.add('favorable');
    if (new RegExp(`${start}[\\s,:]*(?:pierde|pierden|perdio)\\s+\\d+(?:[.,]\\d+)?\\s*(?:%|puntos)`, 'u').test(text)) found.add('alerta');
  }
  return [...found];
}

type MarketSignal = { direction: 'favorable' | 'alerta'; kind: 'spread' | 'family' };
const sovereignBond = (asset: Asset) => asset.category === 'bonos' && asset.issuer === 'República Argentina';
// Read the verb attached to this metric/group, never a direction from another
// clause. A sector signal is a valuation input, not an individual species quote.
function sovereignMarketSignals(clause: string): MarketSignal[] {
  if (/\b(brasil|brazil|chile|uruguay|paraguay|peru|colombia|venezuela|ecuador|mexico|estados unidos|eeuu|espana|italia|alemania|francia|japon|china)\b/.test(clause)) return [];
  const metric = 'riesgo pais(?: (?:argentino|de (?:la )?argentina))?';
  const family = '(?:bonos (?:soberanos(?: argentinos)?|argentinos|en dolares(?: argentinos)?)|titulos publicos(?: argentinos)?)';
  const modifiers = '(?:\\s+(?:ya|hoy|sigue|siguio|continua|continuo|vuelve a|volvio a|nuevamente|de nuevo))*';
  const signals: MarketSignal[] = [];
  for (const [subject, kind] of [[metric, 'spread'], [family, 'family']] as const) {
    for (const [movement, direction] of [[up, 'favorable'], [down, 'alerta']] as const) {
      const patterns = [new RegExp(`\\b${subject}${modifiers}\\s+${movement}\\b([^;!?]*)`, 'gu'), new RegExp(`\\b${movement}\\s+(?:(?:el|la|los|las)\\s+)?${subject}\\b([^;!?]*)`, 'gu')];
      for (const pattern of patterns) for (const match of clause.matchAll(pattern)) {
        const before = clause.slice(0, match.index);
        if (/\b(?:no|sin|evita|evito|descarta|descarto|niega|nego)(?:\s+\w+){0,3}\s*$/.test(before)) continue;
        if (commercialObject.test(match[1]) || /^\s+(?:presion|ley|analisis)\b/.test(match[1])) continue;
        // Rising sovereign risk is adverse; a falling spread is favorable.
        signals.push({ kind, direction: kind === 'spread' ? direction === 'favorable' ? 'alerta' : 'favorable' : direction });
      }
    }
  }
  return signals;
}

export function analyzeNewsRelevance(headline: string, assets: Asset[] = ASSET_CATALOG): NewsRelevanceAnalysis {
  const text = normalizeAssetText(headline);
  const affectedAssetIds = [...new Set(recognizeAssetIds(headline, assets))];
  const affected = assets.filter(asset => affectedAssetIds.includes(asset.id));
  const clauses = text.split(/\s+(?:mientras(?: que)?|pero|aunque|en tanto(?: que)?|por su parte|pese a|a pesar de|tras|ante|despues de|y)\s+|[;!?]+/);
  const isUncertain = uncertain.test(text);
  const assetImpacts: Record<string, NewsImpact> = {};
  let priceObserved = false;
  let materialEvent = false;
  const marketSignals: Record<string, MarketSignal[]> = {};
  const sovereignSignals = !isUncertain && affected.some(sovereignBond) ? clauses.flatMap(sovereignMarketSignals) : [];
  for (const asset of affected) {
    const directions = new Set<NewsImpact>();
    for (const clause of clauses.filter(clause => relatedClause(clause, asset))) {
      const price = priceDirections(clause, asset);
      if (price.length) priceObserved = true;
      if (!isUncertain) price.forEach(direction => directions.add(direction));
      // Credit/payment facts are material; scheduled cash flow alone does not
      // demonstrate a favorable market reaction.
      const belongs = creditBelongsTo(clause, asset, affected) && !avoidedCredit.test(clause);
      const creditFailure = belongs && failedPayment.test(clause) && (debt.test(clause) || /\b(pagos?|vencimientos?)\b/.test(clause)) && !avoidedFailure.test(clause);
      const creditDown = belongs && lowerRating.test(clause) && !deniedRating.test(clause);
      const creditUp = belongs && higherRating.test(clause) && !deniedRating.test(clause);
      if (creditFailure || creditDown || creditUp) materialEvent = true;
      if (!isUncertain && !avoidedFailure.test(clause)) {
        if (creditFailure || creditDown) directions.add('alerta');
        if (creditUp) directions.add('favorable');
      }
    }
    // Directly attributed movements/credit facts take precedence over a broad
    // group signal (AL30 can fall on a day when other sovereign bonds rebound).
    if (!directions.size && !isUncertain && sovereignBond(asset)) {
      const signals = sovereignSignals;
      if (signals.length) { marketSignals[asset.id] = signals; signals.forEach(signal => directions.add(signal.direction)); }
    }
    assetImpacts[asset.id] = directions.size === 1 ? [...directions][0] : 'neutral';
  }
  let relevanceType: RelevanceType;
  if (isUncertain) relevanceType = 'ruido';
  else if (affected.length && (priceObserved || materialEvent)) relevanceType = 'impacto_precio';
  else if (Object.keys(marketSignals).length) relevanceType = 'valoracion_mercado';
  else if (macro.test(text) && !affected.some(asset => stockLike(asset) && issuerIn(text, asset))) relevanceType = 'contexto_macro';
  else if (affected.length && (corporate.test(text) || payment.test(text))) relevanceType = 'valoracion_mercado';
  else relevanceType = 'ruido';
  if (relevanceType === 'contexto_macro' || relevanceType === 'ruido') affectedAssetIds.forEach(id => { assetImpacts[id] = 'neutral'; });
  const directions = new Set(Object.values(assetImpacts).filter(impact => impact !== 'neutral'));
  const impact: NewsImpact = directions.size === 1 ? [...directions][0] : 'neutral';
  const explanation = relevanceType === 'impacto_precio'
    ? priceObserved ? 'El titular informa una variación de cotización de instrumentos identificados. Esa observación no establece su evolución futura.'
      : 'El titular informa un hecho de pago o de crédito relacionado con instrumentos identificados. No informa por sí solo una variación de cotización.'
    : relevanceType === 'valoracion_mercado'
      ? Object.keys(marketSignals).length
        ? 'El titular informa un movimiento del conjunto de bonos soberanos o de su prima de riesgo. Se clasifica la señal de valoración favorable o adversa para esa deuda, sin afirmar una cotización individual ni anticipar precios.'
        : 'El titular aporta información sobre el emisor o su actividad, sin demostrar una variación del precio de sus instrumentos.'
      : relevanceType === 'contexto_macro'
        ? 'El titular describe una variable macroeconómica. Su relación con los instrumentos es contextual y no prueba una dirección de precio.'
        : 'El titular no aporta evidencia suficiente de un efecto direccional sobre los instrumentos; las opiniones o expectativas no se tratan como hechos confirmados.';
  const relationships = Object.fromEntries(affected.map(asset => {
    if (marketSignals[asset.id]?.length) {
      const signal = marketSignals[asset.id].some(item => item.kind === 'family') ? 'un movimiento del conjunto de bonos soberanos en dólares' : 'una variación del riesgo país argentino';
      return [asset.id, `El titular informa ${signal}, una referencia de valoración para ${asset.symbol}. La clasificación refleja esa señal del conjunto; no demuestra la cotización ni una variación del precio de esta especie.`];
    }
    const exact = hasName(text, asset.symbol);
    const namedIssuer = !!asset.issuer && hasName(text, asset.issuer);
    const pairedSpecies = asset.category === 'bonos' && asset.aliases?.some(alias => /^[A-Z]{2}\d{2}D?$/.test(alias) && hasName(text, alias));
    const namedReference = issuerIn(text, asset);
    const link = exact ? `El titular identifica ${asset.symbol}` : pairedSpecies
      ? `El titular identifica otra especie del mismo bono que ${asset.symbol}; esa relación no prueba el precio de la especie seleccionada`
      : asset.instrumentType === 'CEDEAR de ETF' && namedReference
        ? `El titular menciona el índice o referencia del ETF de ${asset.symbol}, sin demostrar la cotización local del CEDEAR`
        : namedIssuer ? `El titular menciona al emisor de ${asset.symbol}, ${asset.issuer}` : namedReference
          ? `El titular identifica a la empresa o referencia vinculada con ${asset.symbol}`
          : `La relación de ${asset.symbol} es de contexto económico, no una mención específica del instrumento`;
    return [asset.id, `${link}. ${assetImpacts[asset.id] === 'neutral' ? 'No se establece una dirección de cotización para esta especie.' : 'La dirección se limita al hecho expresado en el titular, sin proyectar una cotización futura.'}`];
  }));
  const energy = affected.some(asset => ['YPFD', 'PAMP', 'XOM', 'CVX', 'PBR', 'YMCJO'].includes(asset.id));
  const tech = affected.some(asset => ['AAPL', 'MSFT', 'NVDA', 'AMD', 'GOOGL', 'META', 'TSLA', 'INTC', 'TSM'].includes(asset.id));
  const topicCategory: NewsItem['topicCategory'] = relevanceType === 'contexto_macro'
    ? /\b(dolar|mep|ccl|cambiari\w*|encajes)\b/.test(text) ? 'regulaciones_bcra' : 'macro_tasas'
    : affected.some(asset => ['bonos', 'corporativos', 'provinciales', 'tesoro'].includes(asset.category)) ? 'deuda_soberana'
      : energy ? 'energia' : tech ? 'cedears_tech' : 'balances';
  return { affectedAssetIds, relevanceType, impact, assetImpacts, topicCategory, relationships, explanation };
}
