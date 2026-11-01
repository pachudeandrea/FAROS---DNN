# Identidad Faros

Fuente de referencia: `Faros.pdf`, 14 páginas aportadas por el usuario. Tipografía:
`basis-grotesque-arabic-pro.zip`, aportado posteriormente por el usuario. Este
cambio afecta la presentación; conserva pantallas, textos informativos, handlers,
perfil de inversor, autenticación, recuperación, filtros, datos y navegación.

## Tokens

La fuente de verdad de los valores es [public/brand/tokens.css](../public/brand/tokens.css).
[src/index.css](../src/index.css) conecta esos valores con las utilidades de la
interfaz. Las escalas `brand`, `ink`, `danger`, `warning`, `info` y `accent` son
alias semánticos de los colores del manual; no conservan las paletas anteriores.

| Token de color | Valor | Uso |
| --- | --- | --- |
| `--brand-primary` | `#002C22` | Marca, acciones principales y fondos oscuros |
| `--brand-accent` | `#00D391` | Acento, destacados y foco sobre fondo oscuro |
| `--brand-mint` | `#D9FBEA` | Superficies de marca claras |
| `--brand-paper` | `#FCFCFC` | Fondo y tarjetas claras |
| `--brand-cloud` | `#E6E7E8` | Neutro claro, separadores y texto sobre oscuro |
| `--brand-gray` | `#A3A3A3` | Recursos decorativos neutros |
| `--brand-night` | `#00110D` | Texto principal y fondo profundo |
| `--brand-success` / `--brand-success-soft` | `#006045` / `#E0FCED` | Éxito y noticias favorables |
| `--brand-danger` / `--brand-danger-soft` | `#BC1B1B` / `#FCDEDE` | Error y alertas |
| `--brand-danger-pale` | `#FEF5F5` | Fondo de error suave |
| `--brand-info` / `--brand-info-soft` | `#0B6CCE` / `#E1EFFF` | Información |
| `--brand-warning` / `--brand-warning-soft` | `#C17200` / `#FEF5D2` | Advertencia |
| `--brand-violet` / `--brand-violet-soft` | `#6023B7` / `#EFE1FF` | Acento secundario |
| `--brand-gradient-glow` | `#49E9B5` | Color presente en los degradados originales |
| `--brand-gradient-ink` / `--brand-gradient-deep` | `#02121E` / `#020B1B` | Extremos de los degradados del PDF |

`--content-primary`, `--content-muted`, `--content-accent`, `--content-info`,
`--content-warning` y `--focus-color` asignan los colores accesibles según el fondo.
`--surface-page`, `--surface-card` y `--border-default` nombran superficies y bordes.
`--gradient-brand` y `--gradient-mint` definen las aplicaciones de degradado.

| Grupo | Tokens y valores |
| --- | --- |
| Fuentes | `--font-brand`: Basis Grotesque Arabic Pro + respaldo del sistema; `--font-heading`, `--font-body`, `--font-data`: misma familia oficial |
| Pesos | Light 300, Regular 400, Bold 700; los énfasis anteriores se asignan al Bold disponible |
| Escala | `--type-xs` .75rem; `--type-sm` .875rem; `--type-base` 1rem; `--type-lg` 1.125rem; `--type-xl` 1.25rem; `--type-2xl` 1.5rem; `--type-3xl` 1.875rem; `--type-4xl` 2.25rem; `--type-5xl` 3rem; `--type-6xl` 3.75rem |
| Lectura | `--type-leading`: 1.5; `--type-tracking-heading`: -.025em; datos con `tabular-nums lining-nums` |
| Radios | `--radius-control`: 1rem; `--radius-card`: 1.5rem; `--radius-dialog`: 1.75rem; `--radius-pill`: 9999px |
| Sombras | `--shadow-soft`, `--shadow-card`, `--shadow-overlay`, `--shadow-focus`: composiciones del verde/negro oficiales con transparencia |
| Marcos de ilustración | `--brand-radius-device`: 44px; `--brand-radius-device-screen`: 34px; conservan la proporción del ejemplo de dispositivo existente |
| Movimiento | `--motion-fast`: 150ms; `--motion-standard`: 200ms; se mantiene la reducción de movimiento del sistema |
| Logo | `--logo-clearspace`: 12%; `--logo-symbol-min`: 28px; `--logo-full-min-height`: 48px |

Las medidas de radios, sombras, movimiento, resguardo y tamaños mínimos son
criterios de implementación basados en los ejemplos del PDF. **No son medidas
normativas publicadas por el manual**, que no las especifica. Se conservan la
jerarquía y las posiciones de los componentes existentes.

## Logos: cobertura por pantalla y estado

`BrandLogo` sustituye el antiguo SVG del faro. Sirve el logo completo o el isotipo
extraído con autorización del usuario, en las variantes para fondo claro, oscuro
y gris. Los SVG mantienen los trazados, máscaras, degradados y fondos originales;
no usan `currentColor`, filtros para tintar ni estiramientos. El resguardo indicado
por el token queda incluido en el `viewBox` de los recursos exportados. El fondo de cada
versión es necesario para componer fielmente las máscaras del PDF.

- [x] Header y navegación principal: logo completo para fondo claro.
- [x] Bienvenida: logo completo para fondo oscuro; paleta y tipografía oficiales.
- [x] Login y recuperación: logo completo oscuro en el encabezado compartido.
- [x] Registro: logo completo claro en los dos pasos del wizard.
- [x] Onboarding: logo completo oscuro en los dos pasos, sin cambiar el proceso.
- [x] Confirmación de bienvenida existente: isotipo oficial.
- [x] Inicio: header y footer oficiales; isotipo en el estado vacío.
- [x] Calendario: marca del header y footer compartidos, también con agenda y modales.
- [x] Configuración, perfiles, alertas y cuenta: marca y tema compartidos.
- [x] Administración: variantes claras/oscuras según el control existente.
- [x] Carga inicial y carga diferida: `BrandLogo` / `BrandLoading` compartidos.
- [x] Errores de pantalla y acceso restringido: recursos oficiales.
- [x] Footer: logo completo oscuro.
- [x] Favicon, Apple Touch Icon, íconos PWA de 192/512 y manifest.
- [x] Título de pestaña, `theme-color`, Open Graph y Twitter: nombre e imagen oficiales.
- [x] Ventana HTML de autenticación OAuth: logo y tokens compartidos, sin cambiar postMessage.
- [x] Notificaciones: ícono nuevo y distintivo con la silueta original y transparencia.

El sistema operativo puede representar el badge de push como una silueta
monocroma; esa transformación corresponde al dispositivo, no a una variante de
color inventada. Los PNG de instalación conservan el fondo oscuro original y
reservan espacio alrededor del símbolo para el recorte de la plataforma.

No hay plantillas activas de correo de recuperación: se conserva el código de
cuatro dígitos y no se agrega correo ni verificación. Las menciones de FAROS en
textos, identificadores, APIs y mensajes se conservan; no son el logotipo anterior.
Las dos imágenes antiguas de referencia, sin uso en el código, se retiraron del
contenido público. El archivo `LighthouseLogo.tsx` y su dibujo anterior se eliminaron.

## Accesibilidad y decisiones

Se mantuvieron los colores originales. Se aprobó usar verde oscuro para texto
cuando el color de acento no alcanza AA:

| Combinación del manual | Contraste | Aplicación |
| --- | --- | --- |
| Blanco sobre verde vivo | 1.91:1 | Se usa texto oscuro sobre el acento |
| Verde oscuro sobre verde vivo | 7.75:1 | Combinación accesible para acciones destacadas |
| Gris medio sobre blanco | 2.46:1 | El gris queda para decoración; texto secundario oscuro |
| Naranja sobre crema | 3.38:1 | Advertencia con texto oscuro y acento naranja |
| Azul sobre azul claro | 4.44:1 | Información con texto oscuro y acento azul |
| Rojo sobre rosa claro | 5.03:1 | Error y alertas |
| Verde de éxito sobre verde claro | 7.00:1 | Éxito |

Los logos e ilustraciones originales no se recolorean para cumplir contraste.
Los controles, etiquetas, foco y placeholders usan las combinaciones accesibles.
En etiquetas SHORT sobre naranja fuerte se usa el neutro `#00110D`: el verde
oscuro solo alcanza 4.10:1 sobre ese naranja. El color naranja original se conserva.
Se mantienen los controles táctiles, teclado, zoom y preferencias de movimiento.
Las mediciones automáticas de texto cubren superficies planas; degradados y
composición visual se revisan también en capturas.

Los tres WOFF2 completos se sirven desde `public/fonts` con `font-display: swap`.
Se verificaron 858 caracteres mapeados por peso, caracteres españoles y símbolos
financieros; los tres pesos contienen la función OpenType `tnum`. El ZIP identifica
Colophon Foundry y remite a su licencia, sin incluir un documento de licencia
separado. Se conserva esa información en `public/fonts/README.md`.

Los íconos funcionales existentes se mantienen para no cambiar su significado,
con color y terminaciones coherentes con el manual. No se agregaron fotografías
ni elementos que alteren la estructura o los contenidos de las pantallas.

## Comprobaciones reproducibles

```sh
node scripts/sync-brand-metadata.mjs
npm run lint
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/faros_test npm test
npm run test:browser
```

Ejecutar las suites en secuencia: las pruebas de integración y navegador generan
`dist`. Las pruebas de marca comprueban que no reaparezcan colores literales,
paletas anteriores, fuentes anteriores ni el faro anterior en los componentes.
También verifican que metadatos y manifest coincidan con los tokens.

La comprobación de navegador incluye logos cargados, fuentes realmente descargadas,
contraste, pantallas anónimas y autenticadas, 320/390/768/1024/1440 px, texto ampliado
y pantallas horizontales. El informe y las capturas quedan en
`/tmp/faros-browser-checks/brand-audit.json` y `brand-*.png`.
