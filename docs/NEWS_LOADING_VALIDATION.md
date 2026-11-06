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
