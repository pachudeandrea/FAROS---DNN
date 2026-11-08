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
const judicial = /\b(juicios?|judicial\w*|litigios?|fallos?|sentencias?|tribunal\w*|justicia|juez\w*|jueza\w*|corte|apelaci\w*|embarg\w*|indemnizaci\w*|multas?|sancion\w*|amicus|jurisdiccion|derecho aplicable)\b|\bdemanda\s+(?:judicial|contra)\b/;
const corporate = /\b(balance\w*|resultados?|ganancias?|beneficios?|perdidas?|costos?|ingresos?|margenes?|ebitda|inversion\w*|fusion\w*|adquisicion\w*|dividendos?|recompra\w*|produccion|exportacion\w*|proyecto\w*|precios?|tarifas?|cupon|amortizacion|pagos?|tir|rendimientos?|rinde|contratos?|regulacion|sancion|litigio|multas?|iphone|ipad|productos?|demanda|ventas?|calificacion crediticia)\b/;
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

type Direction = 'favorable' | 'alerta';
type ValuationSignal = { direction: Direction; kind: 'judicial' | 'fundamental'; pending?: boolean };
const namesPattern = (asset: Asset) => [...new Set([asset.symbol, asset.issuer || '', ...(asset.aliases || [])])]
  .filter(value => value.length >= 3).map(value => escape(normalizeAssetText(value))).join('|');
const noEvent = /\b(?:no|nunca|sin)\b.{0,35}\b(?:conden\w*|fallos?|sentencias?|orden\w*|pag\w*|rechaz\w*|desestim\w*|revoc\w*|embarg\w*|gan\w*|perdi\w*|aument\w*|reduc\w*|reduj\w*|sub\w*|baj\w*|crec\w*|cay\w*|mejor\w*|record)\b/;

/** A lawsuit is a valuation topic, not proof of a price move. Attribution must
 * name the company receiving the decision, never just the lawsuit's nickname. */
function judicialSignals(clause: string, asset: Asset): ValuationSignal[] {
  if (!stockLike(asset) || asset.instrumentType === 'CEDEAR de ETF' || !judicial.test(clause) || !relatedClause(clause, asset) || noEvent.test(clause)) return [];
  const target = `(?:${namesPattern(asset)})(?=$|[^\\p{L}\\p{N}])`;
  const start = `(?:^|[^\\p{L}\\p{N}])${target}`;
  const match = (pattern: string) => new RegExp(pattern, 'u').test(clause);
  // These are explicit changes in legal exposure. A judgment against Argentina
  // "in the YPF trial" does not meet a direct corporate liability pattern.
  const adverse = [
    `\\b(?:condena|condeno|sanciona|sanciono|multa|multo)\\s+(?:a\\s+)?${target}`,
    `\\b(?:fallo|sentencia|resolucion|condena)\\s+(?:(?:judicial|adverso|adversa|desfavorable)\\s+)*(?:contra|en contra de)\\s+${target}`,
    `${start}\\s+(?:(?:es|fue|queda|quedo)\\s+)?(?:condenad[ao]|sancionad[ao]|multad[ao])\\b`,
    `${start}\\s+(?:pierde|perdio)\\s+(?:(?:el|la|un|una)\\s+)?(?:juicio|apelacion|demanda|litigio)\\b`,
    `\\b(?:ordena|ordeno|obliga|obligo)\\s+(?:a\\s+)?${target}\\s+(?:a\\s+)?pagar\\b`,
    `${start}\\s+(?:debe|debera|tendra que)\\s+pagar\\b.{0,45}\\b(?:indemnizaci\\w*|multa|sentencia|juicio)\\b`,
    `\\b(?:embarga|embargo|confisca|confisco)\\s+(?:(?:los|las)\\s+)?(?:activos|bienes|cuentas)\\s+de\\s+${target}`
  ].some(match);
  const favorable = [
    `\\b(?:rechaza|rechazo|desestima|desestimo|archiva|archivo)\\s+(?:(?:la|una)\\s+)?demanda\\s+(?:judicial\\s+)?contra\\s+${target}`,
    `\\b(?:revoca|revoco|anula|anulo)\\s+(?:(?:el|la|un|una)\\s+)?(?:fallo|sentencia|condena|embargo|multa|sancion)\\s+(?:contra|en contra de|a)\\s+${target}`,
    `\\b(?:fallo|sentencia|resolucion)\\s+(?:judicial\\s+)?(?:favorable a|a favor de)\\s+${target}`,
    `${start}\\s+(?:gana|gano)\\s+(?:(?:el|la|un|una)\\s+)?(?:juicio|apelacion|demanda|litigio)\\b`,
    `\\b(?:levanta|levanto|suspende|suspendio)\\s+(?:el\\s+)?embargo\\s+(?:sobre\\s+)?(?:(?:los|las)\\s+)?(?:activos|bienes|cuentas)\\s+de\\s+${target}`
  ].some(match);
  const signals: ValuationSignal[] = [];
  if (!uncertain.test(clause)) {
    // The adverse words name the ruling being lifted in "revocó el fallo
    // contra YPF"; they are not a second, contradictory legal event.
    if (adverse && !favorable) signals.push({ direction: 'alerta', kind: 'judicial' });
    if (favorable) signals.push({ direction: 'favorable', kind: 'judicial' });
  }
  // A concrete request/threat over company control is already an identifiable
  // risk even while the outcome is pending. It is not the company's own debt.
  const control = match(`\\b(?:acciones|participacion|control)\\s+(?:(?:estatal|accionaria|accionario|de control)\\s+)?(?:de|en)\\s+${target}`);
  const threat = /\b(?:ordena|ordenan|ordeno|ordenaron|exige|exigen|exigio|exigieron|solicita|solicitan|solicito|solicitaron|pide|piden|pidio|pidieron|reclama|reclaman|reclamo|reclamaron)\b.{0,80}\b(?:embarg\w*|transfer\w*|entreg\w*|perdida del control)\b|\b(?:embargo|transferencia|entrega)\b.{0,50}\b(?:ordenad\w*|solicitad\w*|reclamad\w*)\b/.test(clause);
  if (!signals.length && control && threat && !uncertain.test(clause) && !/\b(?:si|niega|nego|descarta|descarto|rechaza|rechazo|revoca|revoco|sin riesgo)\b/.test(clause)) signals.push({ direction: 'alerta', kind: 'judicial', pending: true });
  return signals;
}

function fundamentalSignals(clause: string, asset: Asset, relatedIssuers: Set<string>): ValuationSignal[] {
  if (!stockLike(asset) || asset.instrumentType === 'CEDEAR de ETF' || uncertain.test(clause) || noEvent.test(clause) || relatedIssuers.size > 1) return [];
  const benefit = '(?:ganancias?|beneficios?|ingresos?|margenes?|produccion|ventas?|ebitda)';
  const burden = '(?:costos?|perdidas?)';
  const rising = '(?:sub\\w*|aument\\w*|crec\\w*|increment\\w*|mejor\\w*|expan\\w*|duplic\\w*|triplic\\w*)';
  const falling = '(?:cae|caen|cayo|cayeron|caida|baj\\w*|disminu\\w*|reduc\\w*|reduj\\w*|retroced\\w*|contraj\\w*|descend\\w*|recort\\w*|deterior\\w*)';
  const signals: ValuationSignal[] = [];
  const change = (metric: string, movement: string) => new RegExp(`\\b${movement}\\b.{0,24}\\b${metric}\\b|\\b${metric}\\b.{0,30}\\b${movement}\\b`, 'u').test(clause);
  if (change(benefit, rising) || change(burden, falling) || new RegExp(`\\b${benefit}\\s+(?:historicas?\\s+)?record\\b|\\brecord\\s+(?:de\\s+)?${benefit}\\b`, 'u').test(clause)) signals.push({ direction: 'favorable', kind: 'fundamental' });
  if (change(benefit, falling) || change(burden, rising)) signals.push({ direction: 'alerta', kind: 'fundamental' });
  return signals;
}

type MarketSignal = { direction: Direction; kind: 'spread' | 'family' };
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

/** Only publisher text obtained from the verified publication may be supplied
 * as the third argument. Generated summaries are not classification evidence. */
export function analyzeNewsRelevance(headline: string, assets: Asset[] = ASSET_CATALOG, verifiedArticleSummary = ''): NewsRelevanceAnalysis {
  const publication = `${headline}. ${verifiedArticleSummary.slice(0, 6000)}`;
  const text = normalizeAssetText(publication);
  const affectedAssetIds = [...new Set(recognizeAssetIds(publication, assets))];
  const affected = assets.filter(asset => affectedAssetIds.includes(asset.id));
  const pieces = text.split(/(\s+(?:mientras(?: que)?|pero|aunque|en tanto(?: que)?|por su parte|pese a|a pesar de|tras|ante|despues de|durante|y)\s+|[;!?]+|\.\s+)/);
  const parts = pieces.flatMap((clause, index) => index % 2 === 0 && clause ? [{ clause, coordinated: index > 0 && /^\s+y\s+$/.test(pieces[index - 1]) }] : []);
  const clauses = parts.map(part => part.clause);
  const assetImpacts: Record<string, NewsImpact> = {};
  let priceObserved = false;
  let materialEvent = false;
  const marketSignals: Record<string, MarketSignal[]> = {};
  const valuations: Record<string, ValuationSignal[]> = {};
  const judicialAssets = new Set<string>();
  const sovereignSignals = affected.some(sovereignBond) ? clauses.filter(clause => !uncertain.test(clause)).flatMap(sovereignMarketSignals) : [];
  for (const asset of affected) {
    const directions = new Set<NewsImpact>();
    let continuation = false;
    for (const [clauseIndex, clause] of clauses.entries()) {
      const named = relatedClause(clause, asset);
      const namedIssuers = new Set(affected.filter(other => relatedClause(clause, other)).map(other => other.issuer || other.id));
      // A coordinated finite verb can retain the preceding named subject:
      // "YPF aumentó su producción y redujo sus ganancias". A fresh subject,
      // independent sentence or speculative clause cannot inherit that link.
      const inherited = continuation && parts[clauseIndex].coordinated && !namedIssuers.size && /^(?:aument\w*|reduc\w*|reduj\w*|sub\w*|baj\w*|mejor\w*|recort\w*|disminu\w*|increment\w*|registro|reporto)\b/.test(clause);
      continuation = named;
      if (!named && !inherited) continue;
      if (judicial.test(clause) && !/\b(?:rumor\w*|trascendid\w*|especulacion\w*)\b/.test(clause)) judicialAssets.add(asset.id);
      if (!uncertain.test(clause)) {
        const price = priceDirections(clause, asset);
        if (price.length) priceObserved = true;
        price.forEach(direction => directions.add(direction));
        // Credit/payment facts are material; scheduled cash flow alone does not
        // demonstrate a favorable market reaction.
        const belongs = creditBelongsTo(clause, asset, affected) && !avoidedCredit.test(clause);
        const creditFailure = belongs && failedPayment.test(clause) && (debt.test(clause) || /\b(pagos?|vencimientos?)\b/.test(clause)) && !avoidedFailure.test(clause);
        const creditDown = belongs && lowerRating.test(clause) && !deniedRating.test(clause);
        const creditUp = belongs && higherRating.test(clause) && !deniedRating.test(clause);
        if (creditFailure || creditDown || creditUp) materialEvent = true;
        if (!avoidedFailure.test(clause)) {
          if (creditFailure || creditDown) directions.add('alerta');
          if (creditUp) directions.add('favorable');
        }
      }
      const signals = [...judicialSignals(clause, asset), ...fundamentalSignals(clause, asset, namedIssuers)];
      if (signals.length) {
        (valuations[asset.id] ||= []).push(...signals);
        signals.forEach(signal => directions.add(signal.direction));
      }
    }
    // Directly attributed movements/credit facts take precedence over a broad
    // group signal (AL30 can fall on a day when other sovereign bonds rebound).
    if (!directions.size && sovereignBond(asset) && sovereignSignals.length) {
      marketSignals[asset.id] = sovereignSignals;
      sovereignSignals.forEach(signal => directions.add(signal.direction));
    }
    assetImpacts[asset.id] = directions.size === 1 ? [...directions][0] : 'neutral';
  }
  const factualClauses = clauses.filter(clause => !uncertain.test(clause));
  let relevanceType: RelevanceType;
  if (affected.length && (priceObserved || materialEvent)) relevanceType = 'impacto_precio';
  else if (Object.keys(marketSignals).length || Object.keys(valuations).length || judicialAssets.size) relevanceType = 'valoracion_mercado';
  else if (factualClauses.some(clause => macro.test(clause)) && !affected.some(asset => stockLike(asset) && issuerIn(text, asset))) relevanceType = 'contexto_macro';
  else if (affected.length && factualClauses.some(clause => corporate.test(clause) || payment.test(clause))) relevanceType = 'valoracion_mercado';
  else relevanceType = 'ruido';
  if (relevanceType === 'contexto_macro' || relevanceType === 'ruido') affectedAssetIds.forEach(id => { assetImpacts[id] = 'neutral'; });
  const directions = new Set(Object.values(assetImpacts).filter(impact => impact !== 'neutral'));
  const impact: NewsImpact = directions.size === 1 ? [...directions][0] : 'neutral';
  const judicialSignalsPresent = Object.values(valuations).flat().some(signal => signal.kind === 'judicial');
  const fundamentalSignalsPresent = Object.values(valuations).flat().some(signal => signal.kind === 'fundamental');
  const pendingLegal = Object.values(valuations).flat().some(signal => signal.pending);
  const explanation = relevanceType === 'impacto_precio'
    ? priceObserved ? 'La publicación informa una variación de cotización de instrumentos identificados. Esa observación no establece su evolución futura.'
      : 'La publicación informa un hecho de pago o de crédito relacionado con instrumentos identificados. No informa por sí solo una variación de cotización.'
    : relevanceType === 'valoracion_mercado'
      ? judicialSignalsPresent
        ? pendingLegal
          ? 'La publicación describe un riesgo judicial concreto sobre acciones o control de la compañía. Es una alerta de valoración con resultado pendiente, no una deuda directa atribuida a la empresa ni una caída observada de su cotización.'
          : 'La publicación informa una decisión judicial que cambia la exposición legal del emisor. La señal favorable o adversa refleja ese cambio de valoración; no afirma una variación observada ni futura de la cotización.'
        : fundamentalSignalsPresent
          ? 'La publicación informa una mejora o deterioro concreto de resultados, márgenes, costos o producción del emisor. Es una señal de valoración favorable o adversa, sin afirmar que el precio ya haya cambiado ni anticipar su evolución.'
          : Object.keys(marketSignals).length
            ? 'La publicación informa un movimiento del conjunto de bonos soberanos o de su prima de riesgo. Se clasifica la señal de valoración favorable o adversa para esa deuda, sin afirmar una cotización individual ni anticipar precios.'
            : judicialAssets.size
              ? 'La publicación trata un asunto judicial relevante para el seguimiento del emisor. El texto verificado no establece una nueva decisión favorable o adversa ni un riesgo concreto atribuible a la empresa; la dirección queda por confirmar. Esto no descarta que futuras novedades del litigio afecten su valoración.'
              : 'La publicación aporta información sobre el emisor o su actividad, sin establecer una mejora o deterioro concreto de su valoración ni una variación de cotización.'
      : relevanceType === 'contexto_macro'
        ? 'La publicación describe una variable macroeconómica. Su relación con los instrumentos es contextual y no prueba una dirección de precio.'
        : 'La publicación no aporta evidencia suficiente de un efecto direccional sobre los instrumentos; las opiniones o expectativas no se tratan como hechos confirmados.';
  const relationships = Object.fromEntries(affected.map(asset => {
    const valuation = valuations[asset.id];
    if (valuation?.length) {
      const mixed = new Set(valuation.map(signal => signal.direction)).size > 1;
      const legal = valuation.some(signal => signal.kind === 'judicial');
      return [asset.id, legal
        ? `El texto verificado identifica un cambio o riesgo judicial concreto vinculado con ${asset.symbol}${valuation.some(signal => signal.pending) ? ', con resolución pendiente sobre acciones o control; esto no atribuye una obligación de pago a la empresa' : ''}. ${mixed ? 'Las señales favorables y adversas se contraponen; no se establece un efecto neto.' : 'La dirección refleja exposición legal, no una cotización observada ni una predicción de precio.'}`
        : `El texto verificado informa una mejora o deterioro operativo o de resultados de ${asset.symbol}. ${mixed ? 'Las señales se contraponen; no se establece un efecto neto.' : 'La dirección es una señal de valoración, no una cotización observada ni una predicción de precio.'}`];
    }
    if (judicialAssets.has(asset.id)) return [asset.id, `El asunto judicial requiere seguimiento por su relación con ${asset.symbol}. El texto verificado no acredita una nueva obligación de la compañía, un cambio de control concreto o una resolución direccional; la responsabilidad del Estado no se trata automáticamente como deuda de la empresa.`];
    if (marketSignals[asset.id]?.length) {
      const signal = marketSignals[asset.id].some(item => item.kind === 'family') ? 'un movimiento del conjunto de bonos soberanos en dólares' : 'una variación del riesgo país argentino';
      return [asset.id, `La publicación informa ${signal}, una referencia de valoración para ${asset.symbol}. La clasificación refleja esa señal del conjunto; no demuestra la cotización ni una variación del precio de esta especie.`];
    }
    const exact = hasName(text, asset.symbol);
    const namedIssuer = !!asset.issuer && hasName(text, asset.issuer);
    const pairedSpecies = asset.category === 'bonos' && asset.aliases?.some(alias => /^[A-Z]{2}\d{2}D?$/.test(alias) && hasName(text, alias));
    const namedReference = issuerIn(text, asset);
    const link = exact ? `La publicación identifica ${asset.symbol}` : pairedSpecies
      ? `La publicación identifica otra especie del mismo bono que ${asset.symbol}; esa relación no prueba el precio de la especie seleccionada`
      : asset.instrumentType === 'CEDEAR de ETF' && namedReference
        ? `La publicación menciona el índice o referencia del ETF de ${asset.symbol}, sin demostrar la cotización local del CEDEAR`
        : namedIssuer ? `La publicación menciona al emisor de ${asset.symbol}, ${asset.issuer}` : namedReference
          ? `La publicación identifica a la empresa o referencia vinculada con ${asset.symbol}`
          : `La relación de ${asset.symbol} es de contexto económico, no una mención específica del instrumento`;
    return [asset.id, `${link}. ${assetImpacts[asset.id] === 'neutral' ? 'No se establece una dirección de cotización para esta especie.' : 'La dirección se limita al hecho expresado en el texto verificado, sin proyectar una cotización futura.'}`];
  }));
  const energy = affected.some(asset => ['YPFD', 'PAMP', 'XOM', 'CVX', 'PBR', 'YMCJO'].includes(asset.id));
  const tech = affected.some(asset => ['AAPL', 'MSFT', 'NVDA', 'AMD', 'GOOGL', 'META', 'TSLA', 'INTC', 'TSM'].includes(asset.id));
  const topicCategory: NewsItem['topicCategory'] = relevanceType === 'contexto_macro'
    ? /\b(dolar|mep|ccl|cambiari\w*|encajes)\b/.test(text) ? 'regulaciones_bcra' : 'macro_tasas'
    : affected.some(asset => ['bonos', 'corporativos', 'provinciales', 'tesoro'].includes(asset.category)) ? 'deuda_soberana'
      : energy ? 'energia' : tech ? 'cedears_tech' : 'balances';
  return { affectedAssetIds, relevanceType, impact, assetImpacts, topicCategory, relationships, explanation };
}
