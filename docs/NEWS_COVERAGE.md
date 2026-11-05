# Comparación de cobertura del mismo hecho

RSS y Gemini se consultan en paralelo. Una respuesta exitosa de Gemini ya no evita la consulta de los RSS de Ámbito, El Cronista e Infobae. Después se cruzan sus publicaciones verificadas y se deduplican los acontecimientos, conservando un único análisis de cartera y hasta cinco editoriales distintas por hecho.

## Recopilación equilibrada

Los cuatro RSS se solicitan en paralelo con un plazo de cinco segundos. Los dos feeds de Ámbito cuentan como una editorial al repartir los turnos de verificación. Se normalizan URLs y se eliminan duplicados antes de abrir las publicaciones. Dentro de cada medio se priorizan las relaciones con la cartera, manteniendo turnos entre medios. Hasta cuatro verificaciones se ejecutan simultáneamente con un presupuesto acotado de 18 segundos; no se lanzan más al vencerlo. Gemini dispone de un plazo total de 20 segundos y verifica sus enlaces en paralelo con cancelación.

Cuando el RSS general de Infobae no aporta candidatos financieros, se consulta su sección Economía dentro del mismo plazo total de cinco segundos. Se resuelven enlaces relativos de artículos, se deduplican y se rechazan dominios impostores. La sección solo descubre candidatos: cada publicación debe superar la verificación original de titular, fecha y URL. `sections` informa estado y candidatos de la alternativa; `discarded` diferencia sección, temática y hechos sin relación con la selección.

Los errores transitorios de verificación de una URL se reutilizan solo durante 30 segundos, en vez de excluir durante horas una publicación que podría volver a estar disponible. Una cancelación no se guarda como fallo. Se registran diagnósticos por feed y editorial: candidatos, verificaciones, descartes, fallos de acceso y agotamiento de presupuesto. Una caída de todas las fuentes no se presenta como una consulta exitosa sin novedades.

## Búsqueda de publicaciones ausentes

Combinar RSS y Gemini no basta para descubrir otras coberturas: un RSS es una ventana parcial de publicaciones. Se leen hasta 100 candidatos financieros por feed, en lugar de cortar a los 15, antes de priorizar la cartera y repartir verificaciones entre medios.

Después de combinar ambas rutas, **todas las noticias** se comparan contra índices de secciones económicas de Ámbito, El Cronista, Infobae, La Nación, Clarín e iProfesional. No se limita la revisión a cuatro tarjetas ni se omite una sección porque su RSS ya haya aportado otros artículos. Cada sección se descarga una vez en esta fase y sus candidatos se reutilizan para todos los acontecimientos. Los enlaces HTML relativos y las listas JSON-LD se normalizan y deduplican; se rechazan secciones ajenas, credenciales en URLs y dominios impostores. El índice es parcial: no equivale al archivo completo del medio.

En paralelo se consulta Bing Noticias RSS y, si no aporta candidatos, su búsqueda web RSS, con una variante de términos. Un resultado HTTP 200 con enlaces ajenos al medio se clasifica como `irrelevant_results`, no como búsqueda útil. El resultado real de producción del 5 de noviembre de 2026 mostró precisamente ese fallo: páginas sin relación con el tema ni el dominio solicitado. La cobertura ya no depende exclusivamente de ese proveedor.

La recuperación directa y las búsquedas comparten cinco segundos. Las búsquedas tienen cuatro trabajadores, hasta 48 peticiones y turnos entre acontecimientos. La verificación dispone de diez segundos adicionales, cuatro trabajadores y turnos entre tarjetas: cada noticia recibe su mejor candidato antes de los segundos. Se clasifican hasta tres candidatos por editorial para cada hecho, con coincidencias amplias de términos y actores para ordenar la inspección. Ese puntaje no autoriza la fusión. Se reutilizan publicaciones ya verificadas y se conserva un máximo de cinco editoriales por tarjeta. Los presupuestos se suman a la recopilación inicial; no son una búsqueda exhaustiva de toda la web.

Cada candidato debe superar la verificación en la publicación original: HTTPS final del medio correcto, titular propio y fecha. Después se compara con la fuente principal del acontecimiento. Los snippets del buscador y la sección nunca son evidencia del hecho. Los enlaces de seguimiento Bing conocidos se decodifican localmente antes de validar el destino, incluidos envoltorios HTTP y hasta tres capas anidadas. El envoltorio HTTP no se visita; solo se abre la publicación del medio autorizado. Las consultas para hechos de jornadas anteriores incluyen la fecha pública argentina en la primera variante y conservan una segunda más amplia; no se siguen destinos arbitrarios. HTTP solo se admite como candidato que termine en HTTPS.

`coverageDiscovery` conserva los contadores globales y agrega:

- `summary`: total final de noticias, tarjetas con varios medios, con una fuente, enriquecidas y búsquedas incompletas. Los contadores de `diagnostics` describen la recopilación RSS anterior al enriquecimiento.
- `sections`: acceso, contenido vacío y candidatos de cada índice.
- `queries`: ruta de búsqueda, resultados brutos, aceptados, motivos y ejemplos acotados de descartes, sin query strings ni credenciales de los resultados.
- `events`: por noticia, editoriales revisadas y pendientes, búsquedas dirigidas planificadas/completadas y su estado incompleto, candidatos, verificaciones, coincidencias, otros hechos, fallos, omisiones por presupuesto y fuentes antes/después.
- `verification` y `searchBudgetExhausted`: límites que impidieron completar pasos.

Una tarjeta de un solo medio puede deberse a un índice parcial, búsqueda irrelevante, acceso fallido, otro acontecimiento o presupuesto agotado. **Ninguno de esos resultados demuestra que no exista otra cobertura.** La cantidad de medios se mide; no se impone un mínimo artificial ni se elimina una noticia legítima para mejorar la proporción.

Las regresiones controladas cubren seis acontecimientos distintos (reservas, tasas, inflación, infraestructura, créditos y balances), más de cuatro tarjetas, resultados de Bing inútiles, secciones compartidas, artículos originales que contradicen el candidato y verificación que no responde a la cancelación. También se conserva la integración de RSS, sección de Infobae y búsqueda con seguimiento. Estas pruebas validan el flujo; no prueban disponibilidad ni cobertura periodística en vivo de cada índice.

## Correlación

Se comparan titulares originales, fecha, protagonista, acción, mercado, importes y porcentajes. Se reconocen sinónimos como BCRA/autoridad monetaria y mantener/dejar sin cambios. Se separan movimientos opuestos de un mismo activo con los verbos atribuidos a su propia cláusula, países y bancos centrales, subas/bajas/mantenimiento, tasas/encajes, compras/ventas/no compras, cifras incompatibles y otra rueda diaria. No se fusionan publicaciones por compartir solo un ticker o una categoría general. Cada candidato debe concordar con la publicación principal; no se agregan cadenas de semejanzas entre secundarios.

El banco central de Australia no es el BCRA y no genera automáticamente una relación con AL30, GD30, MEP o CCL. Una cartera con activos seleccionados solo recibe los hechos con relación identificada a esas tenencias. Sin selección se permite consultar el panorama general, sin presentar esos instrumentos como propios.

La equivalencia entre “riesgo país” y “prima de riesgo argentina” exige el mismo nivel en puntos, dirección junto a esa métrica y misma jornada argentina verificada. Una suba de bonos u otra métrica no determina la dirección de la prima. También se reconocen cruces del mismo umbral (por encima/superó/rompió la barrera), con igual dirección y jornada. Un cruce de 900 puntos no se equipara a una cotización exacta de 900 ni a otro umbral. La regresión reproduce metadatos públicos de producción del 5 de noviembre de 2026; no es una nueva consulta en vivo.

Cada fuente conserva su titular, editorial, fecha y URL verificados. La comparación muestra una publicación por editorial, aunque dos diarios usen el mismo titular de agencia. Si solo se puede verificar una publicación del acontecimiento, se indica una fuente; la existencia de otro medio no se inventa. La cantidad efectiva de medios depende de publicaciones y accesos reales, no de un mínimo artificial.

## Caché y pruebas

El espacio de caché actual es `v13_news_tracking_coverage`, compartido por cliente y servidor. Se descartan las noticias del formato anterior conservando sesión, cartera y calendario. `Actualizar pulso` fuerza la búsqueda. `/api/version` informa el commit y `newsVersion`, sin datos privados.

Las pruebas cubren RSS simultáneos, un medio lento o caído, reparto entre editoriales, deduplicación, plazos, reintento de errores transitorios y tres medios para un mismo acontecimiento. Las pruebas de API demuestran que RSS agrega El Cronista e Infobae cuando la búsqueda simulada de Gemini solo encuentra Ámbito. También verifican que otros pagos, fechas, países, cifras o decisiones permanezcan separados. Los transportes son fixtures explícitos y no sustituyen consultas periodísticas en vivo.

La red de este entorno todavía deniega las consultas directas a los sitios periodísticos y a producción. Los dominios quedaron declarados en el borrador de configuración; deben estar aplicados para verificar cobertura y despliegue reales. Publicar código en Git no demuestra por sí solo que Vercel haya finalizado el despliegue.


## Evidencia de producción aportada

La consulta del usuario sobre `6b459ed` y `v12_broad_verified_coverage` confirmó tres de cinco tarjetas con varios medios: Ámbito/Infobae para el cruce de 900 puntos; Ámbito/Infobae/iProfesional para reservas y FMI; Ámbito/iProfesional para la reanudación de compras del BCRA. Los nueve índices devolvieron candidatos, y se verificaron los 51 candidatos seleccionados sin fallos ni omisiones por tiempo. Una columna panorámica y el hecho del día anterior sobre 850 puntos conservaron una fuente. Esto prueba cobertura múltiple real en esa consulta, no una proporción universal ni ausencia de otras publicaciones.

Bing siguió sin aportar candidatos; Noticias mostró enlaces `/news/apiclick.aspx` descartados con dominio Bing. El parser de v12 solo desenvolvía la capa inicial HTTPS; v13 incorpora la regresión de envoltorios HTTP y anidados, sin ampliar dominios aceptados. Su efecto en búsquedas en vivo requiere otra comprobación de producción.

En v13 el resumen de búsquedas incompletas cuenta también consultas dirigidas que no se terminaron, aunque los índices de todas las editoriales hayan respondido. Se conserva por separado el progreso de secciones y buscadores: un límite global de consultas no puede aparecer como una revisión totalmente completada.
