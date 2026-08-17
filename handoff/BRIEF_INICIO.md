# PROYECTO: Sistema operativo de procuración — brief de arranque para Claude Code

Este documento es el punto de partida. Contiene qué es el proyecto, qué existe
ya (y por qué), y qué falta construir. Está pensado para pegarse como primer
mensaje al arrancar la sesión de Claude Code.

---

## 1. Qué es este producto (resumen)

Un sistema operativo del proceso de procuración de órganos (CUCAIBA, Buenos
Aires), organizado alrededor de un expediente vivo por donante, usado por tres
roles: **Procurador** (en terreno, mobile-first), **Base Operativa**
(coordina múltiples casos), **Equipo de Trasplante** (recibe información
organizada por órgano).

**Principio rector:** cuidar al procurador — reducir su carga cognitiva,
administrativa y emocional — es el criterio de diseño por encima de agregar
funcionalidad. Ver `PROMPT_DISENO.md` (incluido) para el detalle completo de
filosofía de producto, los tres roles, y qué NO construir.

**El problema concreto que resuelve la parte de planillas:** el procurador hoy
completa a mano múltiples formularios oficiales de CUCAIBA, repitiendo los
mismos datos (nombre, DNI, horarios, resultados) una y otra vez. La solución:
un modelo de datos único por donante; cada dato se carga una vez y alimenta
automáticamente todas las planillas oficiales que lo necesiten, generándolas
ya completas en PDF.

## 2. Qué existe ya

### a) Prototipo interactivo (HTML, sin backend)
`procuracion_preview.html` — preview navegable con los 3 roles, casos demo,
timeline, solicitudes, panel de órganos, captura simulada por voz/foto. Sirve
como referencia de UX y flujo, no como código de producción (es HTML/JS
plano en un solo archivo, pensado para demo).

### b) Motor de planillas interactivas (Python, funcional)
Carpeta con `formkit.py` + un `build_*.py` por planilla. Este código:
1. Reconstruye los PDF planos de CUCAIBA (son en realidad imágenes escaneadas,
   no PDF con texto) como PDF reales.
2. Les agrega campos de formulario (AcroForm) en las coordenadas exactas de
   cada dato a completar.
3. Permite rellenarlos programáticamente a partir de un diccionario de datos
   y exportar el PDF final listo para imprimir/firmar.

Ya están generadas y completas **6 planillas de CUCAIBA**:
- Certificado de Fallecimiento
- Ablación de Globos Oculares (2 páginas)
- Doppler Transcraneano (3 páginas)
- Historia Clínica Neurológica (3 páginas)
- Comunicación Familiar (sección de un protocolo mayor — el resto de ese
  protocolo no se incluyó, no hacía falta)
- Historia Clínica del Potencial Donante — OP2, páginas 1 a 5 (las páginas
  6-8 son las que llena enfermería a mano, se imprimen aparte, no están
  digitalizadas a propósito)

Los PDF ya generados (`*.pdf`, se adjuntan aparte) **no hace falta
regenerarlos** — son la plantilla fija. Ver `README.md` (incluido en el
código) para el detalle de cómo se conecta el modelo de datos con estas
plantillas vía `fill_and_export()`.

Importante: los campos "Sí/No" de las planillas son campos de **texto simple**
(no checkboxes), a propósito — están pensados para que una transcripción de
voz-a-texto los complete automáticamente, no para tildar a mano.

## 3. Stack técnico — decisiones ya cerradas (no rediscutir, ejecutar)

Basado en la app **PASE** (pase de guardia hospitalario) del mismo autor, que ya
resolvió los problemas de iOS/Android en producción. Se toma esa estructura
como base, no como referencia — mismo patrón de carpetas y convenciones.

- **Frontend**: Next.js (App Router) + TypeScript + Tailwind, PWA instalable.
  Mobile-first real (`dvh` no `vh`, `font-size:16px` mínimo en inputs,
  `visualViewport` para el teclado, `safe-area-inset`, sin Background Sync
  —no existe en iOS—, piso iOS 16.4+). Corre igual en iPhone y Android por ser
  web/PWA, no nativo — no confundir elección de lenguaje de backend con
  compatibilidad mobile, son cosas independientes.
- **Backend / datos**: Supabase (Postgres + RLS activa desde el día 1 en
  todas las tablas + Auth + Realtime). `schema.sql` y `campo_mapeo.sql`
  (incluidos, ya probados corriendo contra Postgres real) van primero.
- **Hosting**: Render (no Vercel).
- **Motor de planillas**: el código Python (`formkit.py` + `build_*.py`)
  **no se reescribe a JS**. Queda como microservicio Python aparte al que
  Next.js le pega solo para el paso puntual de generar el PDF final
  (`fill_and_export()`). Todo lo demás vive en Next.js/Supabase.
- **Captura por voz → dato estructurado**: una sola llamada a **Gemini
  (tier gratis para el MVP — Google puede usar esos datos para entrenar
  modelos en el tier free, por eso solo con datos ficticios de demo, nunca
  con pacientes reales; pasar a tier pago antes de producción real)**,
  multimodal: se manda el audio + el nombre del campo esperado, y el modelo
  devuelve el valor ya estructurado. Sin paso intermedio de transcripción
  separado — cuantos menos eslabones, menos fricción y menos falla.
  Flujo: audio → Gemini → `{campo, valor}` → confirmación de un toque →
  se guarda en `planilla_valores`.
- **Prioridad para la demo del congreso**: el circuito completo
  (Procurador → Base → Equipo → Resultado → Base → Equipo, con generación
  real del PDF) importa más que la voz. Si hay que recortar algo primero,
  se recorta sofisticación de voz antes que romper el circuito entre roles.



## 4. Qué falta construir (esto es el trabajo real de Claude Code)

Ninguna de las dos piezas anteriores es la app final. Falta:

1. **El modelo de datos central** — ya resuelto en `schema.sql` +
   `campo_mapeo.sql` (incluidos, probados). Falta correrlo contra el
   proyecto real de Supabase.
2. **Backend/app real** que reemplace la simulación del HTML: roles con
   autenticación, persistencia de casos, el circuito de solicitudes
   Equipo→Base→Procurador descripto en el prompt de diseño.
3. **Integración de voz real** vía Gemini (ver sección 3 arriba) que
   estructure la respuesta y la vuelque al campo correspondiente.
4. **El paso de generación de PDF en producción**: al pedir una planilla,
   armar el diccionario de valores (cruzando `campo_mapeo` + `planilla_valores`
   + `donantes`/`familiares`) y llamar `fill_and_export()` de `formkit.py`
   para producir el PDF completo.

## 5. Archivos adjuntos a esta conversación

- `PROMPT_DISENO.md` — filosofía de producto completa (leer primero).
- `formkit.py` + `build_*.py` + `README.md` — motor de planillas.
- Los 6 PDF de planillas ya generadas.
- `procuracion_preview.html` — referencia de UX (opcional, no es código a
  mantener).

## 6. Primer paso sugerido

1. Correr `schema.sql` y después `campo_mapeo.sql` contra el proyecto real
   de Supabase (Render como hosting del frontend/backend Next.js).
2. Armar el endpoint que arma el diccionario de valores para una planilla
   (cruzando `campo_mapeo` + `planilla_valores` + `donantes`/`familiares`)
   y lo pasa a `fill_and_export()`.
3. Recién ahí, roles + circuito de solicitudes + captura por voz (Gemini).

**Nota de estilo de código**: el mismo autor tiene otra app en producción
(PASE, pase de guardia hospitalario) con Next.js+Supabase resolviendo bien
los problemas típicos de iOS/PWA — RLS desde el día 1, cola offline con
IndexedDB, timestamps dobles (hora cliente vs hora servidor), pantallas
mínimas. Si hace falta un patrón de referencia para alguna de estas
decisiones y no está claro por dónde ir, preguntar en vez de inventar una
convención nueva — probablemente ya existe una resuelta en ese proyecto.
