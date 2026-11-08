# Clasificación direccional — 6 de noviembre de 2026

Se reprodujo el error con tres titulares públicos devueltos por producción `4dc4898`. Todos tenían impacto neutral y categoría de contexto macro, incluso un rebote explícito de bonos. El reconocimiento anterior exigía casi siempre un ticker seguido de una lista reducida de verbos; además, todo el contexto macro quedaba neutral.

| Titular verificado | Lectura para deuda soberana LONG |
| --- | --- |
| Los bonos en dólares rebotan y el riesgo país se sostiene por debajo de los 900 puntos | Favorable: movimiento del conjunto de bonos |
| El riesgo país saltó 8,6% y superó los 900 puntos, mientras el MSCI Merval tuvo su peor caída diaria desde junio | Alerta: aumento de la prima de riesgo soberano |
| Cae el riesgo país argentino, pero sigue sobre los 900 puntos, mientras Wall Street insinúa un rebote | Favorable: reducción de la prima de riesgo soberano |

Estas señales corresponden a `valoracion_mercado`, distinguiendo la lectura del conjunto de una cotización individual. Las relaciones y el detalle lo explican sin inventar precios, porcentajes por instrumento, retornos ni previsiones. Se aplican a los bonos soberanos argentinos relacionados por el titular; no a BOPREAL ni a toda la cartera. Un movimiento explícito de una especie prevalece sobre el del conjunto.

Se ampliaron los verbos observados (rebota, saltó, se hundió, se desplomaron) y se reconocen alias de emisores como Banco Galicia. Las subas de costos o precios de productos, las negaciones y los rumores no se convierten en movimientos de cotización. Las reservas, tasas y niveles sin dirección explícita permanecen neutrales. La clasificación por posición SHORT se invierte y un conjunto de efectos opuestos no se presenta como beneficio neto sin ponderaciones.

Las mismas reglas se usan en RSS, Gemini, resumen, tarjetas, filtros, detalle y alertas. La regresión HTTP verifica también las respuestas desde caché. La regresión de Chromium verifica los tres titulares junto a uno neutral, el contador, el filtro y el detalle tanto LONG como SHORT.

El espacio de noticias pasa a `v15_directional_classification` porque las clasificaciones anteriores son incompatibles: el navegador las elimina y el servidor deja de reutilizarlas. No se borran sesiones, cuentas, carteras, calendarios, preferencias o guardadas.

La captura del usuario incluye “Noticias anteriores”, ausente en el frontend vigente; eso indica que la captura muestra una versión anterior de la interfaz. La clasificación incorrecta también se confirmó en la API vigente, por lo que recargar la página por sí solo no era una corrección suficiente. Tras desplegar la corrección se debe cargar el frontend nuevo con “Actualizar FAROS” o recargando la página.

Los metadatos originales públicos de la reproducción se conservan en `tests/fixtures/classification-production-2026-11-06.json`. Las pruebas locales reproducen esos titulares y no descargan ni modifican cuentas de producción.

Validación local completada: `npm run lint`; 192 pruebas aprobadas con PostgreSQL local descartable y cero omitidas; `npm run test:browser` con 32 comprobaciones aprobadas. La captura de la regresión comprueba contadores, etiquetas, filtros y detalle, así como el retiro de cachés v13 conservando el token de sesión. Antes de la corrección la reproducción de titulares reales fallaba; tras la corrección pasa tanto por RSS como por Gemini y por caché completa.


La verificación posterior en producción detectó un titular actualizado del mismo medio: «Los bonos soberanos borran subas iniciales y el riesgo país vuelve a saltar por encima de los 900 puntos». Se agregó la atribución de movimientos observados repetidos («vuelve a saltar», «volvió a bajar») tanto por instrumento como por conjunto. «Podría volver a subir» y «no vuelve a subir» siguen sin atribuir dirección. La versión final v15 retira también las clasificaciones de v14 generadas antes de ese ajuste.

## Catalizadores judiciales y operativos — 7 de noviembre de 2026

La restricción anterior también dejaba neutrales los hechos corporativos mientras no hubiera una cotización explícita. Se distinguen ahora señales de valoración (riesgo u oportunidad para el emisor) de movimientos observados del precio: una obligación judicial de pago, condena, embargo o sanción atribuida al emisor puede ser adversa; el rechazo de una demanda o una resolución favorable puede ser favorable. Cambios claros de ganancias, márgenes, costos y producción aportan dirección de valoración. Una inversión anunciada o una suba del precio de un producto no bastan por sí solas para deducir el valor de la acción. Se conservan las negaciones, atribución por emisor, efectos opuestos e inversión por posiciones SHORT.

La nota reportada, «Juicio YPF: mucho ruido y una premisa equivocada» (El Cronista, https://www.cronista.com/columnistas/juicio-ypf-mucho-ruido-y-una-premisa-equivocada/), es una columna sobre el amicus de quince estados estadounidenses que pide revisar un fallo favorable a Argentina. Su bajada explica una controversia de jurisdicción y derecho aplicable. No informa una nueva condena contra YPF. Se clasifica como valoración con seguimiento judicial y una explicación explícita de la ausencia de un nuevo catalizador direccional; no se descarta como ruido ni se presenta la obligación del Estado como deuda de la empresa.

Se utiliza el titular original junto con hasta 1200 caracteres de bajada/cuerpo del editor extraídos del HTML ya verificado. El cuerpo proviene únicamente del NewsArticle JSON-LD asociado al mismo titular; no se incorporan recomendaciones laterales ni texto genérico del sitio. No se agregan descargas y una síntesis generada por IA nunca sirve de evidencia de clasificación. Las tarjetas de valoración permiten desplegar el motivo de su clasificación.

Se mantiene `v16_daily_news`. Los snapshots generados por FAROS se reclasifican al leerlos, sin borrar las noticias acumuladas ni alterar la hora de consulta o la fecha de publicación. Las colecciones del día y el corte a medianoche de Argentina continúan; Guardadas mantiene su vencimiento independiente. Los activos personalizados requieren su catálogo para reclasificarse y nunca se eliminan por faltar en el catálogo general.

Validación de esta corrección: lint de cliente/servidor, 221 pruebas unitarias y de integración aprobadas con PostgreSQL local y cero omitidas, más las dos regresiones nuevas de navegador sobre catalizadores judiciales y reclasificación de caché. El recorrido general completó sus primeras 35 comprobaciones; una aserción nueva asumía un reloj de 24 horas y se ajustó al formato real de Chromium antes de repetir satisfactoriamente las dos comprobaciones nuevas. No se afirma una ejecución completa de las 41 en esta corrección.
