# Comparación de cobertura del mismo hecho

La búsqueda Gemini ya verificaba varias publicaciones, pero el armado de cada noticia conservaba solo el `sourceId` principal. Ahora la búsqueda pide cobertura del mismo hecho en medios distintos y se añaden las coincidencias verificadas que ya encontró. No se agregan llamadas al proveedor ni se reemplazan el análisis, el audio, los activos, el perfil o el orden de las noticias.

La comparación usa los titulares originales y las fechas verificadas de las publicaciones. Reconoce variantes como «BCRA» y «Banco Central» y separa acciones distintas de una misma empresa, mercados cambiarios distintos, meses de datos diferentes y ruedas diarias distintas. Cada candidato se compara con la publicación principal; no se agrupan noticias por una cadena de coincidencias entre fuentes secundarias. Se conservan hasta cinco medios distintos, sus titulares, fechas y enlaces originales. Una sola fuente sigue mostrándose cuando no hay otra coincidencia verificada.

La alternativa RSS utiliza la misma comprobación y conserva las fechas ISO y los timestamps extraídos antes de aplicar su filtro de actualidad existente. La interfaz cuenta una sola publicación por medio; dos medios que reproducen el mismo titular siguen disponibles para comparar. El detalle incorpora **Comparar titulares de N medios**, con tarjetas en dos columnas en pantallas amplias y una columna en celulares. Los titulares permiten ver cómo presenta el hecho cada medio sin inventar interpretaciones sobre su postura editorial.

El caché sigue funcionando por cartera/hora y el botón **Actualizar pulso** fuerza la búsqueda. La versión de cobertura usa ahora el espacio `v4_coverage`, compartido entre cliente y servidor. Al abrir la versión nueva se descartan únicamente las noticias guardadas con el formato anterior y se vuelve a consultar el feed; sesiones y calendarios se conservan. Esto corrige un caso reproducido en Chromium en el que entrar después del despliegue reutilizaba noticias de una sola fuente y ni siquiera consultaba el servidor. Las siguientes entradas reutilizan el caché nuevo normalmente.

`GET /api/version` identifica el pipeline servido (`newsVersion`) y el commit de Vercel (`revision`, cuando está disponible). Es público, responde sin depender de la base y lleva `Cache-Control: no-store`. No contiene credenciales ni datos de cuentas. Permite distinguir código publicado en Git de la versión efectivamente desplegada; una respuesta 404 puede indicar una versión anterior o una ruta API pendiente.

## Pruebas

`tests/newsCoverage.test.ts` comprueba la conservación del análisis y los activos, titulares idénticos en medios distintos, deduplicación por editorial, fechas, fuentes inválidas y hechos que deben seguir separados. Además invoca la entrada API compilada con Node y proveedores/publicaciones simulados para verificar el flujo completo Gemini, la alternativa RSS, el caché, la actualización forzada y diferentes carteras y perfiles. El transporte de estas pruebas no permite llamadas externas.

`npm run test:browser` comprueba la apertura de la comparación, los enlaces de los medios, la conservación del titular de agencia en dos publicaciones y el diseño a 320, 390, 768 y 1440 px, además de las comprobaciones anteriores de pantallas, cuentas y notificaciones. Las capturas quedan en `/tmp/faros-browser-checks/comparison-390.png` y `comparison-768.png`.

La regresión del caché siembra noticias anteriores de una sola fuente, comprueba la renovación automática al entrar, la conservación de la sesión y el calendario, la actualización manual y la reutilización del caché nuevo al recargar. Esa prueba falló con el código anterior antes de corregirlo.

La red de este entorno no permite consultar en vivo los sitios periodísticos ni el despliegue de FAROS. Las pruebas locales verifican la implementación con publicaciones controladas; la cantidad efectiva de medios en producción depende de la cobertura encontrada, su acceso y la verificación de cada enlace.

Validación: **62 pruebas funcionales y de regresión**, **9 comprobaciones de navegador**, TypeScript y compilación aprobados. Los casos nuevos cubren Gemini y RSS, además de la comparación visual.

Corrección del caché: **6 pruebas de noticias/API** y **10 comprobaciones de navegador** aprobadas, incluida la reproducción con noticias anteriores. TypeScript y compilación también aprobaron.
