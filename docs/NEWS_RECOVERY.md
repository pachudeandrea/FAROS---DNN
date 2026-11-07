# Recuperación de errores del pulso

La captura reportada mostraba error y cero noticias. Las consultas anónimas de producción, incluida una actualización manual y otra selección de la cartera de ejemplo pública, respondieron correctamente. Eso no validaba el camino de un navegador con sesión: el endpoint esperaba dos lecturas de identidad antes de buscar siquiera la caché. Una falla de la base podía devolver 503 y bloquear noticias que ya son públicas.

La regresión local reprodujo ese 503 con una cabecera de sesión de prueba y una base local inaccesible. La corrección valida la identidad de forma independiente: solo una identidad comprobada recibe alertas personales; las noticias públicas no esperan ni dependen de esa lectura. Las rutas privadas, como Guardadas, siguen fallando cerradas si no se puede validar la sesión. Nunca se reutiliza una identidad anterior como respaldo.

La caché compartida admite hasta un segundo de conexión y 500 ms por consulta, en lugar de 200 ms, para tolerar el inicio de una base remota. Si la primera lectura falla y las fuentes tampoco responden, se vuelve a intentar recuperar el conjunto de ese día y esa selección antes de informar el error. Esta recuperación no renueva el horario de las noticias ni trae publicaciones de ayer. La prueba utiliza un bloqueo real de PostgreSQL seguido de liberación y una caída simulada de todas las fuentes.

El cliente conserva el código, estado HTTP y `Retry-After` de los errores, mostrando mensajes seguros en español. Reintenta dos veces los fallos transitorios, con esperas de 2 y 5 segundos como mínimo. No reintenta errores de validación o 404. Los cambios de cuenta, selección, hora o jornada cancelan las recuperaciones anteriores; recuperar foco no crea solicitudes duplicadas ni evita el límite de reintentos.

Las noticias completas y avances ya visibles del día permanecen disponibles durante un error. Las respuestas progresivas siguen sin guardarse como consultas terminadas. Las cachés vacías o inválidas no deben ocultar el conjunto válido de otras horas del día. Se mantiene `v16_daily_news`: esta corrección no elimina las colecciones diarias existentes ni modifica el corte a las 00:00 de Argentina o las 24 horas de Guardadas.

Validación: `npm run lint`, 209 pruebas unitarias/de integración y 39 comprobaciones de navegador aprobadas. Incluyen carga inicial, actualización manual, recuperación de 503, límite de dos reintentos, conservación de noticias del día, corte a medianoche y aislamiento de rutas privadas durante una caída de la base.
