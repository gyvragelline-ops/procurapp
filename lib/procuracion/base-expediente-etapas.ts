// Base operativa · Expediente: lo que cargó el procurador en cada etapa
// (02 neurológico, 03 métodos auxiliares, 05 familiar y comunicación,
// 06 muestras, 07 medidas, 10 fotos), en crudo y tal como lo cargó.
// Lógica pura, con tests. Nada se interpreta: si un campo está vacío, se
// muestra "—".

import { METODOS_CERT_AUX, REFLEJOS_ME, reflejoKey } from "./constants.ts";
import { CAMPOS_PLANILLA } from "./medidas-campos.ts";
import { ETAPAS_EMOCIONALES } from "./comunicacion-donacion.ts";

type Campos = Record<string, string | null | undefined>;
const v = (c: Campos, k: string) => {
  const x = c[k];
  return x === null || x === undefined || String(x).trim() === "" ? null : String(x);
};
const siNoPar = (c: Campos, base: string): "Sí" | "No" | null => (c[`${base}_si`] === "si" ? "Sí" : c[`${base}_no`] === "si" ? "No" : null);

// ------------------------------------------------- 01 potencial donante
// Antecedentes: texto libre tal como lo escribió el procurador.
export const textoAntecedentes = (x: string | null | undefined) => (x && x.trim() ? x : "Sin cargar");

// ------------------------------------------------- 02 examen neurológico
export type Evaluacion = {
  momento: "1ª" | "2ª";
  hora: string | null;
  tam: string | null;
  temperaturaCentral: string | null;
  diabetesInsipida: "Sí" | "No" | null;
  pupilas: string | null;
  reflejos: { etiqueta: string; tronco: boolean; valor: "ausente" | "presente" | null }[];
};

export function neurologico(c: Campos) {
  const evaluacion = (m: "1a" | "2a"): Evaluacion => ({
    momento: m === "1a" ? "1ª" : "2ª",
    hora: v(c, `hora_${m}`),
    tam: v(c, `ta_tam_${m}`),
    temperaturaCentral: v(c, `t_central_${m}`),
    diabetesInsipida: siNoPar(c, `diabetes_insipida_${m}`),
    pupilas: v(c, `pupilas_${m}`),
    reflejos: REFLEJOS_ME.map((r) => {
      const x = c[reflejoKey(r.key, m)];
      return { etiqueta: r.label, tronco: r.grupo === "B", valor: x === "ausente" || x === "presente" ? x : null };
    }),
  });
  const tipo = c.tipo_test_confirmacion === "apnea" || c.tipo_test_confirmacion === "atropina" ? c.tipo_test_confirmacion : null;
  return {
    fechaExamen: v(c, "fecha_examen"),
    evaluaciones: [evaluacion("1a"), evaluacion("2a")],
    test: {
      tipo,
      apnea: { pco2Inicial: v(c, "apneica1_pco2_inicial"), pco2Final: v(c, "apneica1_pco2_final"), duracion: v(c, "apneica1_duracion"), resultado: v(c, "apneica1_resultado") },
      atropina: { fcInicial: v(c, "fc_inicial"), fcFinal: v(c, "fc_final"), fecha: v(c, "atropina_fecha"), hora: v(c, "atropina_hora"), duracion: v(c, "atropina_duracion") },
    },
    causaComa: v(c, "causa_coma"),
    armDesde: v(c, "arm_fecha_hs"),
    estudiosComplementarios: v(c, "estudios_complementarios"),
    cumpleMe: siNoPar(c, "cumple_me"),
    noCumpleMotivo: v(c, "no_cumple_motivo"),
  };
}

// Campos de cierre (planilla "certificado").
export function cierreCertificado(c: Campos) {
  return { medico1: v(c, "medico1_nombre"), medico2: v(c, "medico2_nombre"), archivoLugar: v(c, "archivo_lugar") };
}

// ------------------------------------------- 03 métodos auxiliares
// Mismos textos que el panel del procurador (cert-aux-panel.tsx).
const ESTADO_METODO: Record<string, string> = { completo: "Completo", pendiente: "Pendiente", no_corresponde: "No corresponde" };

export type FilaCertAux = { item_key: string; estado: string | null; meta?: Record<string, unknown> | null };

export function metodosAuxiliares(estados: FilaCertAux[], neuro: Campos, doppler: Campos) {
  const est = (k: string) => estados.find((e) => e.item_key === k);
  const angio = (est("angiografia_cerebral")?.meta ?? {}) as Record<string, unknown>;
  const s = (x: unknown) => (typeof x === "string" && x.trim() ? x : null);
  const fechaDoppler = [v(doppler, "fecha_dia"), v(doppler, "fecha_mes"), v(doppler, "fecha_anio")].every(Boolean)
    ? `${v(doppler, "fecha_dia")}/${v(doppler, "fecha_mes")}/${v(doppler, "fecha_anio")}`
    : null;
  const detalle: Record<string, { fecha: string | null; hora: string | null; informe: string | null; extra: { etiqueta: string; valor: string | null }[] }> = {
    eeg: { fecha: v(neuro, "eeg1_fecha"), hora: v(neuro, "eeg1_hora"), informe: v(neuro, "eeg1_informe"), extra: [] },
    potenciales_evocados: {
      fecha: v(neuro, "potenciales_fecha"),
      hora: v(neuro, "potenciales_hora"),
      informe: null,
      extra: [
        { etiqueta: "PEAT (auditivos)", valor: v(neuro, "peat") },
        { etiqueta: "PESS (somato-sensitivos)", valor: v(neuro, "pess") },
        { etiqueta: "PEV (visuales)", valor: v(neuro, "pev") },
      ],
    },
    doppler_transcraneano: { fecha: fechaDoppler, hora: v(doppler, "fecha_hora_top"), informe: v(doppler, "interpretacion_resto"), extra: [] },
    angiografia_cerebral: { fecha: s(angio.fecha), hora: s(angio.hora), informe: s(angio.informe), extra: [] },
  };
  return METODOS_CERT_AUX.map((m) => {
    const e = est(m.key)?.estado ?? null;
    return { key: m.key, etiqueta: m.label, estado: e ? ESTADO_METODO[e] ?? e : null, ...detalle[m.key] };
  });
}

// ------------------------------------ 05 familiar y comunicación
// Familiar de contacto: iniciales (del servidor), nunca nombre ni DNI.
export type Familiar = { iniciales: string | null; parentesco: string | null; direccion: string | null; telefono: string | null };
export function familiarDeContacto(f: Partial<Familiar> | null) {
  const x = (k: keyof Familiar) => (f && f[k] && String(f[k]).trim() ? String(f[k]) : null);
  return [
    { etiqueta: "Iniciales", valor: x("iniciales") },
    { etiqueta: "Parentesco", valor: x("parentesco") },
    { etiqueta: "Dirección", valor: x("direccion") },
    { etiqueta: "Celular", valor: x("telefono") },
  ];
}

export type AnalisisComunicacion = { id: string; texto: string; etapa_detectada: number | null; created_at: string };
export function analisisComunicacion(xs: AnalisisComunicacion[]) {
  return [...xs]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((a) => ({
      id: a.id,
      en: a.created_at,
      texto: a.texto,
      etapa: a.etapa_detectada === null ? null : `${a.etapa_detectada}. ${ETAPAS_EMOCIONALES.find((e) => e.id === a.etapa_detectada)?.nombre ?? "—"}`,
    }));
}

// ------------------------------------------------------- 06 muestras
export function muestrasPorPaquete(xs: { paquete_key: string; nombre: string; obtenida: boolean; retirada: boolean }[]) {
  return xs.map((m) => ({ key: m.paquete_key, nombre: m.nombre, estado: m.retirada ? "Retirada" : m.obtenida ? "Obtenida" : "Pendiente" }));
}

// --------------------------------------------- 07 medidas antropométricas
export function medidas(campos: Campos, talla: number | null, peso: number | null) {
  return [
    { etiqueta: "Peso", valor: peso === null ? null : `${String(peso).replace(".", ",")} kg` },
    { etiqueta: "Talla", valor: talla === null ? null : `${String(talla).replace(".", ",")} cm` },
    ...CAMPOS_PLANILLA.map((c) => ({ etiqueta: c.label, valor: v(campos, c.key) ? `${v(campos, c.key)} cm` : null })),
  ];
}

// ------------------------------------- 01 fotos de DNI y de grupo y factor
// (se cargan en 01 Potencial donante; antes estaban en 10 Documentación)
export const FOTOS_DOCUMENTACION = [
  { tipo: "dni", etiqueta: "Foto del DNI", soloBase: true },
  { tipo: "grupo_factor", etiqueta: "Foto de grupo y factor", soloBase: false },
] as const;

export function fotosDocumentacion(xs: { tipo: string; created_at: string; cargado_por_rol: string | null; archivo_url?: string | null }[]) {
  return FOTOS_DOCUMENTACION.map((f) => {
    const deTipo = xs.filter((x) => x.tipo === f.tipo).sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { ...f, cantidad: deTipo.length, ultima: deTipo[0] ?? null };
  });
}
