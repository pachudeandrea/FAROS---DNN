// Local provider/publication fixtures. An unexpected URL fails rather than
// making a network request. This module is loaded only by the test API process.
const published = new Date(Date.now() - 30 * 60000).toISOString();
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

export function installNewsTransport() {
  let releaseCoverage;
  const coverageGate = new Promise(resolve => { releaseCoverage = resolve; });
  process.on('message', message => { if (message?.type === 'news-release-coverage') releaseCoverage(); });
  const stats = { sections: 0, searches: 0, extractions: 0, publications: 0, feeds: 0, prompts: [] };
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('generativelanguage.googleapis.com/')) {
      const payload = JSON.parse(init.body);
      const text = payload.contents.flatMap(content => content.parts).map(part => part.text || '').join('\n');
      stats.prompts.push(text);
      let candidate;
      if (payload.generationConfig?.responseMimeType === 'application/json') {
        stats.extractions++;
        const energy = text.includes('Activos bajo monitoreo: YPFD');
        const selected = text.includes('Activos bajo monitoreo: PAMP') ? 11 : text.includes('Activos bajo monitoreo: AAPL') ? 12 : text.includes('Activos bajo monitoreo: MSFT') ? 7 : text.includes('Activos bajo monitoreo: CO29') ? 8 : text.includes('Activos bajo monitoreo: YMCJO') ? 9 : text.includes('Activos bajo monitoreo: TX28') ? 10 : energy ? 4 : 0;
        candidate = { content: { parts: [{ text: JSON.stringify({ items: [{ sourceId: selected + 1, headline: articles[selected].title, summary: selected === 11 ? 'Conviene comprar PAMP ahora: recomendación de prueba que debe descartarse.' : 'Síntesis de prueba sin cambios.', economicAnalysis: 'Análisis personalizado de prueba sin cambios.', affectedHoldings: energy ? ['YPFD'] : ['AL30'], audioScript: 'Audio de prueba sin cambios.', sentiment: 'favorable', impact: 'medio' }] }) }] } };
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
      const found = process.env.FAROS_TEST_NEWS_DISCOVERY === '1' ? articles.filter(article => new URL(article.url).hostname === `www.${publisher}`) : [];
      return new Response(`<rss><channel>${found.map(article => `<item><title>${article.title}</title><link>${process.env.FAROS_TEST_NEWS_SECTION === '1' ? 'https://www.bing.com/ck/a?u=a1' + Buffer.from(article.url).toString('base64url') : article.url}</link></item>`).join('')}</channel></rss>`);
    }
    if (url === 'https://www.infobae.com/economia/') {
      stats.sections++;
      const found = process.env.FAROS_TEST_NEWS_SECTION === '1' ? articles.filter(article => article.media === 'Infobae') : [];
      return new Response(`<html><body>${found.map(article => `<a href="${new URL(article.url).pathname}"><h2>${article.title}</h2></a>`).join('')}</body></html>`, { headers: { 'content-type': 'text/html' } });
    }
    const feed = url.includes('/rss/') || url.includes('/outboundfeeds/');
    if (feed) {
      stats.feeds++;
      const publisher = url.includes('ambito.com') ? 'Ámbito' : url.includes('cronista.com') ? 'El Cronista' : 'Infobae';
      const found = process.env.FAROS_TEST_NEWS_DISCOVERY === '1' && publisher !== 'Ámbito' ? [] : articles.filter(article => article.media === publisher);
      const xml = `<rss><channel>${found.map(article => `<item><title><![CDATA[${article.title}]]></title><link>${article.url}</link><pubDate>${new Date(published).toUTCString()}</pubDate></item>`).join('')}</channel></rss>`;
      return new Response(xml, { headers: { 'content-type': 'application/rss+xml' } });
    }
    const article = articles.find(article => article.url === url);
    if (!article) throw new Error('Unexpected test-only news URL');
    stats.publications++;
    return new Response(`<html><head><meta property="og:title" content="${article.title}"><meta property="article:published_time" content="${published}"><link rel="canonical" href="${article.url}"></head><body><h1>${article.title}</h1><p>Publicación utilizada únicamente como prueba local de FAROS.</p></body></html>`, { headers: { 'content-type': 'text/html' } });
  };
  process.on('message', message => { if (message?.type === 'news-test-stats') process.send?.({ type: 'news-test-stats', ...stats }); });
}
