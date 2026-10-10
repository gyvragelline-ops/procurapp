# Inventario: lo que carga el procurador y cómo llega a la Base operativa

Relevado del código el 10/10/2026, commit `3e2a95f`. No se cambió código.

## Cómo leer la tabla

- **Base:** se ve en el Expediente de `/base`. Entre paréntesis va la tarjeta. "solo como pendiente" quiere decir que el valor no se muestra: solo aparece lo que falta, en la tarjeta *Etapas* o en "falta o bloquea".
- **CSV** y **PDF:** si entra hoy con "Exportar para: Todo".
  - El PDF y la impresión usan las mismas secciones y filas que el CSV, así que valen igual.
  - Con un equipo elegido entra solo un subconjunto; ver `seccionesDeEquipo` en `lib/procuracion/base-exportar.ts`.
- **Numeración de etapas** (multiorgánico): con intervención judicial, 12 es Judicial y 13 es Hora de quirófano. Sin judicial, Hora de quirófano es la 12.
- **Origen que muestra la Base:**
  - `mantenimiento_registros` → Enfermería.
  - `mantenimiento_medico` y `mantenimiento_respirador` → Médico.
  - `laboratorio_valores` → Laboratorio, o Enfermería si así se cargó (glucemia de la fila horaria).

## Tabla

| Etapa · pestaña | Dato (como lo ve el procurador) | Tabla.columna | Tipo | Base | CSV | PDF |
|---|---|---|---|---|---|---|
| Alta de donante (botón "Nuevo") | Nombre | donantes.nombre_completo | texto | sí (solo iniciales; encabezado) | solo Base con "Incluir nombre y DNI" | ídem CSV |
| Alta de donante | DNI | donantes.dni | texto | no | solo Base con "Incluir nombre y DNI" | ídem CSV |
| Alta de donante | Tipo de procuración (multiorgánico / córneas) | donantes.tipo_procuracion | opción | sí (define las etapas) | no | no |
| 01 Potencial donante | Potencial donante (nombre) | donantes.nombre_completo | texto | sí (iniciales) | solo Base con opción | ídem |
| 01 Potencial donante | PD Nº | donantes.pd_numero | texto | sí (encabezado) | sí (identifica al donante) | sí |
| 01 Potencial donante | Edad | donantes.edad | número | sí (encabezado) | sí | sí |
| 01 Potencial donante | Establecimiento | donantes.institucion | texto | sí (encabezado) | sí | sí |
| 01 Potencial donante | Servicio | donantes.servicio | texto | solo como pendiente ("falta servicio") | no | no |
| 01 Potencial donante | Cama | donantes.cama | texto | no | no | no |
| 01 Potencial donante | Fecha de nacimiento | donantes.fecha_nacimiento | fecha | no | no | no |
| 01 Potencial donante | Fecha de ingreso | donantes.fecha_ingreso | fecha y hora | solo como pendiente | sí | sí |
| 01 Potencial donante | Intervención judicial: Aplica / No aplica | documentacion_estado (judicial/aplica).estado | sí/no | sí (muestra u oculta la etapa judicial) | no | no |
| 02 Certificación (examen neurológico) | Fecha del examen | planilla_valores (neuro).fecha_examen | texto | no | no | no |
| 02 · 1ª y 2ª evaluación | Hora | planilla_valores (neuro).hora_1a / hora_2a | hora | solo como pendiente | no | no |
| 02 · 1ª y 2ª evaluación | TAM | planilla_valores (neuro).ta_tam_1a / _2a | texto | no | no | no |
| 02 · 1ª y 2ª evaluación | Temperatura central | planilla_valores (neuro).t_central_1a / _2a | texto | no | no | no |
| 02 · 1ª y 2ª evaluación | Diabetes insípida | planilla_valores (neuro).diabetes_insipida_{1a,2a}_{si,no} | sí/no | no | no | no |
| 02 · 1ª y 2ª evaluación | Pupilas | planilla_valores (neuro).pupilas_1a / _2a | texto | no | no | no |
| 02 · 1ª y 2ª evaluación | 12 reflejos: fotomotor, corneano, oculocefálico, oculovestibular, nauseoso, deglutorio, maseterino, respuesta al dolor, osteotendinosos, plantar, cremasteriano, cutáneo-abdominales | planilla_valores (neuro).reflejo_*_1a / _2a | ausente/presente | solo como pendiente (cuántos sin completar; los de tronco "presente" por nombre) | no | no |
| 02 Test de confirmación | Apnea / Atropina | planilla_valores (neuro).tipo_test_confirmacion | opción | solo como pendiente | no | no |
| 02 Test de apnea | CO2 inicial, CO2 final | planilla_valores (neuro).apneica1_pco2_inicial / _final | número | solo como pendiente | no | no |
| 02 Test de apnea | Duración | planilla_valores (neuro).apneica1_duracion | texto | no | no | no |
| 02 Test de apnea | Resultado (positiva/negativa) | planilla_valores (neuro).apneica1_resultado | opción | no | no | no |
| 02 Test de atropina | FC inicial, FC final | planilla_valores (neuro).fc_inicial / fc_final | número | solo como pendiente | no | no |
| 02 Test de atropina | Fecha, Hora, Duración | planilla_valores (neuro).atropina_fecha / _hora / _duracion | texto / hora | no | no | no |
| 02 | Causa del coma | planilla_valores (neuro).causa_coma | texto | no | no | no |
| 02 | ARM obligada desde | planilla_valores (neuro).arm_fecha_hs (+ arm_obligada automático) | fecha y hora | no | no | no |
| 02 | Estudios complementarios (TAC u otro) | planilla_valores (neuro).estudios_complementarios | texto | no | no | no |
| 02 | ¿Cumple criterios de ME? Sí/No | planilla_valores (neuro).cumple_me_si / cumple_me_no | sí/no | no | no | no |
| 02 | Motivo y conducta sugerida | planilla_valores (neuro).no_cumple_motivo | texto | no | no | no |
| 02 | Médico 1, Médico 2 (nombre) | planilla_valores (certificado).medico1_nombre / medico2_nombre | texto | no | no | no |
| 02 | Lugar donde se archiva la documentación | planilla_valores (certificado).archivo_lugar | texto | no | no | no |
| 03 Certificación (métodos auxiliares) | Estado de EEG / Potenciales evocados / Doppler transcraneano / Angiografía cerebral | documentacion_estado (certificacion).estado por método | estado (ciclo) | solo como pendiente ("ningún método auxiliar completo") | no | no |
| 03 · EEG | Fecha, Hora, Informe | planilla_valores (neuro).eeg1_fecha / eeg1_hora / eeg1_informe | texto / hora | no | no | no |
| 03 · Potenciales evocados | Fecha, Hora, PEAT, PESS, PEV | planilla_valores (neuro).potenciales_fecha / _hora / peat / pess / pev | texto / hora | no | no | no |
| 03 · Doppler transcraneano | Fecha (día/mes/año), Hora, Informe | planilla_valores (doppler).fecha_dia / fecha_mes / fecha_anio / fecha_hora_top / interpretacion_resto | texto / hora | no | no | no |
| 03 · Angiografía cerebral | Fecha, Hora, Informe | documentacion_estado (certificacion/angiografia_cerebral).meta | texto / hora | no | no | no |
| 04 Comunicación de muerte | Realizada sí/no | documentacion_estado (comMuerte/realizada).estado | sí/no | sí (estado de la etapa; tarjeta Etapas) | no | no |
| 05 Comunicación de donación | Texto de la conversación (análisis) y etapa detectada | comunicacion_donacion_analisis.texto / etapa_detectada / frases_sugeridas | texto | no | no | no |
| 05 Comunicación de donación | Realizada sí/no | documentacion_estado (comDonacion/realizada).estado + timeline_eventos | sí/no | sí (estado de la etapa; Línea de tiempo) | no | no |
| 05 · Familiar de contacto | Nombre y apellido, DNI, Parentesco, Dirección, Celular | familiares.nombre / dni / parentesco / direccion / telefono | texto | no | no | no |
| 06 Muestras | Obtenida, por paquete (HLA, Laboratorio, Hemocultivo, Urocultivo, Serología, Pre-ablación, Grupo y factor, Hisopado COVID) | muestras.obtenida | sí/no | solo como pendiente ("faltan N de M muestras") | solo Serología (estado de la muestra) | ídem CSV |
| 07 Medidas antropométricas | Peso | donantes.peso | número (kg) | sí (encabezado; se usa para las dosis) | sí | sí |
| 07 Medidas antropométricas | Talla | donantes.talla | número (cm) | no | sí | sí |
| 07 Medidas antropométricas | Línea esternal, Perímetro axilar, Perímetro xifoideo, Perímetro umbilical, Biilíaco, Xifopubiano, Dorso ventral, Fémur | planilla_valores (op2_p2).l_esternal / p_axilar / p_xif / p_umbilic / biliaco / xifopubiano / d_ventral / femur | número (cm) | no | no | no |
| 08 Laboratorio e imágenes | Laboratorio (foto/galería) | estudios_imagenes (tipo_estudio=Laboratorio).archivo_url, descripcion | foto | sí (Imágenes y estudios: fecha, descripción, "ver") | sí (Imágenes y estudios: fecha y descripción, sin enlace) | ídem CSV |
| 08 | Rx de tórax | estudios_imagenes (Rx_torax) | foto | sí (Imágenes y estudios) | sí | sí |
| 08 | TAC de tórax | estudios_imagenes (TAC_torax) | video | sí (Imágenes y estudios) | sí | sí |
| 08 | Ecografía | estudios_imagenes (Ecografia) | foto / video | sí (Imágenes y estudios) | sí | sí |
| 08 | ECG | estudios_imagenes (ECG) | foto | sí (Imágenes y estudios) | sí | sí |
| 08 | Ecocardiograma | estudios_imagenes (Ecocardiograma) | foto / video | sí (Imágenes y estudios) | sí | sí |
| 08 | Broncoscopía | estudios_imagenes (Broncoscopia) | foto / video | sí (Imágenes y estudios) | sí | sí |
| 08 | Fotos del cuerpo | estudios_imagenes (Fotos_cuerpo) | foto | sí (Imágenes y estudios) | sí | sí |
| 09 Cultivos | Tipo (aspirado traqueal, hemocultivos, punta de CVC, punta de TAM, LCR, urocultivo, otro) y texto si es otro | cultivos.tipo / tipo_otro | opción / texto | sí (Cultivos) | sí | sí |
| 09 Cultivos | Fecha y hora de toma | cultivos.tomado_en | fecha y hora | sí (Cultivos) | sí | sí |
| 09 Cultivos | Resultado (pendiente/negativo/positivo) | cultivos.estado | opción | sí (Cultivos; resumen en Infeccioso) | sí | sí |
| 09 Cultivos | Germen | cultivos.germen | texto | sí (Cultivos) | sí | sí |
| 09 Cultivos | Sensibilidad | cultivos.sensibilidad | texto | sí (Cultivos) | sí | sí |
| 09 Cultivos | Hora del resultado | cultivos.resultado_en | fecha y hora | sí (Cultivos) | sí | sí |
| 09 Cultivos | Corrección de resultado ("corregido HH:MM") | cultivos.modificado_en | fecha y hora | no | no | no |
| 10 Documentación | Foto de DNI del potencial donante | documentacion_fotos (tipo=dni) | foto | no | no | no |
| 10 Documentación | Foto de grupo y factor | documentacion_fotos (tipo=grupo_factor) | foto | no | no | no |
| 11 Mantenimiento · Enfermería | Temperatura | mantenimiento_registros.temperatura | número (°C) | sí (Metabólico y temperatura; Infeccioso) | sí (Temperatura y otras infusiones) | sí |
| 11 · Enfermería | TAM | mantenimiento_registros.pam | número (mmHg) | sí (Hemodinámico) | sí | sí |
| 11 · Enfermería | FC | mantenimiento_registros.fc | número (lpm) | sí (Hemodinámico) | sí | sí |
| 11 · Enfermería | Saturación | mantenimiento_registros.sat_o2 | número (%) | sí (Respiratorio) | sí | sí |
| 11 · Enfermería | Glucemia (con hora de medición) | laboratorio_valores (parametro=glucemia, origen=enfermeria) | número (mg/dL) | sí (Metabólico) | sí | sí |
| 11 · Enfermería | Solución 0,9 %, Ringer lactato, Solución al medio, Dextrosa, Hemoderivados | mantenimiento_registros.ing_sol_09_ml / ing_ringer_ml / ing_sol_medio_ml / ing_dextrosa_ml / ing_hemoderivados_ml | número (mL) | solo dentro de "Balance acumulado" (Renal y balance) | solo dentro del balance | ídem CSV |
| 11 · Enfermería | Diuresis | mantenimiento_registros.diuresis_ml | número (mL) | sí (Renal y balance) | sí | sí |
| 11 · Enfermería | SNG / drenajes | mantenimiento_registros.egr_sng_drenajes_ml | número (mL) | solo dentro del balance | solo dentro del balance | ídem CSV |
| 11 · Enfermería | Pérdidas insensibles (calculadas o editadas) | mantenimiento_registros.perdidas_insensibles_ml / _editadas | número (mL) | solo dentro del balance | solo dentro del balance | ídem CSV |
| 11 · Enfermería y Médico | Bombas de la hora: velocidad por droga (noradrenalina, adrenalina, dopamina, dobutamina, isoproterenol, esmolol, amiodarona, vasopresina, furosemida, insulina, potasio, bicarbonato, hidrocortisona, dexametasona) | mantenimiento_bombas_hora.droga / velocidad_ml_h | número (mL/h) | sí, como dosis calculada con hora (vasoactivas en Hemodinámico, furosemida en Renal, el resto en Metabólico); la velocidad en mL/h no | sí (dosis: Hemodinámico, Renal, Insulina, Otras infusiones) | sí |
| 11 · Dilución | Ampollas, contenido por ampolla, unidad, volumen final, solución de la dilución | mantenimiento_infusiones.ampollas / contenido_por_ampolla / unidad_contenido / volumen_final_ml / solucion_dilucion(_otra) | número / opción | no (solo se usa para calcular la dosis) | no | no |
| 11 · "Cambié la velocidad" | Nueva velocidad y hora | mantenimiento_infusiones (motivo=cambio_velocidad).velocidad_ml_h / registrado_en | número / hora | sí (cuenta para la dosis vigente) | sí (dosis vigente) | sí |
| 11 · Bolos | Bolo de furosemida, desmopresina, esmolol o vasopresina (dosis y hora) | mantenimiento_infusiones (tipo=bolo).droga / dosis_calculada / registrado_en | número | no | no | no |
| 11 · Peso (si falta) | Peso | donantes.peso | número (kg) | sí (encabezado) | sí | sí |
| 11 Mantenimiento · Médico (respirador) | Modo (VCV, PCV, PSV, otro) | mantenimiento_respirador.modo / modo_otro | opción / texto | sí (Respiratorio) | sí | sí |
| 11 · Médico (respirador) | FiO2 | mantenimiento_respirador.fio2 | número (%) | sí (Respiratorio) | sí | sí |
| 11 · Médico (respirador) | PEEP | mantenimiento_respirador.peep | número (cmH2O) | sí (Respiratorio) | sí | sí |
| 11 · Médico (respirador) | Volumen corriente | mantenimiento_respirador.volumen_corriente | número (mL) | sí (Respiratorio) | sí | sí |
| 11 · Médico (respirador) | Frecuencia | mantenimiento_respirador.frecuencia | número (/min) | sí (Respiratorio) | sí | sí |
| 11 · Médico (respirador) | Presión plateau, Presión pico | mantenimiento_respirador.presion_plateau / presion_pico | número (cmH2O) | sí (Respiratorio) | sí | sí |
| 11 · Médico (monitoreo avanzado) | PVC | mantenimiento_medico.pvc | número (cmH2O) | sí (Hemodinámico) | sí | sí |
| 11 · Médico | Gasto cardíaco | mantenimiento_medico.gc | número (L/min) | sí (Hemodinámico) | sí (solo Cardíaco o Todo) | sí |
| 11 · Médico | IC medido | mantenimiento_medico.ic_medido | número (L/min/m²) | sí (Hemodinámico) | sí (Cardíaco o Todo) | sí |
| 11 · Médico | Sat venosa | mantenimiento_medico.sat_venosa | número (%) | sí (Hemodinámico) | sí (Cardíaco o Todo) | sí |
| 11 · Médico | Δ variabilidad de pulso | mantenimiento_medico.delta_pp | número (%) | sí (Hemodinámico) | sí (Cardíaco o Todo) | sí |
| 11 · Médico | Δ volumen sistólico | mantenimiento_medico.delta_vs | número (%) | sí (Hemodinámico) | sí (Cardíaco o Todo) | sí |
| 11 · Médico | Δ CO2 espirado | mantenimiento_medico.delta_co2_espirado | número (%) | no | no | no |
| 11 · Médico | Índice de vena cava | mantenimiento_medico.indice_vena_cava | número (%) | no | no | no |
| 11 · Médico | Elevación pasiva de miembros | mantenimiento_medico.resultado_pasivo_miembros | número (%) | no | no | no |
| 11 · Médico | Disfunción miocárdica sí/no | mantenimiento_medico.disfuncion_miocardica | sí/no | no | no | no |
| 11 · Médico | Corazón candidato (sí/no/sin definir) | mantenimiento_config.corazon_candidato | opción | no | sí (Candidato a corazón: Cardíaco o Todo) | sí |
| 11 · Médico | Pulmón candidato (sí/no/sin definir) | mantenimiento_config.pulmon_candidato | opción | no | no | no |
| 11 · Médico | Monitoreo avanzado activo | mantenimiento_config.monitoreo_avanzado_activo | sí/no | no | no | no |
| 11 · Médico (laboratorio) · Básicos | Sodio, Potasio | laboratorio_valores (na, k) | número (mEq/L) | sí (Metabólico) | sí | sí |
| 11 · Médico (laboratorio) · Básicos | Glucemia | laboratorio_valores (glucemia) | número (mg/dL) | sí (Metabólico) | sí | sí |
| 11 · Médico (laboratorio) · Básicos | pH, PaO2 | laboratorio_valores (ph, pao2) | número | sí (Respiratorio; también PaFi calculada) | sí (Gases) | sí |
| 11 · Médico (laboratorio) · Básicos | Amilasa | laboratorio_valores (amilasa) | número (U/L) | sí (Metabólico) | sí | sí |
| 11 · Médico (laboratorio) | FiO2 de la gasometría | laboratorio_valores (fio2) | número (%) | solo dentro de la PaFi | solo dentro de la PaFi | ídem |
| 11 · Médico (laboratorio) · Hemograma | Hb, Hematocrito, Glóbulos blancos, Plaquetas | laboratorio_valores (hb, hto, gb, plaquetas) | número | sí (Hepático y hematológico; GB también en Infeccioso) | sí | sí |
| 11 · Médico (laboratorio) · Hepatograma | TGO, TGP, Bilirrubina total y directa, Fosfatasa alcalina, GGT | laboratorio_valores (tgo, tgp, bili_total, bili_directa, fal, ggt) | número | sí (Hepático y hematológico) | sí | sí |
| 11 · Médico (laboratorio) · Coagulograma | Tiempo de protrombina, RIN, KPTT, Fibrinógeno | laboratorio_valores (tp, rin, kptt, fibrinogeno) | número | sí (Hepático y hematológico) | sí | sí |
| 11 · Médico (laboratorio) · Diabetes insípida | Osmolaridad sérica y urinaria, Densidad urinaria | laboratorio_valores (osm_serica, osm_urinaria, densidad_urinaria) | número | sí (Renal y balance) | sí (Renal o Todo) | sí |
| 11 · Médico (laboratorio) · Corazón | Troponina, CPK-MB (con unidad elegida) | laboratorio_valores (troponina, cpk_mb).valor / unidad | número + unidad | sí (Hemodinámico), **sin la unidad cargada** | sí, **sin la unidad cargada** | ídem CSV |
| 11 · Médico (laboratorio) · Riñón | Urea, Creatinina | laboratorio_valores (urea, creatinina) | número | sí (Renal y balance) | sí (Renal o Todo) | sí |
| 11 · Médico (laboratorio) · Orina | Sedimento urinario | laboratorio_valores (sedimento).valor_texto | texto | sí (Renal y balance) | sí | sí |
| 12 Intervención judicial | Foto del precario | documentacion_fotos (tipo=precario) + cargado_por_rol | foto | sí (Judicial, quirófano y equipos: fecha y rol) | no | no |
| 12 Intervención judicial | Foto de la autorización del juez | documentacion_fotos (tipo=autorizacion_juez) + cargado_por_rol | foto | sí (Judicial, quirófano y equipos) | no | no |
| 13 Hora de quirófano | Hora de quirófano (y sus cambios) | quirofano_horarios.hora / registrado_en | fecha y hora | sí, solo la vigente (Judicial, quirófano y equipos); el historial de cambios no | sí, solo la vigente | ídem CSV |
| 13 · Aviso de los equipos | Equipo | quirofano_equipos.equipo | texto | sí | sí | sí |
| 13 · Aviso de los equipos | Órganos (y "otro") | quirofano_equipos.organos / organo_otro | lista | sí | sí | sí |
| 13 · Aviso de los equipos | Anestesista (sí/no/sin confirmar) | quirofano_equipos.anestesista | opción | sí | no | no |
| 13 · Aviso de los equipos | Medio del aviso | quirofano_equipos.medio | opción | sí | no | no |
| 13 · Aviso de los equipos | Informado por | quirofano_equipos.informado_por | texto | no | no | no |
| 13 · Aviso de los equipos | Hora del aviso / de la edición | quirofano_equipos.creado_en / modificado_en | fecha y hora | sí, solo creado_en | sí (fecha de la fila) | ídem |
| Todas las etapas (al pie) | Marcar completo / no completo | etapas_estado.marcado_manual / marcado_en + timeline_eventos | opción + hora | sí (Etapas: "marcado manualmente HH:MM"; también el progreso) | no | no |
| Pantalla del donante · burbuja "Chat" | Mensaje (rol, nombre, texto) | mensajes_caso.rol / autor / texto / creado_en / anulado | texto | sí (Chat con el procurador) | no | no |
| — | Solicitudes | solicitudes | — | el procurador todavía no las carga ni las responde (segunda etapa: "Chat y pedidos"); hoy solo la Base | — | — |
| — | Serologías (valores) | — no existe tabla — | — | no se pueden cargar: solo el paquete de muestra "Serología" (obtenida sí/no) | estado de la muestra | ídem |

## Lo que se carga pero la Base NO ve hoy

1. **Examen neurológico completo (02):** horas, TAM, temperatura, pupilas, diabetes insípida, valores de cada reflejo, resultado del test de apnea o atropina, causa del coma, ARM, ¿cumple ME?, médicos y archivo. Solo aparece lo que falta.
2. **Métodos auxiliares (03):** fecha, hora e informe de EEG, potenciales, doppler y angiografía. Solo aparece si hay o no un método completo.
3. **Familiar de contacto (05):** nombre, DNI, parentesco, dirección y celular.
4. **Análisis de la comunicación de donación (05):** texto y etapa detectada.
5. **Las 8 medidas antropométricas (07)**, y la talla. La talla sí sale en el CSV, pero no se ve en pantalla.
6. **Fotos de DNI y de grupo y factor (10).**
7. **Bolos:** furosemida, desmopresina, esmolol y vasopresina.
8. **Monitoreo avanzado:** Δ CO2 espirado, índice de vena cava, elevación pasiva de miembros y disfunción miocárdica.
9. **Configuración del médico:** pulmón candidato, monitoreo avanzado activo y corazón candidato. Corazón candidato sí sale en el CSV.
10. **Ingresos y egresos por tipo:** soluciones, hemoderivados, SNG y pérdidas insensibles. Solo llega el balance acumulado.
11. **Velocidad de las bombas en mL/h y datos de la dilución.** Solo llega la dosis calculada.
12. **Historial de la hora de quirófano.** Solo llega la vigente.
13. **"Informado por" del aviso a los equipos.**
14. **Corrección de un cultivo ("corregido HH:MM").**
15. **Muestras paquete por paquete:** solo aparece "faltan N de M".
16. **Fecha de nacimiento, cama y servicio.** El servicio aparece solo como pendiente.
17. **Unidad elegida de troponina y CPK-MB.** El valor llega sin unidad.

## Lo que la Base ve pero NO sale en el CSV ni en el PDF

1. **Fotos judiciales:** precario y autorización del juez.
2. **Anestesista y medio del aviso de cada equipo.**
3. **Chat, solicitudes y línea de tiempo.**
4. **Estado de las etapas y marca manual:** tarjeta Etapas, "falta o bloquea" y progreso. Están solo en el CSV del Tablero, no en el del Expediente.
5. **Procurador a cargo y tiempo en protocolo:** solo en el CSV del Tablero.
6. **Enlace "ver" al archivo de cada estudio.** Sale la fila con fecha y descripción, sin el archivo.
7. **Resumen de cultivos de la tarjeta Infeccioso:** cargados, pendientes y positivos. Los cultivos sí salen uno por uno.

## Notas

- **Datos que están en la base pero no tienen dónde cargarse en la app:** `donantes.sexo`, `grupo_sanguineo`, `grupo_confirmado`, `causa_muerte`, `folio_numero`, `localidad`, `denunciante`, `me_hora`.
  - La Base los muestra o exporta (sexo, grupo, folio, localidad, causa de muerte, hora de ME), pero en la práctica van a llegar vacíos salvo que se carguen por otra vía.
  - `procurador_nombre` es una columna nueva del SQL de la Base y todavía no tiene dónde cargarse.
- **"Acceso a formularios" (10):** genera PDFs con lo ya cargado; no guarda datos nuevos.
- **"Exportar para equipo":** con un equipo elegido, del CSV y del PDF salen solo el bloque común más lo propio de ese órgano. Con "Todo" sale todo lo marcado "sí".
