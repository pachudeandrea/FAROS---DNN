# Noticias por jornada argentina

El pulso acumula las publicaciones de cada día de Argentina (`America/Argentina/Buenos_Aires`). Se consulta al abrir la aplicación y automáticamente al cambiar la hora. Una consulta nueva suma noticias y actualiza las repetidas; no reemplaza el conjunto del día. Por ejemplo, una noticia de las 09:00 sigue visible cuando llega otra a las 14:00, aunque ya no aparezca en el RSS más reciente. Una consulta vacía o fallida no borra las noticias ya recopiladas de esa jornada.

A las 00:00 comienza un conjunto nuevo: las publicaciones de ayer desaparecen del pulso. No es un vencimiento móvil de24 horas ni una ventana de48 horas. Se usa la fecha de publicación del medio en Argentina, no la fecha UTC ni la zona del teléfono. Las publicaciones sin fecha verificable no pasan al conjunto diario. La fuente principal determina la jornada; una fuente secundaria de hoy no convierte en noticia de hoy un titular de ayer.

El temporizador del navegador programa la próxima hora argentina. Al recuperar foco o visibilidad, comprueba si cambió la hora o el día, de modo que una pestaña suspendida se actualiza al volver. El cambio de día limpia la lista, cierra un detalle del pulso de ayer y detiene su audio. Una respuesta comenzada antes de medianoche se ignora si llega después. Si la primera consulta del día nuevo falla, no se recuperan noticias de ayer como respaldo.

La actualización automática se ejecuta mientras la aplicación está abierta y al retomarla; no se agrega un rastreador permanente cuando todos los navegadores están cerrados. El conjunto contiene las publicaciones verificadas recopiladas por las consultas de esa selección; no representa un archivo exhaustivo de todos los medios.

## Persistencia y comparación

El servidor conserva los resultados completos de todas las horas del día en la caché PostgreSQL existente. Cada escritura combina los resultados de la jornada mediante una transacción y un bloqueo por selección: dos instancias que completan a la vez no pierden las noticias aportadas por la otra. Se reutilizan los mismos índices y tabla de la migración 008; no se modifica ninguna migración publicada ni se requiere otra.

La selección incluye activos, posiciones, perfil, metadatos y versión de formato. Los resultados de una selección distinta no se mezclan. Los registros de días anteriores se excluyen al leer y se limpian después de una escritura exitosa del día nuevo. No se crea un historial de cuentas ni se restablece “Noticias anteriores”.

El navegador conserva una copia del último resultado completo, que ya contiene el conjunto diario. Las respuestas progresivas se pueden leer durante la comparación, pero no se guardan como una consulta terminada. La caché opcional de PostgreSQL mantiene tiempos de espera acotados; si falla, la consulta de fuentes puede continuar y la copia local del día permanece disponible.

Las URLs se normalizan para deduplicar seguimiento. Las publicaciones repetidas actualizan su tarjeta y los medios que informan el mismo hecho enriquecen la comparación. Se mantienen separados hechos con direcciones o cifras diferentes. Si una URL cambia de titular, no se conserva una comparación antigua que contradiga el nuevo hecho. Las comprobaciones positivas de una fuente se renuevan al cambiar la hora argentina para recuperar las publicaciones actualizadas sin retener su contenido anterior durante seis horas.

## Guardadas

Guardadas mantiene su regla independiente:24 horas desde que el usuario guarda la noticia. Un cambio de jornada no vence una guardada todavía vigente. Las copias completas, su aislamiento por cuenta y los errores de escritura siguen funcionando igual.

El formato del pulso pasa a `v16_daily_news`; se retiran las cachés de noticias anteriores, conservando sesiones, cuentas, carteras, preferencias, calendario y Guardadas.

## Validación

Las pruebas con reloj simulado verifican cambios de hora,00:00 exactas de Argentina (03:00 UTC), suspensión de pestaña, error al volver, respuesta tardía de ayer, persistencia tras recargar y continuidad de Guardadas. Las pruebas con PostgreSQL local verifican el conjunto entre procesos, recuperación de noticias matinales diez horas después y escrituras concurrentes del mismo horario. Estas pruebas no requieren esperar una medianoche real ni usar una base de producción.

Validación completada: `npm run lint`; 204 pruebas aprobadas con PostgreSQL local descartable, cero fallidas y cero omitidas; `npm run test:browser` con 34 comprobaciones aprobadas. La recopilación filtra fuentes de ayer antes de agrupar, para que una publicación de hoy del mismo acontecimiento no quede oculta detrás de una fuente principal del día anterior.
