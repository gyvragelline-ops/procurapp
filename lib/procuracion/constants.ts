export type EstadoEtapa = "green" | "amber" | "red" | "gray";

export const STAGES: { key: string; label: string }[] = [
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

export const STRIP_STAGES = [
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

export function humanizeCampo(campo: string) {
  return campo
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
