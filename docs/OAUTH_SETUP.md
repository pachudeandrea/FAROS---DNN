# Activar Google y Microsoft en FAROS

El aviso «Falta configurar OAuth» indica que no está disponible alguna credencial de la aplicación del proveedor. La clave de Gemini corresponde a otro servicio: no habilita iniciar sesión con Google. No hace falta modificar la base ni el registro por contraseña para configurar estos proveedores.

## Google

1. Abrir [Google Cloud / Google Auth Platform](https://console.cloud.google.com/auth/overview) con la cuenta propietaria del proyecto. Si ya existe un cliente OAuth de FAROS, reutilizarlo y revisar sus URLs.
2. Completar el nombre de la aplicación, correo de soporte y audiencia. Para usuarios ajenos a una organización, la audiencia debe permitir usuarios externos. Mientras la aplicación esté en modo de prueba, agregar las cuentas que se usarán como usuarios de prueba.
3. En **Clients**, crear un cliente OAuth de tipo **Web application**. Un cliente de escritorio, Android o iOS no corresponde al backend Express de FAROS.
4. Configurar el origen JavaScript autorizado:

   ```text
   https://faros-dnn.vercel.app
   ```

5. Configurar exactamente esta URI de redirección autorizada:

   ```text
   https://faros-dnn.vercel.app/api/auth/google/callback
   ```

6. Guardar el ID del cliente y su secreto en las variables **Production** del proyecto `faros-dnn` de Vercel, respectivamente:

   ```text
   GOOGLE_CLIENT_ID
   GOOGLE_CLIENT_SECRET
   ```

La aplicación solicita únicamente `openid email profile`. Para permitir el acceso público, completar el estado de publicación y los requisitos que indique Google Auth Platform. No colocar el secreto en el frontend ni en el chat.

## Microsoft

1. Abrir [Microsoft Entra](https://entra.microsoft.com/) con una cuenta que pueda registrar aplicaciones en su directorio.
2. En **App registrations**, crear o reutilizar la aplicación FAROS.
3. Para admitir cuentas laborales/escolares y personales de Outlook/Hotmail, elegir el tipo que admite **cuentas de cualquier directorio organizativo y cuentas personales de Microsoft**. El código utiliza la autoridad `common`.
4. En la configuración de autenticación, agregar una plataforma de tipo **Web** y esta URI de redirección exacta:

   ```text
   https://faros-dnn.vercel.app/api/auth/microsoft/callback
   ```

5. Usar el **Application (client) ID** para `MICROSOFT_CLIENT_ID`.
6. Crear un secreto de cliente en **Certificates & secrets**. Guardar su **Value**, no su Secret ID, como `MICROSOFT_CLIENT_SECRET` en Vercel. Registrar su vencimiento para renovarlo antes de que expire.
7. Revisar los permisos delegados de Microsoft Graph para `User.Read`; el flujo solicita `openid email profile User.Read`. En organizaciones que requieran aprobación del administrador, completar ese consentimiento.

## Vercel

En el proyecto de la aplicación (`faros-dnn`), las variables del servidor deben ser:

| Nombre | Contenido |
| --- | --- |
| `APP_URL` | `https://faros-dnn.vercel.app` |
| `GOOGLE_CLIENT_ID` | ID del cliente web OAuth de Google |
| `GOOGLE_CLIENT_SECRET` | Secreto del mismo cliente de Google |
| `MICROSOFT_CLIENT_ID` | Application (client) ID de Microsoft |
| `MICROSOFT_CLIENT_SECRET` | Value del secreto de ese registro de Microsoft |

Cargar los secretos mediante la interfaz segura de variables de Vercel. No usar prefijos `VITE_`, no pegarlos en el chat ni guardarlos en Git. Conservar la conexión PostgreSQL y las demás variables existentes. Las credenciales del entorno de Codex son independientes de las que usa la web en Vercel.

Después de guardar las variables, desplegar nuevamente. El despliegue debe quedar Ready. Los Preview con otro dominio requieren configuración y URLs de retorno propias; la guía anterior corresponde al dominio de producción.

## Comprobar

1. Abrir la web en un navegador normal. Pulsar Google o Microsoft debe mostrar la pantalla real del proveedor.
2. Autorizar con una cuenta de pruebas propia. Para una identidad nueva, FAROS debe devolver al registro los datos verificados y pedir los términos y el perfil antes de crear la cuenta.
3. Completar el alta, cerrar sesión y volver a entrar con el mismo proveedor. Debe recuperarse la misma cuenta y cartera.
4. El registro y login por correo deben seguir funcionando.

Las cuentas que ya se crearon con contraseña conservan ese método. No se vinculan automáticamente con otra identidad por enviar el mismo correo: una coincidencia de email genera un mensaje para utilizar el método original. La vinculación segura de una cuenta existente no está incluida en esta activación.

Los estados OAuth, verificadores PKCE y tickets de alta ya se almacenan en PostgreSQL; no hace falta una nueva migración. Los tickets son temporales y de un solo uso, y el navegador no puede afirmar una identidad mediante un `googleSub` o `microsoftOid` inventado.

El inicio de la ventana se realiza durante el clic antes de esperar la API, para evitar el bloqueo de ventanas de Safari. Se comprueban el origen del mensaje, la ventana que lo envía y el proveedor, y se limpian las ventanas/listeners cuando se termina o cancela el flujo.

Las pruebas locales verifican estos comportamientos y mantienen las pruebas de regresión de correo/cartera. No equivalen a una autorización real con Google o Microsoft: esa validación requiere los clientes externos y sus credenciales configuradas.

## Validación de este ajuste

Pasaron 24 pruebas (18 regresiones existentes y 6 casos de la ventana OAuth), TypeScript y compilación Vite. El ajuste de código afecta únicamente a los manejadores OAuth de `LoginForm` y `SignUpWizard` y al nuevo ayudante `src/utils/oauthPopup.ts`; no cambia el backend, migraciones, credenciales de base, registro por correo ni diseño. La advertencia de configuración seguirá apareciendo hasta configurar los clientes reales de los proveedores y redesplegar con esas variables.
