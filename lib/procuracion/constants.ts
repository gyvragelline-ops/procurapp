export type EstadoEtapa = "green" | "amber" | "red" | "gray";

export type TipoProcuracion = "multiorganico" | "corneas";

export const STAGES_MULTIORGANICO: { key: string; label: string }[] = [
  { key: "potencial", label: "Potencial donante" },
  { key: "me", label: "Certificación (Examen neurológico)" },
  { key: "certificacion", label: "Certificación (Métodos auxiliares)" },
  { key: "comMuerte", label: "Comunicación de muerte" },
  { key: "comDonacion", label: "Comunicación de donación" },
  { key: "muestras", label: "Muestras" },
  { key: "labImagenes", label: "Laboratorio e imágenes" },
  { key: "documentacion", label: "Documentación" },
  { key: "mantenimiento", label: "Mantenimiento" },
  { key: "organos", label: "Evaluación multiorgánica" },
  { key: "judicial", label: "Intervención judicial" },
  { key: "quirofano", label: "Quirófano" },
];

export const STAGES_CORNEAS: { key: string; label: string }[] = [
  { key: "potencial", label: "Potencial donante" },
  { key: "me", label: "Certificación (Examen neurológico)" },
  { key: "comMuerte", label: "Comunicación de muerte" },
  { key: "comDonacion", label: "Comunicación de donación" },
  { key: "muestras", label: "Muestras" },
  { key: "documentacion", label: "Documentación" },
  { key: "judicial", label: "Intervención judicial" },
  { key: "entregaCorneas", label: "Entrega de córneas" },
];

export function stagesForTipo(tipo: TipoProcuracion | null | undefined) {
  return tipo === "corneas" ? STAGES_CORNEAS : STAGES_MULTIORGANICO;
}

export const STRIP_STAGES_MULTIORGANICO = [
  "me",
  "certificacion",
  "comMuerte",
  "comDonacion",
  "muestras",
  "labImagenes",
  "documentacion",
  "mantenimiento",
  "organos",
  "quirofano",
];

export const STRIP_STAGES_CORNEAS = ["me", "comMuerte", "comDonacion", "muestras", "documentacion", "entregaCorneas"];

export function stripStagesForTipo(tipo: TipoProcuracion | null | undefined) {
  return tipo === "corneas" ? STRIP_STAGES_CORNEAS : STRIP_STAGES_MULTIORGANICO;
}

export const STRIP_LABELS: Record<string, string> = {
  me: "Cert. Neuro",
  certificacion: "Cert. Aux",
  comMuerte: "Fam",
  comDonacion: "Donac",
  muestras: "Mstr",
  labImagenes: "Lab",
  documentacion: "Doc",
  mantenimiento: "Mant",
  organos: "Órg",
  quirofano: "Qx",
  entregaCorneas: "Córn",
};

/**
 * Qué planilla(s) oficiales (campo_mapeo.planilla_key) muestra cada etapa.
 * Primer borrador de mapeo semántico -- no hay una relación formal en el
 * schema todavía entre etapa_key y planilla_key, así que esto es lo que
 * se ajustará a medida que el flujo real de captura se defina.
 * 'muestras' y 'organos' no usan campo_mapeo: tienen tabla propia
 * (muestras, organos) con su propio modelo de datos.
 */
export const ETAPA_PLANILLAS: Record<string, string[]> = {
  potencial: ["op2_p1"],
  me: ["neuro"],
  certificacion: ["certificado"],
  comMuerte: ["coord_familia"],
  comDonacion: [],
  muestras: [],
  labImagenes: ["op2_p3", "op2_p4"],
  documentacion: ["doppler"],
  judicial: [],
  mantenimiento: ["op2_p2"],
  organos: [],
  quirofano: ["op2_p5"],
};

export function dotClass(s: EstadoEtapa | undefined) {
  return { green: "dot-green", amber: "dot-amber", red: "dot-red", gray: "dot-gray" }[s ?? "gray"];
}

export function chipClass(s: EstadoEtapa | undefined) {
  return { green: "chip-green", amber: "chip-amber", red: "chip-red", gray: "chip-gray" }[s ?? "gray"];
}

export function stageLabel(s: EstadoEtapa | undefined) {
  return { green: "Completo", amber: "En curso", red: "Crítico", gray: "Sin iniciar" }[s ?? "gray"];
}

export function computePotencialEstado(donante: {
  servicio: string | null;
  pd_numero: string | null;
  fecha_ingreso: string | null;
}): EstadoEtapa {
  return donante.servicio && donante.pd_numero && donante.fecha_ingreso ? "green" : "gray";
}

export const REFLEJOS_ME: { key: string; label: string; grupo: "A" | "B" }[] = [
  { key: "reflejo_fotomotor", label: "Fotomotor", grupo: "B" },
  { key: "reflejo_corneano", label: "Corneano", grupo: "B" },
  { key: "reflejo_oculocefalico", label: "Oculocefálico", grupo: "B" },
  { key: "reflejo_oculovestibular", label: "Oculovestibular", grupo: "B" },
  { key: "reflejo_nauseoso", label: "Nauseoso", grupo: "B" },
  { key: "reflejo_deglutorio", label: "Deglutorio", grupo: "B" },
  { key: "reflejo_maseterino", label: "Maseterino", grupo: "B" },
  { key: "reflejo_dolor", label: "Respuesta al dolor", grupo: "B" },
  { key: "reflejo_osteotendinosos", label: "Osteotendinosos", grupo: "A" },
  { key: "reflejo_plantar", label: "Plantar", grupo: "A" },
  { key: "reflejo_cremasteriano", label: "Cremasteriano", grupo: "A" },
  { key: "reflejo_cutaneoabdominal", label: "Cutáneo-abdominales", grupo: "A" },
];

// Campos "de cierre del documento" -- no forman parte del criterio de
// verde de ninguna etapa, solo completan lo impreso en Historia Clínica
// Neurológica / Certificado de fallecimiento. Nombres EXACTOS de los
// campos reales de esas plantillas (ver handoff/test-documentos).
export const ME_CAMPO_KEYS_DOCUMENTO = [
  "ta_tam_1a",
  "ta_tam_2a",
  "t_central_1a",
  "t_central_2a",
  "diabetes_insipida_1a_si",
  "diabetes_insipida_1a_no",
  "diabetes_insipida_2a_si",
  "diabetes_insipida_2a_no",
  "pupilas_1a",
  "pupilas_2a",
  "movimientos_atipicos_1a_si",
  "movimientos_atipicos_1a_no",
  "movimientos_atipicos_2a_si",
  "movimientos_atipicos_2a_no",
  "causa_coma",
  "droga1",
  "droga2",
  "otra_med_resto",
  "arm_obligada",
  "arm_fecha_hs",
  "fondo_ojo",
  "cb_union_neuromuscular",
  "cb_electroestimulacion",
  "observaciones_resto",
  "cumple_me_si",
  "cumple_me_no",
  "no_cumple_motivo",
  "apneica1_duracion",
  "apneica1_complicaciones",
  "eeg1_fecha",
  "eeg1_hora",
  "eeg1_informe",
  "potenciales_fecha",
  "potenciales_hora",
  "peat",
  "pess",
  "pev",
];

// Campos de "cierre" que van a planilla_key='certificado' (no 'neuro') --
// el panel de Examen neurológico los muestra pero se guardan en la
// planilla del certificado, que es la que los usa.
export const CERTIFICADO_CIERRE_KEYS = ["medico1_nombre", "medico2_nombre", "archivo_lugar"];

// Campos propios del Doppler transcraneano (planilla_key='doppler') que
// se cargan desde el panel de Métodos auxiliares.
export const DOPPLER_CAMPO_KEYS = ["fecha_dia", "fecha_mes", "fecha_anio", "fecha_hora_top", "interpretacion_resto"];

export const ME_CAMPO_KEYS = [
  "hora_1a",
  "hora_2a",
  "tipo_test_confirmacion",
  "apneica1_pco2_inicial",
  "apneica1_pco2_final",
  "fc_inicial",
  "fc_final",
  ...REFLEJOS_ME.map((r) => r.key),
  ...ME_CAMPO_KEYS_DOCUMENTO,
];

export type MeCampos = Record<string, string | null>;

export function computeMeEstado(campos: MeCampos): EstadoEtapa {
  const horasOk = !!campos.hora_1a && !!campos.hora_2a;
  const reflejosOk = REFLEJOS_ME.every((r) => campos[r.key] === "ausente" || campos[r.key] === "presente");
  const grupoBOk = REFLEJOS_ME.filter((r) => r.grupo === "B").every((r) => campos[r.key] === "ausente");
  let testOk = false;
  if (campos.tipo_test_confirmacion === "apnea") {
    testOk = !!campos.apneica1_pco2_inicial && !!campos.apneica1_pco2_final;
  } else if (campos.tipo_test_confirmacion === "atropina") {
    testOk = !!campos.fc_inicial && !!campos.fc_final;
  }
  if (horasOk && reflejosOk && grupoBOk && testOk) return "green";
  const algoCargado =
    campos.hora_1a ||
    campos.hora_2a ||
    campos.tipo_test_confirmacion ||
    REFLEJOS_ME.some((r) => campos[r.key]);
  return algoCargado ? "amber" : "gray";
}

export const METODOS_CERT_AUX: { key: string; label: string; grupo: "neurofisiologicos" | "flujo" }[] = [
  { key: "eeg", label: "EEG", grupo: "neurofisiologicos" },
  { key: "potenciales_evocados", label: "Potenciales evocados", grupo: "neurofisiologicos" },
  { key: "doppler_transcraneano", label: "Doppler transcraneano", grupo: "flujo" },
  { key: "angiografia_cerebral", label: "Angiografía cerebral", grupo: "flujo" },
];

export type CertAuxCampos = Record<string, string | null>;

export function computeCertAuxEstado(campos: CertAuxCampos): EstadoEtapa {
  return METODOS_CERT_AUX.some((m) => campos[m.key] === "completo") ? "green" : "gray";
}

export function computeComMuerteEstado(realizada: boolean): EstadoEtapa {
  return realizada ? "green" : "gray";
}

export function computeComDonacionEstado(realizada: boolean): EstadoEtapa {
  return realizada ? "green" : "gray";
}

export function computeMuestrasEstado(muestras: { obtenida: boolean }[]): EstadoEtapa {
  if (muestras.length === 0) return "gray";
  const obtenidas = muestras.filter((m) => m.obtenida).length;
  if (obtenidas === muestras.length) return "green";
  if (obtenidas > 0) return "amber";
  return "gray";
}

export function humanizeCampo(campo: string) {
  return campo
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
