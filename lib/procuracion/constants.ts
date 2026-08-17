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

export type MeCampos = {
  tipo_diagnostico: string | null;
  hora_evaluacion_1: string | null;
  hora_evaluacion_2: string | null;
};

export function computeMeEstado(campos: MeCampos): EstadoEtapa {
  if (!campos.tipo_diagnostico) return "gray";
  if (campos.tipo_diagnostico === "neurologica") {
    return campos.hora_evaluacion_1 && campos.hora_evaluacion_2 ? "green" : "amber";
  }
  return campos.hora_evaluacion_1 ? "green" : "amber";
}

export function humanizeCampo(campo: string) {
  return campo
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
