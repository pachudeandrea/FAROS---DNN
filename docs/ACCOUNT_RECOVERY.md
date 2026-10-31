# Recuperación de cuenta con clave personal

FAROS pide una **clave de recuperación** al crear una cuenta con correo y contraseña. El usuario la elige y la repite, y conserva esa clave para restablecer su contraseña en el futuro. La cuenta queda activa al registrarse. Este flujo no envía correos ni necesita Brevo, Resend o claves de un proveedor.

## Registro y recuperación

- La contraseña de acceso mantiene sus requisitos actuales.
- La clave de recuperación debe tener al menos **12 caracteres**, ser distinta de la contraseña y ocupar hasta 72 bytes UTF-8. Puede ser una frase. Se guarda únicamente su hash bcrypt, nunca el texto original.
- La pantalla recuerda guardar la clave. No se incluye en los borradores de registro ni se almacena en localStorage.
- En **Iniciar sesión → Olvidaste tu contraseña**, se ingresan el correo registrado, la clave de recuperación y la nueva contraseña repetida.
- La comprobación de la clave y el cambio de contraseña ocurren en una transacción. Un cambio exitoso revoca todas las sesiones anteriores y permite ingresar con la nueva contraseña.
- La clave de recuperación sigue siendo válida hasta que su dueño la cambie. La nueva contraseña también debe ser distinta de esa clave.

## Cuentas ya existentes

Las cuentas anteriores mantienen su acceso y sus datos. No se les inventa ni asigna automáticamente una clave de recuperación.

Con una sesión iniciada, ir a **Mi Cartera → Cuenta y Privacidad → Recuperación de cuenta → Crear clave de recuperación**. Se necesita la contraseña actual y se ingresa dos veces la nueva clave. Desde el mismo lugar se puede reemplazar una clave existente; la anterior deja de servir al completarse el cambio.

La interfaz solo informa si la clave está configurada (`hasRecoveryKey`). No puede mostrar ni recuperar la clave anterior. Si una cuenta todavía no tiene clave, debe configurarla mientras su dueño pueda acreditar el acceso con su contraseña actual. Conocer únicamente el correo no permite crear una clave ni cambiar la contraseña.

## API y seguridad

- `POST /api/auth/register` recibe `recoveryKey` para el alta por correo. Valida su fortaleza y diferencia con la contraseña antes de crear la cuenta y la primera sesión.
- `POST /api/auth/reset-password` recibe `{ email, recoveryKey, newPassword }`. No requiere una sesión previa, pero sí una clave correcta.
- `PUT /api/auth/recovery-key` recibe `{ currentPassword, recoveryKey }`. Requiere sesión y comprueba la contraseña actual bajo bloqueo de la cuenta. La identidad se toma de la sesión, ignorando un userId o correo enviado por el cliente.
- Los hashes de contraseña y recuperación nunca salen en las respuestas de usuario. Las actualizaciones de perfil y cartera no pueden cambiar esos hashes ni falsificar el indicador de configuración.
- Una dirección inexistente, una clave incorrecta y una cuenta sin clave devuelven el mismo error de credenciales. No se revelan públicamente el estado de la cuenta ni la existencia de una clave.
- Los límites se guardan en PostgreSQL: hasta **cinco intentos por cuenta cada 15 minutos** y **veinte por IP** en ese período. Cuentan también las direcciones inexistentes y se comparten entre instancias y reinicios. Configurar o cambiar una clave tiene su propio límite por cuenta y también requiere la contraseña actual.
- El límite se confirma antes de comprobar credenciales y persiste cuando estas son incorrectas. Una recuperación limitada no bloquea el acceso normal con contraseña.
- Las operaciones bloquean primero la cuenta, en el mismo orden que inicio de sesión y eliminación. Se conservan cartera, preferencias y demás campos mediante actualización JSONB parcial. Los enlaces y códigos de correo de versiones anteriores ya no recuperan cuentas.

## Despliegue

La migración `004_recovery_key_limits.sql` agrega la tabla de límites sin modificar cuentas ni sesiones existentes. Las claves elegidas se guardan en los datos de cada cuenta al registrarse o configurarlas. El ejecutor de migraciones sigue siendo repetible y corre automáticamente en el build de Vercel.

Se necesita la conexión PostgreSQL del proyecto (`DATABASE_URL` o su alternativa configurada). No hay nuevas variables secretas ni configuración externa de correo. Las variables de Brevo que pudieran seguir guardadas no intervienen en este flujo. Las migraciones históricas se conservan para compatibilidad.

## Validación

Las pruebas usan PostgreSQL local descartable y dos instancias de la API compilada que se ejecutan con Node nativo. Verifican: obligatoriedad de la clave en el registro, hashes y respuestas sin secretos, recuperación sin correo, revocación de sesiones, reutilización y rotación de la clave, configuración para cuentas anteriores, autenticación del dueño, límites persistentes y concurrentes, protección frente a inyección de campos y conservación de cartera y preferencias. No escriben en producción ni envían mensajes.

También se ejecuta el flujo de build de Vercel y las pruebas existentes de acceso, persistencia y API. Las funciones de noticias, calendario, audio y cartera conservan su funcionamiento.

Resultado validado: **39 pruebas aprobadas, 0 fallidas y 0 omitidas**, incluyendo migración y build de producción, ejecución nativa de la API, límites entre instancias y regresiones de persistencia. El renderizado de registro, recuperación y configuración de claves también pasó las comprobaciones.
