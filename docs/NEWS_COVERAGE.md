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

Se comparan titulares originales, fecha, protagonista, acción, mercado, importes y porcentajes. Se reconocen sinónimos como BCRA/autoridad monetaria y mantener/dejar sin cambios. Se separan movimientos opuestos de un mismo activo con los verbos atribuidos a su propia cláusula, países y bancos centrales, subas/bajas/mantenimiento, tasas/encajes, compras/ventas/no compras, cifras incompatibles y otra rueda diaria. No se fusionan publicaciones por compartir solo un ticker o una categoría general. Cada candidato debe concordar con todas las publicaciones del grupo; no se agregan cadenas de semejanzas entre secundarios.

El banco central de Australia no es el BCRA y no genera automáticamente una relación con AL30, GD30, MEP o CCL. Una cartera con activos seleccionados solo recibe los hechos con relación identificada a esas tenencias. Sin selección se permite consultar el panorama general, sin presentar esos instrumentos como propios.

La equivalencia entre “riesgo país” y “prima de riesgo argentina” exige el mismo nivel en puntos, dirección junto a esa métrica y misma jornada argentina verificada. Una suba de bonos u otra métrica no determina la dirección de la prima. También se reconocen cruces del mismo umbral (por encima/superó/rompió la barrera), con igual dirección y jornada. Un cruce de 900 puntos no se equipara a una cotización exacta de 900 ni a otro umbral. La regresión reproduce metadatos públicos de producción del 5 de noviembre de 2026; no es una nueva consulta en vivo.

Cada fuente conserva su titular, editorial, fecha y URL verificados. La comparación muestra una publicación por editorial, aunque dos diarios usen el mismo titular de agencia. Si solo se puede verificar una publicación del acontecimiento, se indica una fuente; la existencia de otro medio no se inventa. La cantidad efectiva de medios depende de publicaciones y accesos reales, no de un mínimo artificial.

## Caché y pruebas

El espacio de caché actual es `v16_daily_news`, compartido por cliente y servidor. Se descartan las noticias del formato anterior conservando sesión, cartera y calendario. `Actualizar pulso` fuerza la búsqueda. `/api/version` informa el commit y `newsVersion`, sin datos privados.

Las pruebas cubren RSS simultáneos, un medio lento o caído, reparto entre editoriales, deduplicación, plazos, reintento de errores transitorios y tres medios para un mismo acontecimiento. Las pruebas de API demuestran que RSS agrega El Cronista e Infobae cuando la búsqueda simulada de Gemini solo encuentra Ámbito. También verifican que otros pagos, fechas, países, cifras o decisiones permanezcan separados. Los transportes son fixtures explícitos y no sustituyen consultas periodísticas en vivo.

La verificación inicial estuvo limitada por la política de red. Las comprobaciones posteriores de publicaciones y despliegues se describen abajo. Publicar código en Git no demuestra por sí solo que Vercel haya finalizado el despliegue.


## Evidencia de producción aportada

La consulta del usuario sobre `6b459ed` y `v12_broad_verified_coverage` confirmó tres de cinco tarjetas con varios medios: Ámbito/Infobae para el cruce de 900 puntos; Ámbito/Infobae/iProfesional para reservas y FMI; Ámbito/iProfesional para la reanudación de compras del BCRA. Los nueve índices devolvieron candidatos, y se verificaron los 51 candidatos seleccionados sin fallos ni omisiones por tiempo. Una columna panorámica y el hecho del día anterior sobre 850 puntos conservaron una fuente. Esto prueba cobertura múltiple real en esa consulta, no una proporción universal ni ausencia de otras publicaciones.

Bing siguió sin aportar candidatos; Noticias mostró enlaces `/news/apiclick.aspx` descartados con dominio Bing. El parser de v12 solo desenvolvía la capa inicial HTTPS; v13 incorpora la regresión de envoltorios HTTP y anidados, sin ampliar dominios aceptados. Su efecto en búsquedas en vivo requiere otra comprobación de producción.

En v13 el resumen de búsquedas incompletas cuenta también consultas dirigidas que no se terminaron, aunque los índices de todas las editoriales hayan respondido. Se conserva por separado el progreso de secciones y buscadores: un límite global de consultas no puede aparecer como una revisión totalmente completada.


## Carga progresiva y latencia

El cliente solicita `Accept: application/x-ndjson` para leer avances de `/api/news/pulse`. Cada avance contiene solo noticias que ya superaron la verificación y los filtros de cartera/frescura; no hay titulares ficticios ni candidatos sin verificar. RSS publica avances mientras verifica artículos, y RSS/Gemini publican resultados disponibles sin esperar al otro proveedor. La comparación completa entre editoriales continúa con los mismos criterios y presupuestos. La respuesta `complete` conserva diagnósticos, cobertura y `checkedAt`; clientes JSON siguen recibiendo la respuesta completa habitual. Una interrupción se presenta como error con las noticias verificadas disponibles y opción de reintento, nunca como una consulta terminada.

Los índices económicos se solicitan en paralelo con RSS y el análisis. La cobertura reutiliza verificaciones RSS exitosas solo si tanto la URL solicitada como la publicación HTTPS final pertenecen a la editorial buscada. Pedidos simultáneos con la misma cartera, selección, perfil, posiciones y activos personalizados comparten el trabajo en curso y sus avances; otras selecciones permanecen aisladas. No hay tareas que dependan de seguir corriendo después de enviar la respuesta: el stream se mantiene abierto hasta completar el trabajo.

La interfaz espera a conocer la sesión/cartera antes de iniciar la consulta. Conserva las noticias visibles durante una actualización y puede mostrar una consulta completa reciente de la misma selección (hasta dos horas, respetando la vigencia de las publicaciones) al cambiar de hora, mientras busca la nueva. Solo el resultado completo se guarda en el caché local. Los avances no se guardan como definitivos. Los IDs RSS se derivan de la URL principal para que un resultado que llega antes no reutilice el ID de otra noticia; una comparación abierta se actualiza por publicaciones compartidas.

Esta optimización mantiene `v13_news_tracking_coverage`: el formato y las reglas de cobertura son compatibles y no se borran las consultas válidas ya guardadas por los usuarios. `timingsMs.firstNews` y `timingsMs.total` permiten distinguir primera noticia disponible de trabajo completo. Las pruebas HTTP retienen deliberadamente el buscador y comprueban que los avances llegan antes de liberarlo; las de navegador verifican lectura/audio tempranos, finalización, caché y recuperación ante interrupciones. Son controles de latencia funcional, no mediciones de tiempos de proveedores en producción.


## Jornada diaria con actualización horaria

El pulso actual acumula las publicaciones de la jornada argentina y comienza un conjunto nuevo a las00:00. Ya no se recupera el día anterior por la ventana de48horas de los recolectores. La comparación y la clasificación se mantienen; el conjunto completo del día se combina al actualizar cada hora. Ver [Noticias por jornada](DAILY_NEWS.md) para temporizadores, persistencia y pruebas.

## Recopilación de novedades de los seis medios

Se corrigió una limitación de descubrimiento: los cuatro RSS pertenecían a tres editores (Ámbito, El Cronista e Infobae). Los índices de La Nación, Clarín e iProfesional ya se descargaban, pero solo podían agregar fuentes a una noticia existente; sus hechos independientes quedaban fuera del pulso.

Los índices compartidos ahora alimentan también la recopilación de noticias nuevas. Se reutiliza la misma descarga, cola de verificación con un máximo de cuatro solicitudes, presupuesto de tiempo y deduplicación de URLs. Una sección puede aportar noticias aunque fallen todos los RSS y mostrar avances mientras otro feed sigue pendiente. La fecha se comprueba en la publicación original y cada noticia debe relacionarse con los activos seleccionados. Los enlaces o títulos de portada no se usan como prueba de una dirección de impacto.

La clasificación usa el texto verificado de cada artículo, sin cuotas por categoría: una colección puede ser neutral cuando la evidencia lo justifica. Las pruebas incluyen novedades independientes favorables, adversas y neutrales de los tres editores que antes no originaban tarjetas, noticias de ayer descartadas y una sola descarga por publicación. Se conservan la actualización horaria, el acumulado del día y el reinicio a las 00:00 de Argentina.

Validación conjunta con la corrección de audio: lint, 230 pruebas unitarias/de integración y las 42 comprobaciones completas de navegador aprobadas. La regresión HTTP comprueba la conexión real del endpoint con los índices, tres publicaciones independientes con evidencia verificada y la conservación del resultado desde caché.

## Pluralidad editorial y más de doce medios argentinos

La recopilación incorpora Página/12, Perfil, El Destape, Tiempo Argentino, El Economista y EconoJournal junto a los seis medios anteriores. Se agregó también BAE Negocios, sumando trece editores configurados. La selección combina diarios generales con líneas editoriales diferentes y publicaciones especializadas en economía y energía; el contenido se evalúa por fuente, fecha, hecho y relación con la cartera, sin cuotas políticas ni de impacto.

Los artículos de Página/12 y Perfil cambiaron de formato: se admiten tanto las URLs históricas como las actuales, manteniendo la exclusión de portadas, secciones y dominios impostores. EconoJournal también puede aportar candidatos por su RSS oficial cuando la portada demora. El RSS solo descubre enlaces; se descarga y verifica el artículo original antes de incorporar una noticia.

Se mantiene el máximo de cuatro verificaciones simultáneas y el mismo presupuesto de recopilación. Cada medio recibe turnos, las URLs se deduplican y una caída de un editor no se presenta como una noticia ni elimina los resultados válidos de los demás. Los medios configurados, índices respondidos y artículos verificados se distinguen en los diagnósticos; su disponibilidad se comprueba con respuestas reales después de cada despliegue.

La comprobación real de los despliegues de esta ampliación verificó artículos originales de Ámbito, El Cronista, Infobae, La Nación, Clarín, iProfesional, Página/12, Perfil, El Destape, Tiempo Argentino, El Economista y BAE Negocios: doce editores distintos. La comprobación distingue disponibilidad por consulta de verificación acumulada: un timeout ocasional de un índice no convierte sus notas anteriores en noticias nuevas. EconoJournal permanece como fuente adicional configurada, sin contar un índice vacío como un artículo verificado.

## Un acontecimiento con varias coberturas

El agrupamiento aplica a todas las noticias y emisores. Una cotización puede
variar mientras distintos medios cubren el mismo episodio: se admite la diferencia
porcentual del movimiento bursátil cuando coinciden el activo, la dirección, la
jornada argentina y el catalizador respaldado por las publicaciones. Esto no
relaja las cifras de inflación, tasas, balances, dividendos, producción o pagos.
Una investigación sobre otro hecho, otra dirección o un período contable distinto
continúa separado. Los extractos usados como evidencia pertenecen al editor
verificado; las síntesis generadas no sirven para justificar una coincidencia.

El caso público del 9/11/2026 reproduce Ámbito, Infobae y Perfil sobre Nvidia:
Infobae describe la caída inicial del 8% y la variación al 5% al mediodía. La tarjeta
común conserva cada titular, cifra, fecha y enlace original. La nota sobre petróleo
y rebote global queda aparte aunque mencione a Nvidia. Las regresiones generales
incluyen otros emisores y causas diferentes; no hay una excepción por ticker.

La consolidación vuelve a recorrer todo el acumulado del día, incluidos duplicados
ya existentes en `v16_daily_news`, y se aplica al recibir avances, completar una
consulta y restaurar cachés de cliente/servidor. Se conserva `checkedAt` y no se
borra el acumulado. Las vistas de Guardadas e historial agrupan por la fecha de
publicación para mostrar las coberturas juntas; sus snapshots y vencimientos
persistidos permanecen independientes. La búsqueda contempla los titulares de
todas las fuentes del grupo.

Una URL secundaria compartida no permite eliminar otro acontecimiento. Las
fuentes deben ser compatibles entre sí también durante la recopilación RSS y el
enriquecimiento. Cuando un editor cambia una publicación ya incorporada, se retira
su versión anterior antes de reconciliarla. El análisis por activo se reconstruye
con todas las publicaciones: conserva activos secundarios, posiciones LONG/SHORT
y límites de contexto, sin copiar la caída de una empresa a un índice mencionado
en otro párrafo.

Validación del agrupamiento general: lint de cliente/servidor, 277 pruebas
unitarias/de integración con PostgreSQL local, cero omitidas y 49 comprobaciones
completas de navegador. Incluyen el caso original en cualquier orden, la caché
anterior, fuentes progresivas de otro emisor, comparación de titulares/cifras/URLs,
actualización y recarga, separación de causas distintas, URL secundaria revisada,
activos personalizados y conservación de comparaciones ya verificadas.
