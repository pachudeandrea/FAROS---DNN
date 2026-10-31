# FAROS: pantallas y alertas

La navegación, el encabezado, los filtros y las tarjetas se adaptan a celulares, tablets y computadoras. La navegación inferior se usa hasta 1023 px y respeta el área segura del dispositivo. Los formularios y ventanas se pueden desplazar dentro de la altura disponible, también en horizontal; los campos móviles tienen texto de 16 px para evitar el zoom automático de iPhone al escribir.

## Activar las alertas

1. Iniciar sesión con una cuenta personal. FAROS pregunta si se desean recibir alertas; **Ahora no** recuerda la elección en ese navegador.
2. Elegir **Activar alertas** y aceptar el permiso del navegador. No se pide permiso automáticamente al entrar ni durante el registro.
3. FAROS envía un aviso de prueba al dispositivo. Desde **Mi cartera** o **Calendario** se puede repetir la prueba o desactivar las alertas. La desactivación se aplica a la cuenta; cerrar sesión desconecta solamente ese dispositivo.

En **iPhone/iPad con iOS/iPadOS 16.4 o posterior**, abrir FAROS, elegir **Compartir → Agregar a pantalla de inicio**, abrirlo desde ese ícono, iniciar sesión y activar las alertas. Safari en una pestaña normal no admite este tipo de alertas. Android y los navegadores de escritorio compatibles pueden activarlas directamente. Se requiere HTTPS (localhost se permite para las pruebas).

Las alertas usan Web Push y pueden recibirse con la página cerrada, siempre que el navegador y el sistema permitan notificaciones en segundo plano. El modo de concentración, los permisos o el ahorro de energía del dispositivo pueden demorar u ocultar un aviso. FAROS distingue el permiso bloqueado, navegador incompatible, instalación pendiente y fallo de envío; no informa que un aviso llegó al teléfono solo porque el proveedor aceptó el envío.

## Qué se envía y cuándo

- Noticias confirmadas por el servidor que afecten activos de la cartera y respeten sus filtros de relevancia e impacto. Se deduplican por la URL de la fuente, aunque cambie el identificador del feed.
- Recordatorios elegidos por el usuario en sus eventos del calendario. Se guardan en PostgreSQL por cuenta y se sincronizan entre dispositivos. Si hay eventos antiguos guardados sin propietario en el navegador, su importación a la cuenta es explícita.
- El aviso de prueba solicitado al activar las alertas o desde el botón de prueba.

Con FAROS cerrado, dos tareas diarias revisan noticias y recordatorios a partir de las **09:00 y 17:00 de Buenos Aires** (12:00 y 20:00 UTC). Vercel Hobby puede ejecutar la tarea dentro de la hora programada. No se promete monitoreo continuo ni entrega al minuto. Mientras se usa la plataforma, las actualizaciones del feed y de las alertas también procesan novedades y pendientes. Los recordatorios del mismo día pueden aparecer antes al consultar FAROS.

La campana muestra avisos reales de la cuenta, con lectura persistente y hasta 50 avisos recientes. Una bandeja vacía no certifica ausencia de riesgos. Las noticias de ejemplo utilizadas en las pruebas no se insertan en esta bandeja.

## Despliegue y datos

`npm run vercel-build` aplica automáticamente `migrations/005_push_notifications.sql`, junto con las migraciones anteriores. Es una migración aditiva: no reinicia cuentas, contraseñas, códigos de recuperación ni carteras. Las cuentas nuevas tienen las alertas desactivadas hasta aceptar su activación.

Las claves VAPID se generan una vez y se guardan en PostgreSQL para compartirlas entre instancias. El cliente autenticado recibe solamente la clave pública. No hacen falta Brevo, SMTP, correos de verificación ni nuevas claves manuales. No borrar `faros_push_credentials` durante un despliegue: cambiar esa clave exige volver a suscribir los dispositivos.

Se mantienen hasta cinco dispositivos por cuenta, una bandeja privada y una cola por dispositivo. Los envíos se cifran con el protocolo Web Push. Se limita el alta y la prueba manual, se agrupan novedades para evitar una ráfaga, se reintentan fallos transitorios y se eliminan las suscripciones vencidas (404/410). Los avisos pendientes vencen tras 24 horas; la bandeja se conserva hasta 30 días. El worker no guarda respuestas API ni páginas de cuentas y descarta los avisos de otro usuario; al cerrar sesión retira los avisos visibles. Las notas personales de los eventos no se incluyen en el aviso de la pantalla bloqueada.

El scheduler solo procesa franjas ya vencidas según la hora del servidor. Un bloqueo persistente evita ejecuciones concurrentes y permite como máximo tres intentos por franja. Su endpoint no acepta destinatarios, contenido ni fechas del cliente. Opcionalmente se puede configurar **`CRON_SECRET`** en Vercel para exigir el encabezado Bearer que Vercel envía automáticamente; sin esa variable el endpoint permite solicitar únicamente el mismo trabajo acotado e idempotente ya programado. No exponer la variable con un prefijo `VITE_`.

## Verificación reproducible

```sh
npm run lint
npm run build
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/faros_test npm test
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
```

La base de pruebas debe ser descartable, local y contener `test` en su nombre; cada suite crea y elimina su propio esquema. La suite API utiliza JavaScript compilado con Node y dos instancias, y comprueba consentimiento, aislamiento, calendario, tareas con la app cerrada, cifrado real del SDK, deduplicación, permisos, reintentos y eliminación. El transporte push se sustituye solamente en el proceso de pruebas: no se envían avisos a dispositivos reales.

La suite Chromium intercepta las APIs y bloquea solicitudes externas. Revisa Noticias, Calendario y Mi cartera a 320, 360, 390, 430, 768, 820, 1024 y 1440 px, formularios en pantallas cortas, consentimiento por clic, rechazo, instalación en iPhone, prueba y desactivación. Además ejecuta el worker real y la API nativa de notificaciones con la página cerrada, inyectando un evento push local; comprueba el aislamiento de cuentas y la limpieza al desconectar. Las capturas quedan en `/tmp/faros-browser-checks` o `BROWSER_ARTIFACTS`.

Estas comprobaciones no sustituyen la prueba final en un teléfono con permisos reales ni confirman el estado Ready de Vercel. El despliegue debe terminar antes de probar; después hay que activar el dispositivo desde FAROS y usar **Enviar aviso de prueba**.

Resultado local: **56 pruebas API y regresión aprobadas**, **8 comprobaciones de navegador aprobadas**, TypeScript y compilación correctos. Vite conserva la advertencia no bloqueante sobre el tamaño del bundle.
