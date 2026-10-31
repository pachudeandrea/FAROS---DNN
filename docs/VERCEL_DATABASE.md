# FAROS: registro, PostgreSQL y Vercel

## Cambios y diagnóstico

La revisión del código encontró escrituras que ocultaban los errores de PostgreSQL y guardaban cuentas/sesiones en JSON o memoria. Al cambiar de instancia de Vercel esos datos podían desaparecer o quedar desactualizados. Además, la entrada API reemplazaba la URL pública por encabezados internos de enrutamiento, y Express 4 no reenviaba los rechazos de controladores asíncronos al manejador de errores.

Ahora `/api/*` se dirige a `api/index.ts`, que exporta Express conservando la ruta original. `server.ts` inicia Express/Vite solamente al ejecutarlo directamente en local. Las páginas y los archivos de `dist` siguen siendo frontend; las rutas API inexistentes devuelven 404 JSON.

Cuentas, hashes bcrypt, sesiones y carteras se leen y escriben exclusivamente en PostgreSQL. No hay seed de `data/users_db.json`, respaldo de cuentas en archivos efímeros ni cachés de identidad/sesión. El alta y su primera sesión se confirman en una transacción. Los emails tienen unicidad sin distinguir mayúsculas. Los nuevos tokens de sesión se guardan hasheados; las sesiones anteriores conservan compatibilidad hasta vencer/cerrarse. Cada instancia consulta la vigencia de la sesión en PostgreSQL.

La importación no crea carpetas ni conecta a la base. La ausencia de credenciales no derriba toda la API. Si falla la persistencia, el endpoint devuelve un error y no informa éxito. El cliente distingue validación, API inexistente, respuesta no JSON, base sin configurar, indisponibilidad y transporte. Ya no autentica mediante contraseñas/cuentas guardadas en el navegador. Cartera, preferencias, logout y eliminación se confirman después de la respuesta correcta del servidor.

El diseño y los estilos se conservaron. OAuth verifica estado/PKCE persistido y vinculado al navegador, consulta la identidad al proveedor y entrega tickets de registro de un solo uso. Enviar email, `googleSub` o `microsoftOid` desde el formulario no autentica a nadie. No se vinculan cuentas existentes automáticamente por coincidencia de correo. Los mensajes del popup verifican origen y ventana.

## Arranque de la función: FUNCTION_INVOCATION_FAILED

Se reprodujo con el empaquetador oficial `@vercel/node` 29.0.0 un fallo anterior a Express: los imports relativos sin extensión, válidos bajo `tsx` y el resolver de Vite, quedaban sin extensión en el JavaScript emitido. Node 24 rechazaba la entrada con `ERR_MODULE_NOT_FOUND` al intentar cargar `src/server/app`. Por eso un despliegue podía figurar Ready y fallar al invocar cualquier ruta API.

La entrada y todos los módulos que importa el backend ahora usan rutas ESM explícitas `.js`, incluyendo `types/index.js` para imports de directorio. Los archivos fuente siguen siendo TypeScript. `tsconfig.server.json` comprueba ese grafo con `NodeNext` y forma parte de `npm run lint`, para detectar rutas que funcionen en el cargador local pero fallen en Node.

Las pruebas de autenticación ahora compilan ese backend a JavaScript y lo arrancan con Node sin `tsx` ni otro cargador de TypeScript. Además se generó la función con el empaquetador oficial: antes de la corrección fallaba su importación; después importó y respondió por HTTP con JSON (401 para sesión anónima, 400 para registro inválido y 503 controlado sin conexión configurada). También se conectó ese artefacto oficial a un esquema PostgreSQL descartable: salud 200, registro 201 y recuperación de sesión 200. Esa reproducción local no sustituye comprobar `/api/health` en el nuevo despliegue real.

## Variables de Vercel

| Variable | Configuración |
| --- | --- |
| `DATABASE_URL` **o** `POSTGRES_URL` | Conexión real a `neondb`. Reutilizar la variable de la integración Neon y habilitarla en el entorno correcto (Production/Preview). No hacen falta ambas. Se conservan también los fallbacks `POSTGRES_PRISMA_URL` y `POSTGRES_URL_NON_POOLING`. |
| `APP_URL` | Origen del despliegue: `https://faros-dnn.vercel.app`, sin barra final. Los Preview con OAuth necesitan su propio origen/URI autorizada. |
| `GEMINI_API_KEY` | Análisis Gemini, independiente de autenticación. Conservar la configuración existente si ya se inyecta. |
| `ADMIN_EMAILS` | Opcional: correos autorizados para el panel tras autenticar la cuenta. No hay administradores predeterminados. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Opcionales; ambos necesarios para OAuth Google. URI: `APP_URL/api/auth/google/callback`. |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Opcionales; ambos necesarios para OAuth Microsoft. URI: `APP_URL/api/auth/microsoft/callback`. |
| `PGSSLROOTCERT` | Solo para CA privada: ruta a un certificado disponible en el runtime. Neon no debería necesitarlo. |

No usar prefijos `VITE_` para secretos. `SESSION_SECRET` no es necesario: se usan tokens aleatorios de 256 bits, PostgreSQL y cookie HttpOnly/Secure/SameSite=Lax en producción. TLS remoto verifica el certificado incluso si la URL contiene `sslmode=require`; no se desactiva su verificación. Solo las conexiones de pruebas a loopback pueden usar PostgreSQL sin TLS.

## Migración no destructiva

Con dependencias instaladas (`npm ci`) y la conexión de la base elegida configurada de forma segura en el proceso o en `.env` ignorado:

```sh
npm run db:migrate
```

Ejecuta `migrations/001_auth_persistence.sql` en una transacción con bloqueo de migración. Es repetible: crea tablas/índices que falten y preserva filas/tablas existentes. Añade almacenamiento de estados/tickets OAuth. No borra ni reinicializa la base ni crea usuarios. Los requests no ejecutan DDL. La compilación local (`npm run build`) tampoco; el comando de despliegue de Vercel sí ejecuta esta migración antes de verificar tipos y compilar.

El rol de migración necesita permisos de creación de tablas/índices. Si existen emails que difieren solo en mayúsculas o identidades OAuth duplicadas, falla el índice único y se revierte la migración completa: revisar los registros antes de reintentar. No hay deduplicación destructiva automática. Aplicar primero sobre una rama/base de pruebas al preparar cambios de producción.

Las cuentas que existían únicamente en JSON o en un navegador no se importan automáticamente a producción. Las filas ya presentes en PostgreSQL se conservan. Una importación de cuentas antiguas debe prepararse aparte y revisarse; no seedear las cuentas de ejemplo del repositorio.

## Compilación y despliegue

`vercel.json` fija framework Vite, instalación reproducible con `npm ci --include=dev --no-audit --no-fund`, salida `dist` y la función `/api/index`. `package.json` requiere Node.js 24. El comando de despliegue es `npm run vercel-build`:

```sh
npm run db:migrate && npm run lint && npm run build
```

Cada despliegue prepara las tablas con las variables de Neon que Vercel ya inyecta, sin usar el SQL Editor. El siguiente paso solo se ejecuta si el anterior termina correctamente. Si falla conexión, permisos, TLS o integridad de datos, el build termina con error y no publica una nueva versión. Los cambios de esquema ya confirmados son aditivos y compatibles con el código anterior; no se borran aunque falle una compilación posterior. No configurar otra regla que envíe `/api/*` a `index.html`.

1. Configurar/reutilizar la conexión Neon en el entorno correcto.
2. Subir los cambios a la rama de producción del repositorio conectado a Vercel. La integración Git debe estar habilitada para disparar el despliegue automáticamente.
3. Vercel ejecuta la migración, comprueba tipos y compila. El entorno Production debe tener su conexión configurada; cada Preview que se despliegue también necesita una conexión, preferentemente a una rama de pruebas de Neon. En los registros debe aparecer `[FAROS MIGRATION] Migración aplicada`. Si existe un Build Command sobrescrito en la configuración del proyecto, debe respetar `npm run vercel-build`. Los cambios de variables necesitan un nuevo despliegue. No guardar credenciales en comandos versionados.
4. Consultar `GET /api/health`: se espera 200 JSON con `database: "postgresql"`, sin contenido de tablas ni credenciales.
5. Sin sesión, `GET /api/auth/me` debe devolver 401 JSON con `authenticated:false`. `POST /api/auth/register` con `{}` debe devolver 400 JSON, sin crear cuentas.
6. Probar registros válidos y demás operaciones de escritura en un Preview conectado a una base de pruebas; no crear cuentas de prueba en producción.

Códigos: `DB_NOT_CONFIGURED` (no llegó una variable admitida), `DB_CONFIGURATION_INVALID`, `DB_SCHEMA_MISSING` (migración pendiente), `DB_AUTH_FAILED` (credenciales/rol), `DB_PERMISSION_DENIED` (permisos) y `DB_UNAVAILABLE` (conexión, TLS o servicio). El script de migración registra además el código técnico seguro, como `ECONNREFUSED` o el SQLSTATE, sin imprimir la conexión ni parámetros. No se exponen errores internos ni parámetros SQL. Si se recibe HTML/404 de Vercel, revisar la función y sus rutas antes de atribuirlo a la conexión del usuario.

Localmente: configurar PostgreSQL, ejecutar `npm run db:migrate` y luego `npm run dev`. Gemini no es necesario para el registro. Después de compilar, `NODE_ENV=production npm start` sirve `dist` con Express local. El puerto predeterminado es 3000 y admite `PORT`.

## Pruebas aisladas

Las pruebas de escritura requieren `TEST_DATABASE_URL` con hostname de loopback y nombre de base que contenga `test`. Nunca usan `DATABASE_URL` como alternativa. Crean un esquema aleatorio, arrancan dos procesos con la entrada API real, reinician uno y eliminan únicamente su esquema al terminar.

PostgreSQL descartable, publicado solo en loopback:

```sh
docker run --name faros-auth-test --rm -d \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=faros_test \
  -p 127.0.0.1:55432:5432 postgres:17-bookworm
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/faros_test npm test
docker stop faros-auth-test
```

La configuración sin contraseña es exclusiva de esa base local descartable; no usarla para un servidor compartido o público. Si una base de pruebas necesita contraseña, suministrarla mediante configuración segura.

Se verifican TypeScript (`npm run lint`), compilación (`npm run build`) y pruebas funcionales (`npm test`). Las instancias API de la suite ejecutan JavaScript compilado en Node sin cargador de TypeScript. La suite cubre registro, duplicados/carrera concurrente, validación, hashes, cookies, login, sesión entre instancias y reinicios, cartera/preferencias, autorización, logout, eliminación/revocación, tickets OAuth, migración repetida y clasificación de errores. Las pruebas controladas de OAuth verifican el protocolo interno, no una autenticación real contra Google/Microsoft.

Resultado en este entorno: **18 pruebas aprobadas, 0 fallidas y 0 omitidas**, sobre PostgreSQL 17. También se comprobó el rollback del registro al fallar la primera sesión y el error 503 con una base inaccesible. TypeScript y compilación aprobaron; Vite mantiene una advertencia no bloqueante por tamaño del bundle. En desarrollo y con `dist` se verificaron `/`, `/admin`, `/cartera`, los recursos JS/CSS y las respuestas JSON del registro inválido y de sesión anónima. El calendario respondió sin credenciales de Gemini. Se ejecutó el comando real configurado en `vercel.json` sobre una base vacía mediante `POSTGRES_URL`, luego se repitió con cuentas/sesiones existentes comprobando que no cambiaran. Se verificó también que la ausencia de base o una conexión fallida detienen el build antes de Vite y no imprimen credenciales.

## Integraciones y pendientes externos

Gemini se instancia al usarlo y su clave no bloquea el registro. Noticias mantiene su búsqueda y alternativa RSS; no se añadieron noticias ficticias. El calendario mantiene cronogramas ya existentes, incluidas fechas corporativas/macro estáticas: no se verificó en vivo cada anuncio ni se modificaron esas fechas. El caché de audio se crea al usarlo, no al importar autenticación; el fallo de voz permite continuar con texto.

El registro activa la cuenta directamente y pide un código de recuperación de cuatro dígitos elegido por el usuario. La recuperación usa ese código guardado con hash en PostgreSQL y no depende de correos. Las cuentas anteriores conservan su acceso y pueden configurar el código desde Cuenta y Privacidad, con su contraseña actual. Los detalles y pruebas se explican en [ACCOUNT_RECOVERY.md](ACCOUNT_RECOVERY.md).

La publicación Git y la finalización del despliegue son operaciones distintas. El script automático usa las credenciales de Vercel, que no se copian a este entorno. Este entorno no tiene conexión directa a Neon de producción ni credenciales de Vercel; su política de red bloquea la consulta a `faros-dnn.vercel.app` y a la API de GitHub. La validación con PostgreSQL aislado no demuestra que la conexión de producción esté correctamente configurada. Los registros del despliegue y `/api/health` deben confirmar la migración en la base real. No se crean cuentas de prueba en producción. Gemini, RSS, voz y OAuth no se validaron contra servicios externos.

## Archivos modificados o añadidos

- Entrada/rutas: `api/index.ts`, `vercel.json`, `server.ts`, `src/server/app.ts`.
- Base/autenticación: `src/server/database.ts`, `src/server/dbAdapter.ts`, `src/server/auth.ts`, `src/server/adminRoutes.ts`, `migrations/001_auth_persistence.sql`, `scripts/migrate.ts`.
- Cliente: `src/utils/apiClient.ts`, `src/components/SignUpWizard.tsx`, `src/components/LoginForm.tsx`, `src/App.tsx`.
- Imports ESM de módulos compartidos: `src/data/mockData.ts`, `src/data/groundedRealNews.ts` y las utilidades importadas por el backend (sin modificar su contenido editorial).
- Inicio opcional de audio: `src/server/ttsEngine.ts`.
- Configuración/documentación: `tsconfig.server.json`, `package.json`, `package-lock.json` (solo el requisito de Node.js, sin cambiar dependencias), `.env.example`, este documento.
- Pruebas: `tests/apiClient.test.ts`, `tests/auth.integration.test.ts`, `tests/fixtures/native-api-server.mjs`.
