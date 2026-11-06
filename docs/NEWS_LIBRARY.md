# Noticias guardadas durante 24 horas

Guardar conserva una copia completa de la tarjeta en la cuenta: titulares, síntesis, análisis, audio, publicaciones originales y fechas. Se confirma únicamente después de una escritura exitosa; los errores mantienen el marcador anterior y permiten reintentar. La demo utiliza almacenamiento local y tampoco confirma si falla.

Cada copia vence exactamente 24 horas después de `saved_at`, independientemente de cuándo se publicó. Consultar, recargar, cambiar el pulso, cerrar sesión y repetir un guardado activo no renuevan esa fecha. Quitar el marcador elimina la copia; guardarla nuevamente inicia un plazo nuevo. La identidad utiliza URLs normalizadas y jornada, conservando enlaces originales y la copia elegida.

No existe historial ni selector de fechas. Consultar noticias no archiva ni sincroniza tarjetas. El endpoint POST de historial fue retirado.

- `GET /api/news/library?offset=0`: páginas de 50 guardadas vigentes y referencias para el contador.
- `PUT /api/news/library/bookmark`: guarda o elimina una copia y devuelve referencias confirmadas.

La sesión determina el propietario; `expectedUserId` protege pestañas de otras cuentas. Las escrituras se serializan por cuenta. El servidor excluye y elimina registros vencidos al acceder a Guardadas. La migración nueva `007_temporary_saved_news.sql` elimina históricos y guardadas ya vencidas sin modificar cuentas, carteras ni preferencias. No se modifica la migración 006 publicada. No hay una tarea programada: sin actividad, un registro vencido puede permanecer físicamente hasta el siguiente acceso, pero no se devuelve.

La copia local `faros_library_v1:<userId>` descarta históricos y vencidas al iniciar. Un temporizador hasta el próximo vencimiento, y controles al recuperar foco o visibilidad, actualizan tarjetas y contador incluso con la pestaña abierta. La caché local de cuentas reales conserva hasta 200 tarjetas; las demás se recuperan paginando. Cada cuenta mantiene su propio almacenamiento.

La caché del pulso conserva `v13_news_tracking_coverage`. El primer candidato de un feed disponible puede verificarse mientras terminan los otros feeds. La colección final sigue usando todos los medios, el orden equitativo y la comparación de publicaciones; reutiliza la verificación temprana. Esto reduce una espera previa a la primera noticia, sin garantizar una reducción equivalente de la duración total.
