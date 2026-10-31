# Recuperación de contraseña con código

El registro crea una cuenta activa y una sesión con correo y contraseña. No envía confirmaciones ni depende del proveedor de correo. Las cuentas que hubieran quedado pendientes también pueden acceder con su contraseña; no se las marca como verificadas ni se modifica su cartera.

El correo se utiliza únicamente para **Olvidaste tu contraseña**. FAROS puede enviarlo por Brevo o Resend. El nombre visible del remitente es FAROS y su dirección debe estar autorizada por el proveedor.

## Configuración en Vercel

1. En Brevo, validar el remitente y crear una clave **API v3**, no una clave SMTP. Completar los requisitos de activación transaccional del proveedor.
2. Abrir el **proyecto que tiene el dominio faros-dnn.vercel.app → Settings → Environment Variables**. Las variables deben pertenecer al proyecto o estar expresamente vinculadas desde Shared; guardarlas solo en el equipo no las incorpora a la aplicación.
3. Configurar para **Production**:

   | Variable | Valor |
   | --- | --- |
   | `BREVO_API_KEY` | Clave API del proveedor |
   | `EMAIL_FROM` | Dirección remitente autorizada, sin nombre ni `< >` |
   | `APP_URL` | `https://faros-dnn.vercel.app`, origen de la aplicación |

4. Redesplegar **Production** y esperar Ready. Las migraciones se aplican durante el build. No hace falta ejecutar SQL manualmente.
5. Probar la recuperación con el correo exacto de una cuenta propia que pueda iniciar sesión. Revisar entrada y spam, ingresar el código junto con una nueva contraseña y comprobar el acceso.

Como alternativa, usar `RESEND_API_KEY` con un remitente autorizado por Resend. Si se configuraron ambas claves, seleccionar `EMAIL_PROVIDER=brevo` o `EMAIL_PROVIDER=resend`; con una sola, se detecta el proveedor. Las claves se ingresan directamente en Vercel, no en el chat ni Git, y no llevan prefijo `VITE_`.

El envío de códigos no necesita enlaces ni usa el Host enviado por un cliente. `APP_URL` conserva su función como origen de la aplicación. La configuración de correo ausente o incompleta impide solicitar códigos, pero no bloquea el registro ni el acceso con contraseña.

## Flujo

- Solicitar el código desde **Iniciar sesión → Olvidaste tu contraseña**.
- Si la cuenta existe, FAROS solicita al proveedor el envío de un **código de seis dígitos**. La respuesta pública es igual para correos registrados e inexistentes.
- Ingresar el código, la nueva contraseña y su repetición. Se verifica el código y se cambia la contraseña en la misma operación.
- El código vence en **10 minutos**, admite **cinco intentos** y se usa una sola vez. El reenvío reemplaza el anterior y se puede solicitar después de un minuto.
- La opción **Ya tengo un código** permite retomar el formulario con el correo registrado, incluso desde otra pestaña.
- Cambiar la contraseña cierra todas las sesiones anteriores y permite entrar con la nueva clave. Conserva cartera, perfil y preferencias.

## Seguridad y compatibilidad

Los códigos se generan con `crypto.randomInt`, incluyendo los ceros iniciales, y solo se guardan sus hashes bcrypt. No aparecen en las respuestas de la API, URLs ni registros. Los intentos y límites se guardan en PostgreSQL y se comparten entre instancias: una solicitud por dirección y minuto, y hasta veinte por IP cada quince minutos.

La cuenta se bloquea en la transacción antes de bloquear la fila de recuperación. Los intentos incorrectos se confirman en la base, incluso cuando la API responde un error. El consumo del código, la actualización de contraseña y la revocación de sesiones son atómicos. Dos instancias no pueden consumir el mismo código.

La migración `003_password_reset_codes.sql` agrega la tabla de códigos, sin modificar cuentas ni sesiones. Las migraciones históricas se conservan. Las rutas, pantallas y bloqueos de confirmación inicial se retiraron; los enlaces antiguos ya no cambian contraseñas. La recuperación tampoco vuelve a introducir flags de verificación de correo.

## Diagnóstico de entrega

Una respuesta exitosa de la recuperación indica una solicitud procesada. Para una cuenta existente se exige que el proveedor devuelva un comprobante de aceptación; esa aceptación todavía no garantiza la entrega al buzón. Si el proveedor rechaza la solicitud o no devuelve un comprobante válido, FAROS informa el fallo y descarta ese código.

En **Vercel → proyecto faros-dnn → Logs**, filtrar por `[PASSWORD RECOVERY]`:

- `provider=brevo status=accepted`: Brevo aceptó la solicitud. Revisar el destinatario, la fecha y el estado en los registros transaccionales de esa misma cuenta de Brevo.
- `status=account_not_found`: el correo solicitado no corresponde a una cuenta actual; no se pidió ningún envío. Usar el correo exacto con el que se inicia sesión.
- `status=http_401` o `status=http_403`: revisar clave API, permisos y activación de la cuenta del proveedor.
- Otros `status=http_...`: el proveedor rechazó la solicitud; revisar su estado y configuración del remitente.
- `status=transport_error` o `status=invalid_receipt`: falló la conexión o el proveedor no devolvió un comprobante válido.

Estos registros solo incluyen estados controlados y el proveedor. No incluyen destinatarios, contraseñas, códigos, claves ni cuerpos de respuesta. Ante cero registros en Brevo, comprobar el rango de fechas, la cuenta de Brevo y este registro de Vercel antes de cambiar configuraciones.

## Validación

Las pruebas usan PostgreSQL local en esquemas descartables, dos instancias del JavaScript compilado y un receptor local que simula las APIs oficiales de Brevo y Resend. Solo aceptan destinatarios `.test` y no envían mensajes a personas reales. Comprueban registro directo, acceso de cuentas antes pendientes, envío y hashes de códigos, reenvío, vencimiento, intentos persistentes, concurrencia, revocación de sesiones, conservación de datos, fallos del proveedor y compatibilidad con el resto de la API.

La entrega real requiere las credenciales del proyecto de Vercel y debe comprobarse con el proveedor y el buzón. El feed, calendario, audio y cartera mantienen su funcionamiento. Los botones de Google y Microsoft siguen retirados.

Resultado local: **39 pruebas aprobadas, 0 fallidas, 0 omitidas**, incluyendo migración y build de producción, ejecución nativa de la API y regresiones de acceso y persistencia. TypeScript y el renderizado de los formularios también pasaron. Esto no sustituye la comprobación de entrega en un buzón real.
