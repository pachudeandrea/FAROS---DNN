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
  { media: 'Infobae', url: 'https://www.infobae.com/economia/2030/01/01/vaca-muerta-sur-prueba/', title: 'La petrolera YPF inauguró Vaca Muerta Sur y amplió el transporte de crudo' }
];

export function installNewsTransport() {
  const stats = { searches: 0, extractions: 0, publications: 0, prompts: [] };
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
        candidate = { content: { parts: [{ text: JSON.stringify({ items: [{ sourceId: energy ? 5 : 1, headline: energy ? articles[4].title : articles[0].title, summary: 'Síntesis de prueba sin cambios.', economicAnalysis: 'Análisis personalizado de prueba sin cambios.', affectedHoldings: energy ? ['YPFD'] : ['AL30'], audioScript: 'Audio de prueba sin cambios.', impact: 'medio' }] }) }] } };
      } else {
        stats.searches++;
        candidate = { content: { parts: [{ text: 'Publicaciones de prueba sobre reservas y acciones de YPF.' }] }, groundingMetadata: { groundingChunks: articles.map(article => ({ web: { uri: article.url, title: article.title } })) } };
      }
      return Response.json({ candidates: [candidate] });
    }
    const feed = url.includes('/rss/') || url.includes('/outboundfeeds/');
    if (feed) {
      const publisher = url.includes('ambito.com') ? 'Ámbito' : url.includes('cronista.com') ? 'El Cronista' : 'Infobae';
      const xml = `<rss><channel>${articles.filter(article => article.media === publisher).map(article => `<item><title><![CDATA[${article.title}]]></title><link>${article.url}</link><pubDate>${new Date(published).toUTCString()}</pubDate></item>`).join('')}</channel></rss>`;
      return new Response(xml, { headers: { 'content-type': 'application/rss+xml' } });
    }
    const article = articles.find(article => article.url === url);
    if (!article) throw new Error('Unexpected test-only news URL');
    stats.publications++;
    return new Response(`<html><head><meta property="og:title" content="${article.title}"><meta property="article:published_time" content="${published}"><link rel="canonical" href="${article.url}"></head><body><h1>${article.title}</h1><p>Publicación utilizada únicamente como prueba local de FAROS.</p></body></html>`, { headers: { 'content-type': 'text/html' } });
  };
  process.on('message', message => { if (message?.type === 'news-test-stats') process.send?.({ type: 'news-test-stats', ...stats }); });
}
