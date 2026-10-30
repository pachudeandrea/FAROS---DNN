# Confirmación de correo y recuperación de contraseña

FAROS admite envío transaccional por Brevo o Resend. Vercel y Neon no envían estos correos por sí mismos. Hace falta una cuenta del proveedor y un remitente que ese proveedor autorice. La confirmación prueba el control del correo; no verifica documentos ni identidad legal.

## Activar en producción

Para este proyecto se recomienda empezar con Brevo:

1. Crear una cuenta en https://www.brevo.com/ y completar los requisitos de activación del servicio.
2. Agregar y validar la dirección remitente que usará FAROS. Usar el remitente/dominio que el proveedor autorice para correos transaccionales; no se puede enviar desde una dirección arbitraria.
3. Crear una clave **API v3** para la aplicación. No usar la contraseña o clave SMTP.
4. En **Vercel → faros-dnn → Settings → Environment Variables**, guardar para **Production**, juntos antes de redesplegar:

   | Variable | Contenido |
   | --- | --- |
   | `BREVO_API_KEY` | Clave API del proveedor, mediante el ingreso seguro de secretos |
   | `EMAIL_FROM` | Dirección remitente autorizada, solo el correo (sin nombre ni `< >`) |
   | `APP_URL` | `https://faros-dnn.vercel.app` |

5. Redesplegar el código actual. La migración adicional se ejecuta automáticamente durante el build; no hace falta usar el SQL Editor de Neon.
6. Probar el envío primero a una cuenta propia y revisar también spam. La aceptación de la API del proveedor no garantiza la llegada a la bandeja principal.

Como alternativa, configurar `RESEND_API_KEY` y `EMAIL_FROM` con un remitente/dominio autorizado por Resend. Si hay claves de ambos proveedores, seleccionar `EMAIL_PROVIDER=brevo` o `EMAIL_PROVIDER=resend`. Con solo una clave, se selecciona ese proveedor automáticamente. El tráfico utiliza los endpoints HTTPS oficiales `api.brevo.com` o `api.resend.com`, con verificación TLS normal.

No pegar claves en el chat ni guardarlas en Git. Estas variables son del servidor en Vercel; no llevan prefijo `VITE_`. La clave de Gemini no es una credencial de correo. No hay credenciales de envío disponibles en el entorno de desarrollo, por lo que la entrega real requiere esta configuración del propietario.

## Comportamiento y compatibilidad

- Sin ninguna variable de envío, se conserva el registro y acceso por correo ya existente. La recuperación informa que no pudo enviar; no simula un envío. La confirmación de nuevas cuentas no se considera activada hasta configurar el proveedor.
- Con configuración completa, cada alta por correo se guarda pendiente y recibe un enlace de confirmación que vence en **24 horas**. No obtiene una sesión hasta confirmar.
- Con configuración parcial o inválida, las nuevas altas devuelven un error de configuración; no se omite silenciosamente la verificación. Configurar todas las variables juntas.
- Las cuentas anteriores conservan su acceso, sesiones, perfil y cartera; no se marcan retroactivamente como verificadas, no se envían correos masivos y no se obliga a volver a registrarlas.
- Se puede reenviar una confirmación desde la pantalla de registro pendiente o al intentar acceder con una cuenta sin confirmar. El nuevo enlace invalida el anterior.
- Si falla el envío después de crear la cuenta pendiente, la pantalla lo informa y permite pedir otro enlace. Esa cuenta sigue sin poder iniciar sesión hasta confirmar o recuperar su contraseña mediante el correo.
- La recuperación responde con el mismo mensaje para correos registrados e inexistentes. El enlace de cambio vence en **30 minutos**, es de un solo uso y solo llega al correo de la cuenta.
- Cambiar la contraseña revoca todas las sesiones y los enlaces pendientes del usuario. Conserva su cartera, preferencias y demás datos. El propietario puede iniciar sesión con la nueva contraseña.

## Seguridad del flujo

Los tokens usan 256 bits de aleatoriedad y solo sus hashes SHA-256 se guardan en PostgreSQL. No se devuelven por la API de registro, recuperación ni reenvío. Los enlaces usan el fragmento de la URL (`#verify-email=...` o `#reset-password=...`), que no se envía al servidor en las solicitudes HTTP ni en el encabezado Referrer. La aplicación limpia el fragmento de la barra de direcciones al abrir el enlace.

Abrir un enlace no consume un token: se requiere pulsar el botón de confirmación o enviar el formulario de contraseña. Los escáneres de correo que hacen GET no activan cuentas ni cambian contraseñas. La consumición y actualización se realizan dentro de una transacción con bloqueo de la cuenta para evitar reutilizaciones concurrentes entre instancias.

Los enlaces usan exclusivamente el origen de `APP_URL`, no el Host enviado por un cliente. El límite de solicitudes se guarda en PostgreSQL y se aplica también a correos inexistentes: un correo por minuto para la misma dirección y finalidad, y hasta 20 por IP cada 15 minutos. Los fallos de entrega no imprimen los enlaces, claves ni errores internos del proveedor.

## Migración y alcance

`migrations/002_email_actions.sql` crea únicamente las tablas de tokens y límites de envío. No modifica filas de cuentas existentes. El ejecutor de migraciones aplica los archivos SQL numerados en orden, en la transacción ya existente, y se puede repetir.

Los cambios se limitan a los flujos de autenticación por correo, sus pantallas nuevas y las pruebas necesarias. El feed, el calendario, audio, cartera y sus pantallas no se modifican. Los botones de Google/Microsoft continúan retirados.

## Comprobaciones

Las pruebas utilizan PostgreSQL local en un esquema descartable, dos instancias del JavaScript de la API compilado en Node y un receptor HTTP local que simula la API del proveedor. Solo aceptan destinatarios terminados en `.test`. No envían mensajes a personas reales ni escriben en producción.

Se comprueban: alta pendiente, ausencia de sesión antes de confirmar, hashes de tokens, reenvío, expiración, un solo uso, carreras entre instancias, recuperación sin exponer tokens, revocación de sesiones, conservación de cartera, fallos del proveedor, configuración parcial, límites de solicitudes y compatibilidad de cuentas anteriores. Esto valida el flujo de la aplicación; la recepción de un correo real debe verificarse al cargar las credenciales y autorizar el remitente.

Resultado validado: **36 pruebas aprobadas, 0 fallidas, 0 omitidas**, además de TypeScript y la compilación Vite del flujo de despliegue. Se generó también el artefacto con el empaquetador oficial de Vercel y se comprobó que arranca y conserva respuestas JSON controladas sin servicio de correo. La entrega a un buzón real continúa pendiente de la configuración del proveedor.

Si el proveedor rechaza un mensaje, Vercel registra solo el nombre del proveedor y su estado HTTP (`[AUTH EMAIL]`), sin direcciones, tokens, claves ni el cuerpo de la respuesta. Revisar allí permisos de la clave y autorización del remitente.
