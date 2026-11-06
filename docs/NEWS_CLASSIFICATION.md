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
