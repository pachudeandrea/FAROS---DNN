# Recuperación de cuenta con código de 4 dígitos

FAROS pide un **código de recuperación de exactamente 4 dígitos** al crear una cuenta con correo y contraseña. El usuario lo elige y lo repite, y conserva ese código para restablecer su contraseña en el futuro. La cuenta queda activa al registrarse. Este flujo no envía correos ni necesita Brevo, Resend o claves de un proveedor.

## Registro y recuperación

- La contraseña de acceso mantiene sus requisitos actuales.
- Los códigos nuevos aceptan exactamente cuatro dígitos ASCII. Se tratan como texto para conservar ceros iniciales, por ejemplo `0042`. Se rechazan letras, otras longitudes y valores JSON numéricos. Se guarda únicamente su hash bcrypt, nunca el texto original.
- La pantalla recuerda guardar el código. No se incluye en los borradores de registro ni se almacena en localStorage.
- En **Iniciar sesión → Olvidaste tu contraseña**, se ingresan el correo registrado, el código de recuperación y la nueva contraseña repetida.
- La comprobación del código y el cambio de contraseña ocurren en una transacción. Un cambio exitoso revoca todas las sesiones anteriores y permite ingresar con la nueva contraseña.
- El código sigue siendo válido hasta que su dueño lo cambie. La contraseña de acceso conserva sus requisitos actuales.

## Cuentas ya existentes

Las cuentas anteriores mantienen su acceso y sus datos. No se les inventa ni asigna automáticamente un código de recuperación.

Con una sesión iniciada, ir a **Mi Cartera → Cuenta y Privacidad → Recuperación de cuenta → Crear código de recuperación**. Se necesita la contraseña actual y se ingresa dos veces el nuevo código. Desde el mismo lugar se puede reemplazar un código existente; el anterior deja de servir al completarse el cambio.

La interfaz solo informa si la recuperación está configurada (`hasRecoveryKey`). No puede mostrar ni recuperar el código anterior. Si una cuenta todavía no tiene código, debe configurarlo mientras su dueño pueda acreditar el acceso con su contraseña actual. Conocer únicamente el correo no permite crear un código ni cambiar la contraseña.

## Compatibilidad de claves anteriores

Las claves largas elegidas antes de este cambio no se convierten ni se borran. En Olvidaste tu contraseña se pueden usar desde **Usar una clave de recuperación anterior**. Una vez recuperado el acceso, el usuario puede reemplazarlas por un código de cuatro dígitos desde Cuenta y Privacidad. El registro y la configuración de credenciales nuevas siempre exigen cuatro dígitos; la excepción de claves anteriores solo sirve para comprobar una recuperación existente.

## API y seguridad

- `POST /api/auth/register` recibe `recoveryKey` para el alta por correo. Valida que sean cuatro dígitos antes de crear la cuenta y la primera sesión.
- `POST /api/auth/reset-password` recibe `{ email, recoveryKey, newPassword }`. No requiere una sesión previa, pero sí un código correcto.
- `PUT /api/auth/recovery-key` recibe `{ currentPassword, recoveryKey }`. Requiere sesión y comprueba la contraseña actual bajo bloqueo de la cuenta. La identidad se toma de la sesión, ignorando un userId o correo enviado por el cliente.
- Los hashes de contraseña y recuperación nunca salen en las respuestas de usuario. Las actualizaciones de perfil y cartera no pueden cambiar esos hashes ni falsificar el indicador de configuración.
- Una dirección inexistente, un código incorrecto y una cuenta sin recuperación configurada devuelven el mismo error de credenciales. No se revelan públicamente el estado de la cuenta ni la existencia de un código.
- Los límites se guardan en PostgreSQL: hasta **cinco intentos por cuenta cada 15 minutos** y **veinte por IP** en ese período. Cuentan también las direcciones inexistentes y se comparten entre instancias y reinicios. Configurar o cambiar un código tiene su propio límite por cuenta y también requiere la contraseña actual.
- El límite se confirma antes de comprobar credenciales y persiste cuando estas son incorrectas. Una recuperación limitada no bloquea el acceso normal con contraseña.
- Las operaciones bloquean primero la cuenta, en el mismo orden que inicio de sesión y eliminación. Se conservan cartera, preferencias y demás campos mediante actualización JSONB parcial. Los enlaces y códigos de correo de versiones anteriores ya no recuperan cuentas.

## Despliegue

La migración `004_recovery_key_limits.sql` agrega la tabla de límites sin modificar cuentas ni sesiones existentes. Los códigos elegidos se guardan en los datos de cada cuenta al registrarse o configurarlos. El ejecutor de migraciones sigue siendo repetible y corre automáticamente en el build de Vercel.

Se necesita la conexión PostgreSQL del proyecto (`DATABASE_URL` o su alternativa configurada). No hay nuevas variables secretas ni configuración externa de correo. Las variables de Brevo que pudieran seguir guardadas no intervienen en este flujo. Las migraciones históricas se conservan para compatibilidad.

## Validación

Las pruebas usan PostgreSQL local descartable y dos instancias de la API compilada que se ejecutan con Node nativo. Verifican: formato de cuatro dígitos en el registro y configuración, conservación de ceros iniciales, hashes y respuestas sin secretos, recuperación sin correo, revocación de sesiones, reutilización y rotación del código, compatibilidad de claves anteriores, configuración para cuentas anteriores, autenticación del dueño, límites persistentes y concurrentes, protección frente a inyección de campos y conservación de cartera y preferencias. No escriben en producción ni envían mensajes.

También se ejecuta el flujo de build de Vercel y las pruebas existentes de acceso, persistencia y API. Las funciones de noticias, calendario, audio y cartera conservan su funcionamiento.

Resultado validado: **40 pruebas aprobadas, 0 fallidas y 0 omitidas**, incluyendo ceros iniciales, rechazo de formatos inválidos, compatibilidad de claves anteriores, migración y build de producción. El renderizado comprueba los campos numéricos de cuatro dígitos en registro y recuperación.
