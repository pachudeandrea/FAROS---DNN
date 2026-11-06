# Noticias guardadas e historial

El contador de Guardadas proviene del archivo de la cuenta. No hay identificadores precargados ni ejemplos marcados automáticamente. Guardar escribe una copia de la tarjeta (titular, síntesis, análisis, audio, publicaciones originales y fechas) en PostgreSQL y solo confirma el marcador después de la respuesta del servidor. Un fallo mantiene el estado anterior y muestra el error con opción de reintento.

Las guardadas no dependen del pulso, de sus cachés por hora ni de la ventana de noticias recientes. No vencen por fecha. Quitar un marcador conserva la noticia en el historial. Eliminar la cuenta elimina sus registros mediante la relación de PostgreSQL; cerrar sesión mantiene los datos de esa cuenta, con vistas y almacenamiento aislados de las demás.

Noticias anteriores permite consultar por fecha argentina las noticias de días anteriores que se fueron consultando y conservando desde esta función. No es un buscador del archivo completo de Internet ni recupera noticias que nunca fueron almacenadas. Solo se archivan resultados completos; los avances de carga progresiva no se confunden con una consulta terminada. Una publicación guardada durante un avance sí conserva la copia verificada que el usuario eligió guardar.

La identidad de una publicación usa sus URLs y jornada, en vez del ID temporal del pulso. Se normaliza seguimiento de URLs sin modificar los enlaces originales de la copia. Los cambios de titular de un pulso posterior no reescriben una copia ya guardada. Se conservan jornadas distintas aunque el medio reutilice una URL. Abrir Guardadas o Noticias anteriores restablece filtros; las preferencias del pulso y la selección actual de cartera no excluyen silenciosamente el archivo. Las fechas de las tarjetas históricas se muestran en formato absoluto.

La migración aditiva `006_news_library.sql` crea `faros_news_library`. Los endpoints autenticados son:

- `GET /api/news/library?view=saved|history&day=AAAA-MM-DD&offset=0`: páginas de 50 registros, metadatos de marcadores y fechas disponibles. `history` comprende jornadas anteriores a hoy en Argentina.
- `POST /api/news/library/history`: conserva un lote de noticias consultadas, independiente del guardado con marcador.
- `PUT /api/news/library/bookmark`: guarda o quita un marcador. Devuelve el registro y los marcadores confirmados.

La sesión determina el propietario. `expectedUserId` impide aplicar una operación de una pestaña antigua a otra cuenta. Las escrituras de una cuenta se serializan para evitar duplicados por solicitudes simultáneas. Cada registro conserva todo el JSON de la tarjeta y sus URLs; no se descarga de nuevo una noticia antigua para poder leer su copia.

El cliente mantiene una copia acotada de hasta 200 tarjetas para cuentas reales y sincroniza sin bloquear la carga del pulso. El archivo completo permanece en PostgreSQL y se pagina desde allí; la caché local no limita lo guardado en la cuenta. Los errores de sincronización se distinguen de un archivo vacío. La demo conserva datos exclusivamente en el navegador y avisa si el almacenamiento no permite guardar.

El espacio local `faros_library_v1:<userId>` está separado de las cachés horarias `faros_news_*` para que su limpieza no borre guardados ni historial. No se invalida el espacio de noticias actual por esta función.
