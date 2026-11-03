# Catálogo y vinculación de noticias

El catálogo compartido está en `src/data/assetCatalog.ts`. Reemplaza las doce fichas anteriores y sus precios de ejemplo por 139 identificaciones sin cotizaciones: 41 acciones argentinas, 57 CEDEARs de empresas y 9 de ETF, 22 especies soberanas y la referencia heredada BOPREAL, 3 provinciales, 2 ON, 2 BONCER del Tesoro y las 2 referencias cambiarias existentes.

Ejemplos incorporados: BBAR, BMA, SUPV, ALUA, TXAR, CEPU, TGSU2, TGNO4, LOMA; MSFT, GOOGL, AMZN, TSLA, JPM, KO, PBR; QQQ, DIA, IWM, EEM, EWZ, XLE, XLF, ARKK; AL29/AL35/AE38/AL41, GD29/GD35/GD38/GD41/GD46 y sus especies dólar local explícitas; BA37D, CO29, PMM29; YMCJO (YPF) e IRCFO (IRSA); TX28 y TX31. Los doce identificadores anteriores siguen funcionando. BOPREAL se conserva como referencia general histórica, sin atribuirle una especie negociable única.

## Identificación y mantenimiento

Cada ficha contiene identificador, símbolo, nombre, categoría, emisor, mercado, moneda de la especie, tipo y referencia documental. Las familias en USD no implican que la especie seleccionada liquide en USD: AL30 y AL30D se guardan separadamente. No se generan símbolos dólar/cable automáticamente. Las relaciones explícitas entre especies del mismo bono permiten compartir noticias sin fusionar sus tenencias.

Referencias para contrastar y mantener las identificaciones:

- [BYMA: acciones](https://www.byma.com.ar/productos/acciones/) y [BYMADATA: títulos y especies](https://open.bymadata.com.ar/).
- [Banco Comafi: programas CEDEAR](https://www.comafi.com.ar/custodiaglobal/Programas-Cedear-2483.note.aspx).
- [Secretaría de Finanzas: deuda pública](https://www.argentina.gob.ar/economia/finanzas/deudapublica).
- [CAFCI](https://www.cafci.org.ar/) y [CNV](https://www.cnv.gov.ar/) para identificar fondos y sus clases.

Son referencias del registro estático, no una consulta en tiempo real ni garantía de negociación vigente. Durante esta implementación el proxy denegó las consultas a esos dominios; el cotejo actualizado de las fichas contra sus documentos oficiales queda pendiente de habilitar esa red. No se agregaron letras por inferencia de fechas ni fondos/clases con identificaciones supuestas.

Para ampliar el registro compartido, incorporar fichas documentadas en el mismo archivo y ejecutar las pruebas de catálogo y noticias. La selección de cartera se realiza desde ese catálogo; no se muestra un formulario de carga manual. Las fichas personales guardadas anteriormente se conservan dentro del JSON de la cartera y siguen siendo compatibles, sin migrar ni borrar datos anteriores.

## Búsqueda y noticias

Los selectores de creación/edición, nombres del feed y sugerencias del calendario usan el mismo catálogo. La búsqueda admite varias palabras, emisor, alias, mercado y moneda, ignora acentos/mayúsculas y prioriza la coincidencia exacta del ticker. Al abrir la selección se muestran todos los activos disponibles, sin necesidad de escribir y sin límite de 60 resultados. La lista tiene scroll; escribir filtra las opciones y limpiar la búsqueda restaura la lista completa. Los activos ya incorporados también aparecen en la lista y en los resultados de búsqueda, identificados como «Ya seleccionado» y sin permitir una segunda incorporación. Al quitar uno de la cartera vuelve a estar habilitado para seleccionarlo.

`assetNews.ts` reconoce identificaciones y nombres en los titulares originales de publicaciones verificadas. Usa límites de palabra y exige contexto para nombres/tickers ambiguos; el gestor de un ETF o fondo no identifica por sí solo todos sus productos. Los bonos provinciales y las ON necesitan contexto de deuda cuando se relacionan por emisor. Los titulares genéricos no se asignan automáticamente a AL30/GGAL/NVDA. El contexto BCRA/reservas/tasas se mantiene explícitamente como contexto macro para deuda soberana y divisas.

Gemini recibe nombres, emisores, tipos y alias; sus tickers, sentimiento y análisis propuestos no sustituyen la comprobación sobre el titular original. Tanto Gemini como RSS usan `newsRelevance.ts` para producir relaciones, categoría y dirección por instrumento. Se conserva la verificación de URL/fecha, frescura y comparación del mismo hecho entre medios; no se añade una segunda fuente ficticia.

Los criterios son conservadores:

- `impacto_precio`: variación atribuida al instrumento o un hecho material de crédito, como incumplimiento o cambio de calificación. La etiqueta no demuestra por sí sola una variación de cotización.
- `valoracion_mercado`: resultados, actividad empresarial, inversiones o pagos ordinarios sin reacción bursátil demostrada.
- `contexto_macro`: variables generales como reservas, tasas, inflación o riesgo país; no se asigna automáticamente una dirección a cada instrumento.
- `ruido`: rumores, opiniones, expectativas o falta de evidencia financiera específica. La publicación puede estar verificada sin que el hecho especulado esté confirmado; no se envían alertas por esos rumores.

Las direcciones se atribuyen por activo y cláusula: «MSFT cae mientras Apple sube» no produce el mismo signo para ambos. Subas de costos, precios de productos o inflación no son subas del precio de una acción. Una especie ARS no demuestra la cotización de su especie USD. El balance global de una cartera con efectos opuestos queda neutral porque no se conocen montos ni ponderaciones.

El detalle usa el vínculo respaldado por el titular y elimina mecanismos fijos por ticker, métricas y horizontes supuestos. El audio diario utiliza únicamente publicaciones y calendario recibidos, sin rellenar con macro, sectores o activos no seleccionados. Una consulta sin noticias no se presenta como ausencia de riesgos. Todo se mantiene informativo, sin recomendaciones de compra o venta.

El caché v7 invalida las clasificaciones anteriores e incluye activos, perfil, posiciones y fichas manuales tanto en cliente como en servidor. Cambiar la selección cancela la consulta anterior, limpia el feed anterior y usa otra clave. Quitar un activo también limpia su filtro si estaba activo. Las alertas siguen las preferencias y las posiciones LONG/SHORT; una noticia favorable al activo es adversa para una posición exclusivamente SHORT. Las identificaciones manuales se vuelven a relacionar con los datos de la propia cuenta antes de generar alertas.

Las etiquetas de activos de cada noticia, su avatar, el desglose de impacto y los activos del resumen muestran únicamente la intersección con los identificadores seleccionados en la cartera actual. Si no hay coincidencias, la tarjeta no muestra la fila «Activos». Una cartera vacía no recupera activos de posiciones antiguas; las posiciones LONG heredadas sin registro explícito siguen siendo válidas. El filtro se aplica al mostrar la noticia, también si viene del caché, sin modificar sus fuentes ni confundir especies.

## Validación y publicación

```sh
npm ci
npm run lint
npm run build
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/faros_test npm test
npm run test:browser
```

Las pruebas de base de datos solo usan PostgreSQL local y esquemas descartables; las pruebas de publicaciones/Gemini/RSS y push usan transportes explícitos de prueba. No sustituyen comprobaciones de proveedores en vivo. Chromium prueba selección, guardado, recuperación, lista completa sin carga manual, selección de opciones posteriores a la posición 60, cambios del feed y distribución en 390, 768 y 1440 px, además de la regresión existente de cuenta, noticias, audio, calendario y alertas.

La publicación habitual es un push normal a `main`, seguido del despliegue Vercel y del workflow `deployment-health.yml`. Este cambio no requiere migraciones nuevas. Para comprobar producción debe coincidir el SHA en `/api/version`, responder `/api/health` con PostgreSQL y cargarse el bundle de ese mismo SHA (`scripts/check-deployment.mjs`). Un push exitoso no demuestra que Vercel haya completado el despliegue.
