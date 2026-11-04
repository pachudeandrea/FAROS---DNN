# Comparación de cobertura del mismo hecho

RSS y Gemini se consultan en paralelo. Una respuesta exitosa de Gemini ya no evita la consulta de los RSS de Ámbito, El Cronista e Infobae. Después se cruzan sus publicaciones verificadas y se deduplican los acontecimientos, conservando un único análisis de cartera y hasta cinco editoriales distintas por hecho.

## Recopilación equilibrada

Los cuatro RSS se solicitan en paralelo con un plazo de cinco segundos. Los dos feeds de Ámbito cuentan como una editorial al repartir los turnos de verificación. Se normalizan URLs y se eliminan duplicados antes de abrir las publicaciones. Dentro de cada medio se priorizan las relaciones con la cartera, manteniendo turnos entre medios. Hasta cuatro verificaciones se ejecutan simultáneamente con un presupuesto acotado de 18 segundos; no se lanzan más al vencerlo. Gemini dispone de un plazo total de 20 segundos y verifica sus enlaces en paralelo con cancelación.

Los errores transitorios de verificación de una URL se reutilizan solo durante 30 segundos, en vez de excluir durante horas una publicación que podría volver a estar disponible. Una cancelación no se guarda como fallo. Se registran diagnósticos por feed y editorial: candidatos, verificaciones, descartes, fallos de acceso y agotamiento de presupuesto. Una caída de todas las fuentes no se presenta como una consulta exitosa sin novedades.

## Correlación

Se comparan titulares originales, fecha, protagonista, acción, mercado, importes y porcentajes. Se reconocen sinónimos como BCRA/autoridad monetaria y mantener/dejar sin cambios. Se separan países y bancos centrales, subas/bajas/mantenimiento, tasas/encajes, compras/ventas/no compras, cifras incompatibles y otra rueda diaria. No se fusionan publicaciones por compartir solo un ticker o una categoría general. Cada candidato debe concordar con la publicación principal; no se agregan cadenas de semejanzas entre secundarios.

El banco central de Australia no es el BCRA y no genera automáticamente una relación con AL30, GD30, MEP o CCL. Una cartera con activos seleccionados solo recibe los hechos con relación identificada a esas tenencias. Sin selección se permite consultar el panorama general, sin presentar esos instrumentos como propios.

Cada fuente conserva su titular, editorial, fecha y URL verificados. La comparación muestra una publicación por editorial, aunque dos diarios usen el mismo titular de agencia. Si solo se puede verificar una publicación del acontecimiento, se indica una fuente; la existencia de otro medio no se inventa. La cantidad efectiva de medios depende de publicaciones y accesos reales, no de un mínimo artificial.

## Caché y pruebas

El espacio de caché actual es `v8_multimedia_events`, compartido por cliente y servidor. Se descartan las noticias del formato anterior conservando sesión, cartera y calendario. `Actualizar pulso` fuerza la búsqueda. `/api/version` informa el commit y `newsVersion`, sin datos privados.

Las pruebas cubren RSS simultáneos, un medio lento o caído, reparto entre editoriales, deduplicación, plazos, reintento de errores transitorios y tres medios para un mismo acontecimiento. Las pruebas de API demuestran que RSS agrega El Cronista e Infobae cuando la búsqueda simulada de Gemini solo encuentra Ámbito. También verifican que otros pagos, fechas, países, cifras o decisiones permanezcan separados. Los transportes son fixtures explícitos y no sustituyen consultas periodísticas en vivo.

La red de este entorno todavía deniega las consultas directas a los sitios periodísticos y a producción. Los dominios quedaron declarados en el borrador de configuración; deben estar aplicados para verificar cobertura y despliegue reales. Publicar código en Git no demuestra por sí solo que Vercel haya finalizado el despliegue.
