import { readFileSync } from 'node:fs';
// Local provider/publication fixtures. An unexpected URL fails rather than
// making a network request. This module is loaded only by the test API process.
const argentinaDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
let published = new Date(Math.max(Date.now() - 30 * 60000, Date.parse(`${argentinaDay}T00:00:00-03:00`))).toISOString();
export const articles = [
  { media: 'Ámbito', url: 'https://www.ambito.com/finanzas/bcra-compras-reservas-prueba', title: 'El BCRA compró USD 125 millones y elevó sus reservas' },
  { media: 'El Cronista', url: 'https://www.cronista.com/finanzas-mercados/compras-banco-central-prueba/', title: 'El Banco Central adquirió USD 125 millones y sumó reservas' },
  { media: 'Infobae', url: 'https://www.infobae.com/economia/2030/01/01/reservas-compras-prueba/', title: 'Reservas: el BCRA cerró la jornada con compras por USD 125 millones' },
  { media: 'Ámbito', url: 'https://www.ambito.com/economia/otra-nota-bcra-reservas-prueba', title: 'El BCRA compró divisas y aumentó sus reservas en USD 125 millones' },
  { media: 'Ámbito', url: 'https://www.ambito.com/energia/ypf-oleoducto-prueba', title: 'YPF inauguró el oleoducto Vaca Muerta Sur para exportar petróleo' },
  { media: 'El Cronista', url: 'https://www.cronista.com/negocios/ypf-combustibles-prueba/', title: 'YPF anunció un aumento de naftas y gasoil en estaciones de servicio' },
  { media: 'Infobae', url: 'https://www.infobae.com/economia/2030/01/01/vaca-muerta-sur-prueba/', title: 'La petrolera YPF inauguró Vaca Muerta Sur y amplió el transporte de crudo' },
  { media: 'Ámbito', url: 'https://www.ambito.com/finanzas/microsoft-balance-prueba', title: 'Microsoft presentó ganancias récord en su balance trimestral' },
  { media: 'El Cronista', url: 'https://www.cronista.com/finanzas-mercados/cordoba-deuda-prueba/', title: 'Los bonos de la Provincia de Córdoba suben tras mejorar su calificación crediticia' },
  { media: 'Ámbito', url: 'https://www.ambito.com/finanzas/ypf-on-prueba', title: 'YPF confirma el pago del cupón de sus obligaciones negociables' },
  { media: 'Ámbito', url: 'https://www.ambito.com/finanzas/tesoro-tx28-prueba', title: 'TX28: sube el bono del Tesoro ajustado por CER' },
  { media: 'Ámbito', url: 'https://www.ambito.com/finanzas/pampa-rumor-prueba', title: 'Rumores: Pampa Energía podría anunciar una fusión' },
  { media: 'Ámbito', url: 'https://www.ambito.com/finanzas/precios-mixtos-prueba', title: 'MSFT cae mientras las acciones de Apple suben en la Bolsa' }


];

// Publisher evidence is local fixture data, not a generated Gemini summary.
export const judicialArticles = [
  {
    media: 'El Cronista', url: 'https://www.cronista.com/columnistas/juicio-ypf-mucho-ruido-y-una-premisa-equivocada/',
    title: 'Juicio YPF: mucho ruido y una premisa equivocada',
    description: 'El amicus de los 15 Estados confunde jurisdicción con derecho aplicable: el Segundo Circuito sí juzgó a la Argentina, pero aplicó ley argentina.',
    body: 'Quince Estados de los EE.UU presentaron un amicus curiae ante la Corte Suprema de los EE.UU para apoyar la revisión del fallo que favoreció a la Argentina.'
  },
  {
    media: 'Ámbito', url: 'https://www.ambito.com/energia/ypf-sancion-ambiental-judicial-prueba',
    title: 'YPF y una sanción ambiental: las novedades del expediente judicial',
    description: 'La Justicia ordenó a YPF pagar una multa ambiental por el incumplimiento de sus obligaciones.',
    body: 'La resolución judicial impone una nueva obligación de pago a la petrolera YPF.'
  },
  {
    media: 'Infobae', url: 'https://www.infobae.com/economia/2030/06/15/ypf-demanda-laboral-desestimada-prueba/',
    title: 'La Justicia desestimó una demanda laboral contra YPF',
    description: 'El tribunal desestimó una demanda contra YPF y eliminó esa contingencia judicial para la empresa.',
    body: 'La decisión cierra el expediente laboral contra YPF.'
  }
];

// Public verified headlines reproduced locally; no production request is made.
if (process.env.FAROS_TEST_NEWS_DIRECTIONAL === '1') {
  const publications = JSON.parse(readFileSync(new URL('./classification-production-2026-11-06.json', import.meta.url), 'utf8'));
  articles.splice(0, articles.length, ...publications.map(item => ({ media: item.sources[0].mediaName, url: item.sources[0].sourceUrl, title: item.headline })));
}
if (process.env.FAROS_TEST_NEWS_JUDICIAL === '1') articles.splice(0, articles.length, ...judicialArticles);
export const sectionOnlyArticles = [
  { media: 'La Nación', url: 'https://www.lanacion.com.ar/economia/ypf-production-section-fixture/', title: 'YPF presenta novedades de su producción petrolera', description: 'YPF aumentó su producción de petróleo durante el trimestre.', body: 'La petrolera presentó los datos de actividad a sus inversores.' },
  { media: 'Clarín', url: 'https://www.clarin.com/economia/ypf-judicial-section-fixture.html', title: 'YPF enfrenta una nueva decisión judicial', description: 'La Justicia ordenó a YPF pagar una indemnización millonaria.', body: 'La resolución judicial cambió la exposición legal de la petrolera.' },
  { media: 'iProfesional', url: 'https://www.iprofesional.com/finanzas/ypf-report-section-fixture', title: 'YPF explica los detalles de su balance trimestral', description: 'YPF presentó su balance trimestral ante los inversores.', body: 'La empresa compartió el informe de sus actividades.' }
];
if (process.env.FAROS_TEST_NEWS_SECTION_ONLY === '1') articles.splice(0, articles.length, ...sectionOnlyArticles);

// One distinct financial event per editor exercises independent discovery and
// per-publisher fairness; directions come from these explicit publisher facts.
export const twelveMediaArticles = [
  { media: 'Ámbito', url: 'https://www.ambito.com/finanzas/al30-twelve-fixture', title: 'AL30 sube en la Bolsa tras una rueda de negocios', description: 'AL30 sube en la Bolsa durante la rueda de negocios.', body: 'La publicación informa una variación observada del bono.' },
  { media: 'El Cronista', url: 'https://www.cronista.com/finanzas-mercados/galicia-twelve-fixture/', title: 'Banco Galicia presenta un informe sobre sus resultados', description: 'Banco Galicia presentó su informe de resultados trimestrales.', body: 'La publicación detalla el reporte del emisor.' },
  { media: 'Infobae', url: 'https://www.infobae.com/economia/2030/06/15/microsoft-twelve-fixture/', title: 'Microsoft reporta ganancias crecientes en el trimestre', description: 'Microsoft aumentó sus ganancias durante el trimestre.', body: 'La empresa publicó sus resultados operativos.' },
  { media: 'La Nación', url: 'https://www.lanacion.com.ar/economia/ypf-twelve-fixture/', title: 'YPF presenta los datos de su producción petrolera', description: 'YPF aumentó su producción de petróleo durante el trimestre.', body: 'La petrolera difundió el reporte de actividad.' },
  { media: 'Clarín', url: 'https://www.clarin.com/economia/apple-twelve-fixture.html', title: 'Apple informa en su balance una reducción de sus ingresos trimestrales', description: 'Apple redujo sus ingresos durante el trimestre.', body: 'La empresa difundió los datos de su balance.' },
  { media: 'iProfesional', url: 'https://www.iprofesional.com/finanzas/pampa-twelve-fixture', title: 'Pampa Energía presenta su informe para inversores', description: 'Pampa Energía presentó su informe trimestral para inversores.', body: 'El informe detalla las actividades de la compañía.' },
  { media: 'Página/12', url: 'https://www.pagina12.com.ar/123456-banco-macro-twelve-fixture', title: 'Banco Macro presentó ganancias récord en el trimestre', description: 'Banco Macro presentó ganancias récord en su balance trimestral.', body: 'El reporte se refiere a los resultados del banco.' },
  { media: 'Perfil', url: 'https://www.perfil.com/noticias/economia/nvidia-twelve-fixture.phtml', title: 'NVIDIA explica el contenido de su balance trimestral', description: 'NVIDIA presentó su balance trimestral ante los inversores.', body: 'La empresa detalló la información del reporte.' },
  { media: 'El Destape', url: 'https://www.eldestapeweb.com/economia/tesla/ventas-twelve-fixture-20300615120000', title: 'Tesla informó una reducción de sus ventas trimestrales', description: 'Tesla redujo sus ventas durante el trimestre.', body: 'La compañía publicó los datos operativos del período.' },
  { media: 'Tiempo Argentino', url: 'https://www.tiempoar.com.ar/ta_article/telecom-twelve-fixture/', title: 'Telecom Argentina presentó información sobre sus contratos', description: 'Telecom Argentina presentó un informe sobre sus contratos vigentes.', body: 'La empresa explicó las actividades comprendidas en el documento.' },
  { media: 'El Economista', url: 'https://eleconomista.com.ar/finanzas/mercado-libre-twelve-fixture-n123456', title: 'Mercado Libre informó en su balance un aumento de sus costos', description: 'Mercado Libre aumentó sus costos operativos durante el trimestre.', body: 'La publicación presenta los datos informados por la empresa.' },
  { media: 'EconoJournal', url: 'https://econojournal.com.ar/2030/06/central-puerto-twelve-fixture/', title: 'Central Puerto presenta nuevas cifras de producción', description: 'Central Puerto aumentó su producción durante el trimestre.', body: 'La empresa difundió los datos de generación eléctrica.' }
];
if (process.env.FAROS_TEST_NEWS_TWELVE_MEDIA === '1') articles.splice(0, articles.length, ...twelveMediaArticles);


export function installNewsTransport() {
  let releaseCoverage;
  const coverageGate = new Promise(resolve => { releaseCoverage = resolve; });
  process.on('message', message => { if (message?.type === 'news-release-coverage') releaseCoverage(); });
  let activeIndexes;
  let sourcesUnavailable = false;
  process.on('message', message => {
    if (message?.type !== 'news-test-outage') return;
    sourcesUnavailable = !!message.unavailable;
    process.send?.({ type: 'news-test-outage-set' });
  });
  process.on('message', message => {
    if (message?.type !== 'news-test-batch') return;
    activeIndexes = message.indexes;
    if (message.published) published = message.published;
    process.send?.({ type: 'news-test-batch-set' });
  });
  const activeArticles = () => articles.filter((_, index) => !activeIndexes || activeIndexes.includes(index));
  const stats = { sections: 0, searches: 0, extractions: 0, publications: 0, publicationUrls: [], feeds: 0, prompts: [] };
  globalThis.fetch = async (input, init) => {
    if (sourcesUnavailable) return new Response('Temporary source outage', { status: 503 });
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('generativelanguage.googleapis.com/')) {
      const payload = JSON.parse(init.body);
      const text = payload.contents.flatMap(content => content.parts).map(part => part.text || '').join('\n');
      stats.prompts.push(text);
      let candidate;
      if (payload.generationConfig?.responseMimeType === 'application/json') {
        stats.extractions++;
        const energy = text.includes('Activos bajo monitoreo: YPFD');
        const selected = process.env.FAROS_TEST_NEWS_JUDICIAL === '1' ? 0 : text.includes('Activos bajo monitoreo: PAMP') ? 11 : text.includes('Activos bajo monitoreo: AAPL') ? 12 : text.includes('Activos bajo monitoreo: MSFT') ? 7 : text.includes('Activos bajo monitoreo: CO29') ? 8 : text.includes('Activos bajo monitoreo: YMCJO') ? 9 : text.includes('Activos bajo monitoreo: TX28') ? 10 : energy ? 4 : 0;
        const indexes = process.env.FAROS_TEST_NEWS_JUDICIAL === '1' ? articles.map((_, index) => index) : [selected];
        candidate = { content: { parts: [{ text: JSON.stringify({ items: indexes.map(index => ({ sourceId: index + 1, headline: articles[index].title, summary: index === 11 ? 'Conviene comprar PAMP ahora: recomendación de prueba que debe descartarse.' : 'Síntesis de prueba sin cambios.', economicAnalysis: 'Análisis personalizado de prueba sin cambios.', affectedHoldings: energy ? ['YPFD'] : ['AL30'], audioScript: 'Audio de prueba sin cambios.', sentiment: 'favorable', impact: 'medio' })) }) }] } };
      } else {
        stats.searches++;
        candidate = { content: { parts: [{ text: 'Publicaciones de prueba sobre reservas y acciones de YPF.' }] }, groundingMetadata: { groundingChunks: (process.env.FAROS_TEST_NEWS_ONE_MEDIUM === '1' ? articles.filter(article => article.media === 'Ámbito') : articles).map(article => ({ web: { uri: article.url, title: article.title } })) } };
      }
      return Response.json({ candidates: [candidate] });
    }
    if (new URL(url).hostname === 'www.bing.com') {
      if (process.env.FAROS_TEST_NEWS_GATED === '1') await coverageGate;
      const query = new URL(url).searchParams.get('q') || '';
      const publisher = query.match(/^site:(\S+)/)?.[1];
      const found = process.env.FAROS_TEST_NEWS_DISCOVERY === '1' ? activeArticles().filter(article => new URL(article.url).hostname === `www.${publisher}`) : [];
      return new Response(`<rss><channel>${found.map(article => `<item><title>${article.title}</title><link>${process.env.FAROS_TEST_NEWS_SECTION === '1' ? 'https://www.bing.com/ck/a?u=a1' + Buffer.from(article.url).toString('base64url') : article.url}</link></item>`).join('')}</channel></rss>`);
    }
    if ((process.env.FAROS_TEST_NEWS_SECTION_ONLY === '1' || process.env.FAROS_TEST_NEWS_TWELVE_MEDIA === '1') && ['/', '/finanzas/', '/economia/', '/finanzas-mercados/', '/economia-politica/', '/finanzas', '/economia', '/seccion/economia', '/seccion/economia/', '/secciones/economia', '/secciones/economia/'].includes(new URL(url).pathname)) {
      stats.sections++;
      const publisher = new URL(url).hostname.replace(/^www\./, '');
      const found = activeArticles().filter(article => new URL(article.url).hostname.replace(/^www\./, '') === publisher);
      return new Response(`<html><body>${found.map(article => `<a href="${new URL(article.url).pathname}"><h2>${article.title}</h2></a>`).join('')}</body></html>`, { headers: { 'content-type': 'text/html' } });
    }
    if (url === 'https://www.infobae.com/economia/') {
      stats.sections++;
      const found = process.env.FAROS_TEST_NEWS_SECTION === '1' ? activeArticles().filter(article => article.media === 'Infobae') : [];
      return new Response(`<html><body>${found.map(article => `<a href="${new URL(article.url).pathname}"><h2>${article.title}</h2></a>`).join('')}</body></html>`, { headers: { 'content-type': 'text/html' } });
    }
    const feed = url.includes('/rss/') || url.includes('/outboundfeeds/');
    if (feed) {
      stats.feeds++;
      const publisher = url.includes('ambito.com') ? 'Ámbito' : url.includes('cronista.com') ? 'El Cronista' : 'Infobae';
      const found = process.env.FAROS_TEST_NEWS_DISCOVERY === '1' && publisher !== 'Ámbito' ? [] : activeArticles().filter(article => article.media === publisher);
      const xml = `<rss><channel>${found.map(article => `<item><title><![CDATA[${article.title}]]></title><link>${article.url}</link><pubDate>${new Date(published).toUTCString()}</pubDate></item>`).join('')}</channel></rss>`;
      return new Response(xml, { headers: { 'content-type': 'application/rss+xml' } });
    }
    const article = articles.find(article => article.url === url);
    if (!article) throw new Error('Unexpected test-only news URL');
    stats.publications++; stats.publicationUrls.push(url);
    const evidence = article.description ? `<meta property="og:description" content="${article.description}"><script type="application/ld+json">${JSON.stringify({ '@type': 'NewsArticle', headline: article.title, description: article.description, articleBody: article.body })}</script>` : '';
    return new Response(`<html><head><meta property="og:title" content="${article.title}">${evidence}<meta property="article:published_time" content="${published}"><link rel="canonical" href="${article.url}"></head><body><h1>${article.title}</h1><p>Publicación utilizada únicamente como prueba local de FAROS.</p></body></html>`, { headers: { 'content-type': 'text/html' } });
  };
  process.on('message', message => { if (message?.type === 'news-test-stats') process.send?.({ type: 'news-test-stats', ...stats }); });
}
