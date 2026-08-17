# PROMPT — PREVIEW INTERACTIVA: SISTEMA OPERATIVO DE PROCURACIÓN
### Versión 2 — Centrada en el cuidado del procurador

---

## 0. NORTE DEL PRODUCTO (leer antes que nada)

Este producto no se diseña primero para "organizar información". Se diseña primero para **proteger al procurador**.

El procurador trabaja bajo las peores condiciones posibles para tomar decisiones y cargar datos: turnos largos, presión de tiempo, contacto con la muerte, comunicación con familias en duelo, y una cascada de tareas administrativas que compiten por su atención justo cuando su capacidad cognitiva está más comprometida.

Toda decisión de diseño se filtra por esta pregunta:

> **¿Esto le saca peso de encima al procurador, o se lo pone?**

Si una función no reduce carga mental, carga administrativa o fricción operativa — no se construye, sin importar cuán "completa" o "inteligente" parezca.

No construyas primero la arquitectura. No expliques primero el sistema. **Construí la preview navegable.** Al final, en una sección "DECISIONES DE DISEÑO", explicá qué elegiste para proteger al procurador y por qué.

---

## 1. QUÉ ES Y QUÉ NO ES

Es un **sistema operativo del proceso de procuración**, organizado alrededor de un expediente vivo por donante, compartido por tres actores: **Procurador**, **Base Operativa**, **Equipo de Trasplante**.

No es (y nunca debe convertirse en):
- historia clínica electrónica genérica;
- chatbot médico;
- app para pacientes/familias;
- sistema de compatibilidad, lista de espera o asignación de órganos;
- sistema que decide si un órgano se acepta o rechaza.

La decisión clínica siempre es del equipo humano. El sistema **organiza y protege**, no decide.

---

## 2. PRINCIPIO CENTRAL: CUIDAR AL PROCURADOR ES EL PRODUCTO

Esta sección no es un "extra" de UX. Es el criterio de diseño dominante, por encima de funcionalidad.

### 2.1 Carga cognitiva — reducirla activamente
- El procurador nunca debe sostener información en la cabeza que el sistema ya tiene. Todo dato cargado una vez se reutiliza automáticamente en cualquier planilla, resumen o módulo que lo necesite (peso, edad, grupo, horarios, resultados).
- La pantalla debe responder siempre, en 3 segundos, a: *¿dónde estoy? ¿qué hice? ¿qué falta? ¿qué es urgente? ¿qué hago ahora?*
- Nunca mostrar más de lo que el procurador necesita para el paso actual. Progressive disclosure: lo secundario se oculta hasta que se necesita.
- Un solo camino visible por vez, no 20 menús. La línea de tiempo es la guía; el procurador no tiene que decidir "qué hacer después", el sistema se lo muestra.

### 2.2 Carga administrativa — eliminarla, no digitalizarla
- No estamos digitalizando planillas. Estamos eliminando la necesidad de llenarlas dos veces.
- Todo lo que pueda completarse por voz, por foto o por inferencia de un documento ya cargado, se completa así — con confirmación breve antes de guardar datos críticos.
- Meta explícita: cada dato se escribe **una sola vez en toda la vida del caso**.
- Las tareas repetitivas (registrar hora, marcar recepción de un resultado, confirmar retiro de muestra) deben poder hacerse en un toque, no en un formulario.

### 2.3 Carga emocional — diseñar para un entorno de duelo y presión
- Tono visual sobrio, sin urgencia artificial, sin gamificación, sin "felicitaciones" ni refuerzos infantilizantes. El respeto por la situación es un requisito de diseño, no un detalle estético.
- Las alertas no deben generar ansiedad acumulada: pocas, jerarquizadas (🔴 crítica / 🟡 importante / 🔵 informativa), y siempre accionables — nunca una alerta sin una acción clara asociada.
- Evitar "fatiga de alarma": si todo es urgente, nada lo es. El sistema debe proteger la atención del procurador filtrando ruido, no reenviándolo tal cual.
- Los módulos sensibles (comunicación de muerte, comunicación de donación) están separados entre sí y preparados para alojar guías, frases sugeridas y apoyo — sin simular que el sistema "sabe" cómo hablarle a una familia. Esa función se deja preparada, no inventada.

### 2.4 Fricción operativa — bajarla en cada micro-interacción
- Diseño mobile-first para el procurador: botones grandes, navegación a una mano, mínimo texto para leer bajo presión, micrófono siempre accesible donde tenga sentido.
- Cada solicitud entrante de la Base debe llegar como una tarea clara con un solo botón de acción, no como un mensaje de chat que hay que interpretar.
- El sistema anticipa el próximo dato que probablemente se necesite y lo deja a mano (principio de "menor esfuerzo siguiente", no de automatización mágica).
- Nunca pedir información que el sistema ya puede inferir de lo cargado previamente.

### 2.5 Psicología del comportamiento aplicada (marco de trabajo)
- **Carga por defecto, no por pedido**: los valores más probables se sugieren, el procurador confirma en vez de escribir.
- **Chunking**: la línea de tiempo divide un proceso abrumador en pasos pequeños y completables, generando sensación de avance y control.
- **Feedback inmediato**: cada acción (cargar un dato, responder una solicitud) debe mostrar un cambio de estado visible al instante — refuerza que el esfuerzo tuvo efecto y reduce la sensación de estar "cargando datos al vacío".
- **Aversión a la pérdida**: nada que el procurador ya cargó se pide de nuevo ni se puede perder por error de navegación; todo autoguarda.
- **Costo de cambio de contexto**: minimizar saltos entre pantallas para completar una tarea; una acción, una pantalla, cuando sea posible.
- **Autonomía percibida**: el sistema guía pero nunca bloquea; el procurador puede saltar pasos si la situación lo requiere, sin pelear contra el software.

---

## 3. LOS TRES ACTORES (sin cambios de alcance, con foco reforzado)

**A. Procurador** — interfaz mobile-first, mínima carga, guiada por timeline. Su tiempo y su estado mental son el recurso más escaso del sistema; todo se subordina a protegerlo.

**B. Base Operativa** — vista multi-caso, coordina, filtra y canaliza solicitudes sin bombardear al procurador con pedidos sueltos; agrupa y prioriza antes de enviar.

**C. Equipo de Trasplante** — recibe información ya organizada por órgano; sus pedidos se canalizan a través de Base, nunca directo al procurador, para no fragmentar su atención.

Circuito de solicitudes, siempre trazable:
`Equipo → Base → Procurador → Resultado → Base → Equipo`

---

## 4. EL DONANTE COMO EXPEDIENTE VIVO

Un caso por donante, con estado visible en todas las interfaces (ejemplo de formato, no literal):

```
DONANTE #0247 · 43 años · Masculino · O+ · 82 kg · ME 08:42

Diagnóstico ME        🟢
Certificación         🟢
Familia                🟢
Donación               🟢
Muestras               🟢
Mantenimiento          🟡
Estudios                🟡
Documentación           🟡
Órganos                 🟡
Quirófano                ⚪
```

Regla de oro: **cargar una vez, reutilizar siempre** (peso, edad, sexo, grupo, talla, horarios, resultados, estudios, documentos).

---

## 5. LÍNEA DE TIEMPO (columna vertebral, no checklist rígida)

01 Potencial donante → 02 Diagnóstico ME → 03 Certificación → 04 Comunicación de muerte → 05 Comunicación de donación → 06 Muestras y mediciones → 07 Mantenimiento → 08 Estudios y documentación → 09 Evaluación multiorgánica → 10 Coordinación con Base → 11 Quirófano → 12 Cierre.

El camino se adapta a cada caso y protocolo institucional; no se inventan reglas clínicas. La timeline registra automáticamente cada evento relevante, sin que el procurador tenga que "acordarse de anotarlo".

---

## 6. MÓDULOS (mismo alcance funcional que la v1, con el filtro de carga aplicado a cada uno)

- **Potencial donante**: datos iniciales + estado simulado "Cargado en SINTRA ✓" (sin integración real en esta preview).
- **Diagnóstico ME**: estructura configurable, sin inventar criterios médicos.
- **Certificación**: checklist de estudios (Doppler, EEG, potenciales evocados, angioTC 4 vasos, apnea, atropina) con estado COMPLETO / PENDIENTE / NO CORRESPONDE / EN PROCESO — determinado por protocolo institucional, no por el sistema.
- **Comunicación de muerte** y **Comunicación de donación**: módulos separados, con espacio preparado (no inventado) para guías y recursos de apoyo al procurador.
- **Muestras y mediciones**: carga mínima, indicador de muestras listas para retiro por Base.
- **Mantenimiento del donante**: vista por categoría (hemodinamia, respiratorio, renal, metabólico, temperatura, diabetes insípida, infecciones) con evolución temporal y tendencias — sin protocolos terapéuticos inventados.
- **Micrófono**: herramienta de baja fricción en puntos específicos, con confirmación breve antes de guardar datos críticos. Nunca conversación abierta con IA.
- **Documentación del caso**: estado consolidado (🟢/🟡/🔴) de cada planilla, con reutilización automática de datos ya cargados.
- **Laboratorios e imágenes**: carga por foto/PDF/voz, estados RECIBIDO / PENDIENTE / FALTA / ACTUALIZADO, sin inventar resultados.
- **Centro de solicitudes**: cada pedido de Base es una tarjeta accionable (no un chat), con estado y horario, registrada en la timeline.
- **Canal Procurador ↔ Base**: la conversación puede generar solicitud, tarea o evento — no queda perdida en un historial de mensajes.
- **Panel de órganos**: completitud de información por órgano (no aptitud, no scoring).
- **Equipo de Trasplante**: vista por órgano, solicitudes canalizadas vía Base.
- **Quirófano**: coordinación de horario y logística, sin inventar procedimientos institucionales.
- **Resumen final**: consolidado de todo el caso, generable en un toque.

---

## 7. LO QUE NO SE CONSTRUYE (sin cambios)

Nada de: marketplace, pacientes, turnos, compatibilidad, lista de espera, receptores, asignación, scoring de órganos, recomendaciones terapéuticas autónomas, o cualquier función de historia clínica ajena al workflow de procuración.

Regla de filtro: si una función no reduce fricción, no protege al procurador, no mejora coordinación o no aumenta trazabilidad — no se agrega.

---

## 8. UX — REGLA DE DESEMPATE

Ante cualquier disyuntiva de diseño, en este orden de prioridad:

1. **¿Protege al procurador de carga mental/administrativa/emocional?** → gana siempre.
2. **¿Hace más claro el estado del caso?** → gana sobre agregar una función nueva.
3. **¿Reduce un paso del workflow?** → gana sobre IA sofisticada.
4. **¿Da mejor información en el momento correcto?** → gana sobre dar más información.

Diseño sobrio, sin gradientes decorativos, sin estética de chatbot, sin formularios interminables. La sensación debe ser: *"esto me cuida y me ayuda a hacer mi trabajo"* — nunca *"esto es una app de IA"*.

---

## 9. RECORRIDO DE DEMO A CONSTRUIR (igual que v1, usalo como guion de la preview)

Entrar como Procurador → abrir DONANTE #0247 → ver timeline → avanzar etapas → registrar por voz → cargar laboratorio ficticio → ver actualización automática → recibir y completar solicitud de Base → entrar como Base → ver caso actualizado → enviar solicitud al procurador → entrar como Equipo de Trasplante → abrir un órgano → solicitar estudio a Base → Base deriva a Procurador → se completa → vuelve automáticamente al Equipo → coordinación de quirófano → generar resumen final.

---

## 10. ENTREGABLE

Construí ahora la **preview interactiva y navegable** (clicks reales, estados que cambian, datos ficticios, voz simulada, documentos simulados). Datos de demo: varios donantes ficticios (#0247 en mantenimiento 🟡, #0251 en evaluación 🔴, #0253 en quirófano 🟢, #0254 cerrado 🟢), con #0247 desarrollado en detalle.

Al terminar, agregá una sección breve **"DECISIONES DE DISEÑO"** explicando qué elegiste específicamente para reducir la carga del procurador — no una explicación general de arquitectura.

**No expliques antes de construir. Construí primero.**
