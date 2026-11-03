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
const up = '(?:sube|suben|subio|subieron|trepa|trepan|trepo|avanza|avanzan|avanzo|repunta|repuntan|repunto|se dispara|se disparan|se disparo)';
const down = '(?:cae|caen|cayo|cayeron|baja|bajan|bajo|bajaron|retrocede|retroceden|retrocedio|se desploma|se desploman|se desplomo)';
// A percentage between the verb and its commercial object is not a quote:
// "Apple subió un 5% el precio del iPhone", "YPF bajó 9% su producción".
const commercialObject = /^\s*(?:(?:un|una|en|hasta|cerca de|mas de|menos de|al menos|aproximadamente|nuevamente|de nuevo)\s+)*(?:[-+]?\d+(?:[.,]\d+)?\s*(?:%|por ciento)\s*)?(?:(?:el|la|los|las|su|sus)\s+)?(?:riesgo|inflacion|tasas?|tir|rendimientos?|costos?|ventas?|ingresos?|ganancias?|beneficios?|margenes?|produccion|reservas|salarios|precios?|tarifas?|inversion|deuda)\b/;

const deniedMovement = /\bno (?:ha |han |habia |habian )?(?:cae|caen|cayo|cayeron|baja|bajan|bajo|sube|suben|subio|subieron|retrocede|retrocedio)\b/;
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
  if (stockLike(asset) && asset.instrumentType !== 'CEDEAR de ETF') names.push(asset.issuer || '');
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

export function analyzeNewsRelevance(headline: string, assets: Asset[] = ASSET_CATALOG): NewsRelevanceAnalysis {
  const text = normalizeAssetText(headline);
  const affectedAssetIds = [...new Set(recognizeAssetIds(headline, assets))];
  const affected = assets.filter(asset => affectedAssetIds.includes(asset.id));
  const clauses = text.split(/\s+(?:mientras(?: que)?|pero|aunque|en tanto(?: que)?|por su parte|pese a|a pesar de|tras|ante|despues de|y)\s+|[;!?]+/);
  const isUncertain = uncertain.test(text);
  const assetImpacts: Record<string, NewsImpact> = {};
  let priceObserved = false;
  let materialEvent = false;
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
    assetImpacts[asset.id] = directions.size === 1 ? [...directions][0] : 'neutral';
  }
  let relevanceType: RelevanceType;
  if (isUncertain) relevanceType = 'ruido';
  else if (affected.length && (priceObserved || materialEvent)) relevanceType = 'impacto_precio';
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
      ? 'El titular aporta información sobre el emisor o su actividad, sin demostrar una variación del precio de sus instrumentos.'
      : relevanceType === 'contexto_macro'
        ? 'El titular describe una variable macroeconómica. Su relación con los instrumentos es contextual y no prueba una dirección de precio.'
        : 'El titular no aporta evidencia suficiente de un efecto direccional sobre los instrumentos; las opiniones o expectativas no se tratan como hechos confirmados.';
  const relationships = Object.fromEntries(affected.map(asset => {
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
