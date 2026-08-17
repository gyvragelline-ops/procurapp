export type EstadoEtapa = "green" | "amber" | "red" | "gray";

export type TipoProcuracion = "multiorganico" | "corneas";

export const STAGES_MULTIORGANICO: { key: string; label: string }[] = [
  { key: "potencial", label: "Potencial donante" },
  { key: "me", label: "Diagnóstico ME" },
  { key: "certificacion", label: "Certificación" },
  { key: "comMuerte", label: "Comunicación de muerte" },
  { key: "comDonacion", label: "Comunicación de donación" },
  { key: "muestras", label: "Muestras" },
  { key: "documentacion", label: "Documentación" },
  { key: "estudios", label: "Estudios" },
  { key: "judicial", label: "Intervención judicial" },
  { key: "mantenimiento", label: "Mantenimiento" },
  { key: "organos", label: "Evaluación multiorgánica" },
  { key: "quirofano", label: "Quirófano" },
];

export const STAGES_CORNEAS: { key: string; label: string }[] = [
  { key: "potencial", label: "Potencial donante" },
  { key: "me", label: "Diagnóstico ME" },
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
  "muestras",
  "documentacion",
  "estudios",
  "mantenimiento",
  "organos",
  "quirofano",
];

export const STRIP_STAGES_CORNEAS = ["me", "comMuerte", "muestras", "documentacion", "entregaCorneas"];

export function stripStagesForTipo(tipo: TipoProcuracion | null | undefined) {
  return tipo === "corneas" ? STRIP_STAGES_CORNEAS : STRIP_STAGES_MULTIORGANICO;
}

export const STRIP_LABELS: Record<string, string> = {
  me: "ME",
  certificacion: "Cert",
  comMuerte: "Fam",
  muestras: "Mstr",
  documentacion: "Doc",
  estudios: "Est",
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
  documentacion: ["doppler"],
  estudios: ["op2_p3", "op2_p4"],
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

export const REFLEJOS_ME: { key: string; label: string }[] = [
  { key: "reflejo_fotomotor", label: "Fotomotor" },
  { key: "reflejo_corneano", label: "Corneano" },
  { key: "reflejo_oculocefalico", label: "Oculocefálico" },
  { key: "reflejo_oculovestibular", label: "Oculovestibular" },
  { key: "reflejo_nauseoso", label: "Nauseoso" },
  { key: "reflejo_deglutorio", label: "Deglutorio" },
  { key: "reflejo_maseterino", label: "Maseterino" },
  { key: "reflejo_dolor", label: "Respuesta al dolor" },
  { key: "reflejo_osteotendinosos", label: "Osteotendinosos" },
  { key: "reflejo_plantar", label: "Plantar" },
  { key: "reflejo_cremasteriano", label: "Cremasteriano" },
  { key: "reflejo_cutaneoabdominal", label: "Cutáneo-abdominales" },
];

export const ME_CAMPO_KEYS = [
  "hora_evaluacion_1",
  "hora_evaluacion_2",
  "tipo_test_confirmacion",
  "apneica1_pco2_inicial",
  "apneica1_pco2_final",
  "fc_inicial",
  "fc_final",
  ...REFLEJOS_ME.map((r) => r.key),
];

export type MeCampos = Record<string, string | null>;

export function computeMeEstado(campos: MeCampos): EstadoEtapa {
  const horasOk = !!campos.hora_evaluacion_1 && !!campos.hora_evaluacion_2;
  const reflejosOk = REFLEJOS_ME.every((r) => campos[r.key] === "ausente" || campos[r.key] === "presente");
  let testOk = false;
  if (campos.tipo_test_confirmacion === "apnea") {
    testOk = !!campos.apneica1_pco2_inicial && !!campos.apneica1_pco2_final;
  } else if (campos.tipo_test_confirmacion === "atropina") {
    testOk = !!campos.fc_inicial && !!campos.fc_final;
  }
  if (horasOk && reflejosOk && testOk) return "green";
  const algoCargado =
    campos.hora_evaluacion_1 ||
    campos.hora_evaluacion_2 ||
    campos.tipo_test_confirmacion ||
    REFLEJOS_ME.some((r) => campos[r.key]);
  return algoCargado ? "amber" : "gray";
}

export function humanizeCampo(campo: string) {
  return campo
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
