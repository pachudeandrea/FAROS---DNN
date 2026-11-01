# FAROS: lectura, cartera y actualización

El inicio muestra la cartera activa, el resultado de la consulta, su fecha/hora
real en Buenos Aires, las cantidades de noticias y alertas y el resumen de audio.
El balance por impacto y los activos mencionados quedan desplegables. El conteo
refleja únicamente las publicaciones disponibles; no constituye una evaluación de
la ausencia de riesgos.

Cada tarjeta permite abrir directamente los titulares de los medios verificados.
La comparación usa las fuentes del mismo acontecimiento y no genera conclusiones
editoriales. Informa cuando solo hay una fuente o falta la fecha de publicación.

Mi cartera agrupa activos, preferencias, alertas y cuenta. El registro mantiene
nombre, email, contraseña, código de recuperación de cuatro dígitos, mayoría de
edad y términos en dos pasos. Perfil e intereses se configuran después; el broker
opcional se puede guardar desde Cuenta y privacidad. No se agrega verificación
por correo. El tutorial sigue disponible, sin ser obligatorio al primer ingreso.

En celular el calendario abre en agenda. La vista mensual, fuentes, formularios,
recordatorios y alertas siguen disponibles. Los cambios solo se confirman después
de guardarse; ante un error se conserva el formulario para reintentar.

## Consultas, caché y versiones

- `v5_query_coverage` conserva el agrupamiento por acontecimiento e incorpora el
  horario confirmado de la consulta en el caché del cliente, incluso si está vacío.
  Se purgan únicamente los cachés antiguos de noticias. No se borran sesiones ni
  calendarios personales.
- Una consulta fallida conserva las publicaciones anteriores. Una caída de todas
  las fuentes RSS produce un error controlado, en lugar de simular una consulta
  vacía exitosa. La lista filtrada vuelve a calcularse al cambiar las noticias.
- `/api/version` identifica el commit desplegado. El bundle incluye el mismo SHA
  durante la compilación de Vercel. Al volver a la pestaña y periódicamente se
  comprueba si hay una versión nueva. La recarga requiere una acción del usuario
  y queda bloqueada mientras hay formularios o guardados pendientes.
- Calendario, cartera, administración y tutorial se cargan cuando se necesitan.
  Los fallos de carga ofrecen recuperación y conservan los datos ya guardados.
- Los registros `NEWS COLLECTION` agregan candidatos, fuentes RSS consultadas,
  errores de acceso, descartes por categoría, metadatos, URL, duplicación o
  antigüedad y noticias con varios medios. `NEWS PULSE` resume las publicaciones
  devueltas. No incluyen cuentas, carteras, credenciales ni parámetros de URLs.

## Validación local

Usar Node 24, Chromium y una base PostgreSQL **local y descartable** cuyo nombre
contenga `test`. Nunca usar una conexión de producción para la suite.

```sh
npm ci --no-audit --no-fund
npm run lint
npm run build
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/faros_test npm test
npm run test:browser
```

Las pruebas de navegador ejecutan el bundle compilado. Simulan las APIs y los
servicios externos; no envían push a dispositivos reales. Cubren cachés,
actualización y errores, comparación, credenciales, LONG/SHORT, guardadas, audio,
agenda y formularios, consentimiento, instalación en iPhone, worker, versiones y
cambios pendientes. Incluyen 320, 390, 768, 1024 y 1440 px, otros tamaños
intermedios, texto ampliado y pantallas horizontales cortas. Las capturas se guardan
en `/tmp/faros-browser-checks` o en `BROWSER_ARTIFACTS`.

## Después del despliegue

El workflow `Verify production deployment` escucha un `deployment_status` exitoso
con entorno `Production`/`production`, emitido por la integración de Vercel. No
requiere credenciales de la aplicación ni hace escrituras. Si los eventos de
GitHub están deshabilitados para la integración, ejecutar manualmente:

```sh
npm run check:deployment -- https://faros-dnn.vercel.app SHA_COMPLETO_ESPERADO
```

Comprueba que `/api/version` informe el commit esperado, `/api/health` confirme
PostgreSQL y que el HTML y el JavaScript correspondan a ese mismo commit. Reintenta
la propagación durante aproximadamente un minuto y termina con estado distinto
de cero si alguna comprobación falla. Sus pruebas locales incluyen API antigua,
base no disponible y bundle desactualizado.

Un push correcto no prueba que Vercel haya terminado ni que producción esté sana.
La comprobación requiere acceso HTTPS a `faros-dnn.vercel.app`; si la red del
entorno bloquea ese dominio, debe habilitarse en sus ajustes o ejecutarse desde
GitHub Actions. No hace falta modificar la base de producción para verificarlo.
