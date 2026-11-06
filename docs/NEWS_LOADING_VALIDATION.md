# Validación de carga y guardadas temporales — 6 de noviembre de 2026

Se retiraron la vista y el selector de historial y las escrituras automáticas al terminar una consulta. Guardar mantiene una copia completa por cuenta durante 24 horas desde `saved_at`; consultar no renueva ese plazo. La migración 007 elimina historial y guardadas vencidas. La caché del pulso mantiene `v13_news_tracking_coverage`.

## Espera identificada

El recolector esperaba todos los RSS antes de comenzar a verificar publicaciones. Ahora verifica un candidato temprano del primer feed disponible mientras espera los otros feeds. La colección final conserva todos los medios y la comparación de fuentes. Las dos fases comparten las promesas de verificación y un límite total de cuatro verificaciones simultáneas, sin esperar a terminar la fase temprana para iniciar la colección final.

## Mediciones controladas

Estas mediciones usan transporte simulado y Chromium local; no representan producción ni una garantía de duración máxima. Son muestras individuales, no percentiles. No se utilizó el video mencionado en el pedido.

| Medición | Primera noticia | Finalización |
| --- | ---: | ---: |
| Colector original de `7c84178`, feed demorado 300 ms | 422,5 ms (emisión verificada) | 427,9 ms |
| Colector corregido, mismo escenario | 8,0 ms (emisión verificada) | 312,9 ms |
| Navegador compilado, API progresiva simulada | 716 ms (tarjeta visible) | 1748 ms |

La medición de navegador incluye navegación, espera del runner y cierre del aviso de alertas. Tras comprobar la primera tarjeta se introdujo deliberadamente una espera de 1000 ms antes de completar la respuesta. Esa duración final la controla la prueba; demuestra que la primera tarjeta se puede leer mientras continúa la consulta, no que el backend real termine en 1748 ms. Al recargar, la tarjeta estuvo visible antes de 828 ms, con cero solicitudes nuevas al pulso: se reutilizó la caché completa. Los avances no se conservan como consultas completas.

## Comprobaciones

- `npm run lint`.
- `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/faros_test npm test`: 182 pruebas aprobadas, 0 fallidas, 0 omitidas.
- `npm run test:browser`: compilación y comprobaciones con Chromium; incluye persistencia tras recargar, cuentas separadas, vencimiento exacto con reloj controlado, contador, fallos de guardado y ausencia de historial.
- Servidor de desarrollo iniciado con PostgreSQL 17 local descartable; `/api/health` devuelve estado `ok` y base `postgresql`. Migraciones aplicadas dos veces sin error. Las pruebas verifican eliminación de históricos y vencidas conservando cuentas y guardadas vigentes.

## Límite de validación externa

El acceso a `https://faros-dnn.vercel.app/api/version` recibió `CONNECT 403` del proxy. No hay una medición de latencia real de producción ni confirmación de despliegue derivada de estas pruebas. El borrador del entorno añade el dominio de producción y los dominios de los medios; necesita que el usuario guarde la configuración para aplicarlos. Publicar en GitHub y confirmar el despliegue en Vercel son resultados distintos.

## Nueva investigación con acceso a producción — 6 de noviembre de 2026

El bloqueo de red de la revisión anterior quedó resuelto al publicar el entorno. Se comprobó que producción sirve `8cf9efff344811540c1ca04c7c524dd515e97d27`: `scripts/check-deployment.mjs` confirmó SHA, salud PostgreSQL y bundle correspondiente. Al realizar estas mediciones, los cambios siguientes permanecían locales, sin push ni publicación, a la espera de autorización.

### Causas corregidas

- Guardar una cartera con la misma selección reconstruía sus arrays/objetos: el efecto del pulso abortaba y reiniciaba la petición. Ahora depende de la selección semántica; cambiar activos, posiciones, perfil o metadatos sigue actualizando. Guardar sin cambios tampoco elimina su caché completa.
- La limpieza borraba el respaldo del día anterior antes de poder reutilizarlo, incluso a minutos de medianoche. Ahora conserva el respaldo completo de hasta dos horas.
- El avance RSS probaba una sola candidata temprana; si era antigua, irrelevante o inaccesible, esperaba los demás feeds. Ahora una cola verifica las disponibles, prioriza la cartera y da turnos a los medios que van llegando. Mantiene cuatro verificaciones simultáneas, un presupuesto compartido de 18 segundos y la comparación final.
- La caché del servidor vivía solo en la memoria de cada instancia y dependía del ID de cartera. La nueva migración `008_news_pulse_cache.sql` permite reutilizar consultas completas entre instancias por selección exacta. Incluye activos, perfil, posiciones, metadatos y versión; no almacena cuentas ni sesiones. Un respaldo de otra hora se entrega como avance mientras se actualiza. La base opcional tiene tiempos acotados y sus fallos no bloquean el recolector. No se modifica la versión de caché `v13_news_tracking_coverage` ni el comportamiento de Guardadas.

### Mediciones reales, con sus límites

Todas son muestras individuales del mismo día; la red, la ubicación y el calentamiento de los servicios varían. No son percentiles ni garantizan esos tiempos en otros equipos.

| Escenario | Primera noticia | Consulta completa |
| --- | ---: | ---: |
| Producción actual, POST forzando actualización, cliente Node | 1,00 s | 10,64 s |
| Producción actual, Chromium y actualización nueva | 4,30 s desde la petición | 17,18 s desde la petición |
| Corrección local, Chromium y actualización nueva con medios reales | 0,97 s desde la petición | 20,84 s desde la petición |
| Segunda instancia local sin memoria previa, caché persistente de la selección | 0,060 s desde la petición | 0,239 s hasta observar finalización |

La consulta completa local puede tardar más que la muestra de producción: la comparación externa sigue ejecutándose después de mostrar las primeras noticias. No se afirma que toda la consulta termine en menos de un segundo. En el último caso, el POST y la respuesta se completaron antes de que el runner registrara la finalización visual; el tiempo incluye comprobaciones del navegador.

Para el navegador de producción y los locales se utilizó el frontend real y el pulso real, con una identidad de demo simulada solo en el navegador. No se crearon ni modificaron cuentas de producción. Se registró la primera tarjeta mediante observación del DOM y requestAnimationFrame, sin introducir una espera artificial de cobertura. Esta prueba no mide el tiempo de autenticación de una cuenta real. En la prueba local no había clave Gemini; utilizó fuentes RSS verificadas y búsqueda de cobertura disponible bajo la política de red del entorno.

También se comparó el recolector anterior y el corregido desde la misma máquina, vaciando la caché de verificación en cada ejecución y usando medios reales:

| Recolector RSS | Primera emisión verificada | Finalización | Resultado |
| --- | ---: | ---: | --- |
| `8cf9eff` | 4,158 s | 15,572 s | 65 fuentes verificadas, 3 noticias |
| Corrección local | 0,261 s | 10,125 s | 65 fuentes verificadas, 3 noticias |

Las ejecuciones fueron secuenciales; los servidores externos pueden estar más calientes en la segunda. La prueba de regresión con fuentes controladas verifica además que una primera candidata irrelevante o vencida no impide mostrar otra relevante mientras un feed permanece pendiente, y que el resultado final conserva los grupos de publicaciones.

### Validación de esta corrección

- `npm run lint`: aprobado.
- `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/faros_test npm test`: 189 aprobadas, cero fallidas u omitidas.
- `npm run test:browser`: 31 comprobaciones aprobadas. Incluye guardar dos veces una selección idéntica durante una consulta pendiente: no cancela ni inicia otra consulta; al recargar reutiliza la caché completa.
- Tras ajustar el total informado para incluir la escritura de caché: lint y 14 pruebas de cobertura/caché aprobadas.
- PostgreSQL local descartable: persistencia entre procesos, aislamiento de selecciones, respaldo de otra hora seguido por consulta genuina, tabla bloqueada con continuidad de las fuentes y escritura posterior recuperada.
- Migraciones locales aplicadas sin modificar las ya publicadas. La nueva tabla es una caché de consultas completas, no un historial de cuentas.

El usuario autorizó publicar esta corrección en `main` después de completar esta validación. Los tiempos de la corrección local todavía no son mediciones del código desplegado en Vercel.
