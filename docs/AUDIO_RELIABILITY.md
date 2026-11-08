# Audio de noticias y resumen diario

La voz preferida es `es-AR-TomasNeural` (Tomás, español de Argentina). Si falla la primera voz, el servidor intenta `es-AR-ElenaNeural` y devuelve la identidad de la voz que realmente produjo el audio. La interfaz muestra ese nombre, sin afirmar que se está usando un motor local inexistente. El servicio Read Aloud utilizado por la dependencia existente no requiere que el usuario cree una cuenta ni cargue claves. Es un servicio externo: su disponibilidad no es una garantía de FAROS.

## Reproducción

- El texto se divide conservando todas las palabras y su orden. El primer segmento es breve y el siguiente se prepara mientras se reproduce.
- Cada petición termina con el segmento completo en base64. No se responde con un archivo de `/tmp` que otra instancia de Vercel quizá no tenga, ni se deja un trabajo de síntesis completo en segundo plano después de responder.
- La continuación empieza en el segundo cero del siguiente segmento. Se eliminó el salto por una duración estimada que podía repetir o saltear palabras.
- Un solo elemento reproduce audio; otro puede medir metadatos sin reproducir. Duración y saltos usan el prefijo con duración real medida, y la duración total estimada se marca como aproximada mientras falta medir el resto.
- La caché distingue texto, versión y voz, incluso si el ID de la noticia/resumen no cambia. Tiene límites de tamaño y cantidad. Las peticiones duplicadas comparten trabajo y la cancelación de un oyente no cancela a los demás.
- Cierre, cambio de pista, pausa durante preparación y respuestas tardías tienen controles de generación y cancelación. Una respuesta vieja no puede volver a iniciar otra pista.
- El servidor tiene un plazo total de 12,5 segundos por petición; el cliente corta a los 16 segundos. Los bloqueos de reproducción tienen un plazo propio. Los errores ofrecen reintento y transcripción, sin un indicador de carga indefinido.

El resumen hablado usa frases más breves y posiciones compradas/vendidas. Conserva fuentes, límites de la información y advertencias sobre hechos en análisis; no recita las etiquetas de verificación en cada noticia ni agrega recomendaciones o hechos de relleno.

## Verificación

`tests/audioController.test.ts` cubre carreras entre pistas, cancelación, mismo ID con texto distinto, rechazo de reproducción, tiempos de espera, reintento, segmentos, caché y duraciones reales mediante transportes controlados. `tests/ttsEngine.test.ts` comprueba el servicio, su plazo absoluto, caché, concurrencia y voces. Las pruebas de navegador reproducen una señal WAV de prueba decodificable y comprueban avance, pausa, reanudación, reintento y cierre. Esa señal no sustituye una escucha de la voz argentina real.

Referencia del catálogo de voces: https://learn.microsoft.com/azure/ai-services/speech-service/language-support?tabs=tts#supported-languages . El paquete instalado documenta el mecanismo Read Aloud y su catálogo en `speech.platform.bing.com`.

La política activa de este entorno rechazó el acceso al proveedor con CONNECT 403. Los dominios de voz y publicaciones quedaron añadidos al borrador de configuración para aplicar desde el entorno. Por eso no se afirma haber escuchado Tomás en vivo, medido su latencia de red real ni verificado el despliegue de producción. Las pruebas locales comprueban el código y las condiciones de fallo con datos de prueba explícitos.

## Voz estable durante la reproducción

Se corrigieron dos causas de cambios inesperados: cada segmento volvía a solicitar Tomás aunque el primero hubiera elegido Elena, y el servidor guardaba audio de Elena bajo la clave solicitada de Tomás durante treinta minutos.

Ahora el primer segmento define la voz real del audio completo. La continuación, preparación anticipada y reintento la solicitan expresamente con `allowVoiceFallback:false`; una respuesta con otra voz se rechaza antes de reproducirse. Una pista nueva puede volver a intentar la voz preferida. Los trabajos estrictos y los que admiten alternativa permanecen separados, y la caché se guarda bajo la voz que efectivamente generó los bytes. Solo el primer segmento admite elegir una alternativa; si la voz fijada no está disponible se ofrece reintentar, evitando cambios de narrador dentro de una síntesis.

El reproductor muestra la voz real también en celular. Se retiró el aviso persistente de reemplazo de voz mientras el audio funciona. La versión `argentina-v3-fixed-voice` renueva solo las cachés de audio.

La comprobación pública previa al despliegue de esta corrección obtuvo audio MP3 tanto de Tomás como de Elena (aproximadamente 2,2 y 2,4 segundos respectivamente para una frase sintética); no prueba disponibilidad permanente ni reproduce el fallo transitorio del usuario. Las regresiones locales simulan ese fallo y verifican la continuidad del narrador entre segmentos, separación de caché, cancelaciones y controles.

Validación conjunta completada: `npm run lint`, 230 pruebas unitarias/de integración aprobadas con PostgreSQL local y cero omitidas, y las 42 comprobaciones completas de navegador. Incluye reproducción de una señal WAV real en dos fragmentos consecutivos con Elena, caché separada por voz, rechazo de un cambio inesperado, reintento, pausa, velocidad, saltos y cierre.
