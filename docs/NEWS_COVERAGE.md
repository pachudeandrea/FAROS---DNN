# Comparación de cobertura del mismo hecho

RSS y Gemini se consultan en paralelo. Una respuesta exitosa de Gemini ya no evita la consulta de los RSS de Ámbito, El Cronista e Infobae. Después se cruzan sus publicaciones verificadas y se deduplican los acontecimientos, conservando un único análisis de cartera y hasta cinco editoriales distintas por hecho.

## Recopilación equilibrada

Los cuatro RSS se solicitan en paralelo con un plazo de cinco segundos. Los dos feeds de Ámbito cuentan como una editorial al repartir los turnos de verificación. Se normalizan URLs y se eliminan duplicados antes de abrir las publicaciones. Dentro de cada medio se priorizan las relaciones con la cartera, manteniendo turnos entre medios. Hasta cuatro verificaciones se ejecutan simultáneamente con un presupuesto acotado de 18 segundos; no se lanzan más al vencerlo. Gemini dispone de un plazo total de 20 segundos y verifica sus enlaces en paralelo con cancelación.

Cuando el RSS general de Infobae no aporta candidatos financieros, se consulta su sección Economía dentro del mismo plazo total de cinco segundos. Se resuelven enlaces relativos de artículos, se deduplican y se rechazan dominios impostores. La sección solo descubre candidatos: cada publicación debe superar la verificación original de titular, fecha y URL. `sections` informa estado y candidatos de la alternativa; `discarded` diferencia sección, temática y hechos sin relación con la selección.

Los errores transitorios de verificación de una URL se reutilizan solo durante 30 segundos, en vez de excluir durante horas una publicación que podría volver a estar disponible. Una cancelación no se guarda como fallo. Se registran diagnósticos por feed y editorial: candidatos, verificaciones, descartes, fallos de acceso y agotamiento de presupuesto. Una caída de todas las fuentes no se presenta como una consulta exitosa sin novedades.

## Búsqueda de publicaciones ausentes

Combinar RSS y Gemini no basta para descubrir otras coberturas: un RSS es una ventana parcial de publicaciones. Se leen hasta 100 candidatos financieros por feed, en lugar de cortar a los 15, antes de priorizar la cartera y repartir verificaciones entre medios.

Después de combinar ambas rutas, las primeras cuatro noticias con alguno de los tres medios ausentes reciben búsquedas dirigidas a los medios ausentes entre Ámbito, El Cronista e Infobae. Se usa la búsqueda RSS pública de Bing, sin clave; solo se envían términos breves del acontecimiento extraídos del titular público, nunca datos de la cuenta o cartera. Si la primera consulta no aporta candidatos se prueba una variante más breve dentro del mismo plazo. Se aceptan hasta tres enlaces por consulta, únicamente del dominio buscado, incluidos los formatos de seguimiento Bing `/ck/a?u=a1…` y `/news/apiclick.aspx?url=…` después de validar el destino. HTTP se admite solo como candidato; la publicación verificada debe terminar en HTTPS y en el medio buscado. El título, fecha y contenido del resultado del buscador no se consideran evidencia: la página original debe superar la verificación y la comparación del mismo hecho. Se mantienen los límites de país, cifras, fecha y decisiones incompatibles.

Las búsquedas paralelas tienen 3,5 segundos de plazo y las publicaciones comparten un presupuesto adicional de seis segundos, con cuatro verificaciones simultáneas. El límite de cuatro noticias evita exceder el tiempo de la petición serverless; no equivale a una búsqueda exhaustiva de todas las noticias. Si el servicio falla o no hay coincidencias verificables, se conserva la fuente disponible. La respuesta incluye `coverageDiscovery` con consultas, indisponibilidad, candidatos, publicaciones verificadas y fuentes añadidas. `queries` detalla por consulta resultados brutos, descartados, aceptados y estado: un RSS vacío no equivale a resultados descartados. La búsqueda externa depende de acceso a `www.bing.com` y a los medios originales.

Las regresiones incluyen una tarjeta con Ámbito desde RSS, Infobae desde su sección económica y El Cronista desde un enlace de seguimiento de búsqueda, conservando titulares, enlaces y relación con la cartera. También incluyen una API sin Gemini cuyos RSS solo aportan un medio, pero cuyos resultados de búsqueda permiten verificar otros dos; también una publicación relevante situada después del puesto quince del RSS y resultados cuyo titular de búsqueda oculta otro país, cifra o fecha en la página original. Son transportes controlados. Este entorno aún devuelve CONNECT 403 al buscar en vivo y consultar producción: esas pruebas no demuestran cobertura periodística real ni un despliegue completado.

## Correlación

Se comparan titulares originales, fecha, protagonista, acción, mercado, importes y porcentajes. Se reconocen sinónimos como BCRA/autoridad monetaria y mantener/dejar sin cambios. Se separan países y bancos centrales, subas/bajas/mantenimiento, tasas/encajes, compras/ventas/no compras, cifras incompatibles y otra rueda diaria. No se fusionan publicaciones por compartir solo un ticker o una categoría general. Cada candidato debe concordar con la publicación principal; no se agregan cadenas de semejanzas entre secundarios.

El banco central de Australia no es el BCRA y no genera automáticamente una relación con AL30, GD30, MEP o CCL. Una cartera con activos seleccionados solo recibe los hechos con relación identificada a esas tenencias. Sin selección se permite consultar el panorama general, sin presentar esos instrumentos como propios.

La equivalencia entre “riesgo país” y “prima de riesgo argentina” exige el mismo nivel en puntos, dirección junto a esa métrica y misma jornada argentina verificada. Una suba de bonos u otra métrica no determina la dirección de la prima.

Cada fuente conserva su titular, editorial, fecha y URL verificados. La comparación muestra una publicación por editorial, aunque dos diarios usen el mismo titular de agencia. Si solo se puede verificar una publicación del acontecimiento, se indica una fuente; la existencia de otro medio no se inventa. La cantidad efectiva de medios depende de publicaciones y accesos reales, no de un mínimo artificial.

## Caché y pruebas

El espacio de caché actual es `v10_verified_event_coverage`, compartido por cliente y servidor. Se descartan las noticias del formato anterior conservando sesión, cartera y calendario. `Actualizar pulso` fuerza la búsqueda. `/api/version` informa el commit y `newsVersion`, sin datos privados.

Las pruebas cubren RSS simultáneos, un medio lento o caído, reparto entre editoriales, deduplicación, plazos, reintento de errores transitorios y tres medios para un mismo acontecimiento. Las pruebas de API demuestran que RSS agrega El Cronista e Infobae cuando la búsqueda simulada de Gemini solo encuentra Ámbito. También verifican que otros pagos, fechas, países, cifras o decisiones permanezcan separados. Los transportes son fixtures explícitos y no sustituyen consultas periodísticas en vivo.

La red de este entorno todavía deniega las consultas directas a los sitios periodísticos y a producción. Los dominios quedaron declarados en el borrador de configuración; deben estar aplicados para verificar cobertura y despliegue reales. Publicar código en Git no demuestra por sí solo que Vercel haya finalizado el despliegue.
