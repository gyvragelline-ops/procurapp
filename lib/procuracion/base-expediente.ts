// Base operativa · Expediente: "11 · Mantenimiento por sistema". Lógica
// pura, con tests. Cada valor va con su hora y su origen (enfermería /
// médico / laboratorio), en crudo. La referencia (mantenimiento-metas.ts)
// es solo eso: referencia; la aptitud del órgano la decide cada equipo.
//
// Origen por tabla: mantenimiento_registros = enfermería (también las
// columnas viejas de monitoreo avanzado que vivían en esa planilla);
// mantenimiento_medico y mantenimiento_respirador = médico;
// laboratorio_valores = laboratorio (o enfermería si así se cargó, p. ej.
// glucemia capilar de la fila horaria).

import { balancePorHora, disfuncionMiocardica, estadoBombas, pafiConRespirador, type BombaHora, type EventoRespirador, type FilaHoraria, type InfusionFila, type MedicionMedico } from "./mantenimiento-calculos.ts";
import { BOLOS, DROGAS_INFUSION, MODOS_RESPIRADOR, type ClaveMeta, type DrogaBolo, type DrogaInfusion } from "./mantenimiento-metas.ts";
import { textoRangoMeta } from "./mantenimiento-tendencias.ts";

export type Origen = "enfermeria" | "medico" | "laboratorio";
export const ETIQUETA_ORIGEN: Record<Origen, string> = { enfermeria: "Enfermería", medico: "Médico", laboratorio: "Laboratorio" };

// Un dato crudo: número (o texto, p. ej. modo del respirador o sedimento),
// con su hora y su origen. Nunca hay valor sin hora ni origen. `unidad`:
// la que se guardó con el valor (laboratorio: troponina y CPK-MB la elige
// el procurador); viaja SIEMPRE pegada al valor, en pantalla y en el CSV.
export type Dato = { valor: number | string; en: string; origen: Origen; unidad?: string | null };

// Configuración del médico (mantenimiento_config), con su hora.
export type ConfigExpediente = {
  corazon_candidato: "si" | "no" | "sin_definir";
  pulmon_candidato: "si" | "no" | "sin_definir";
  monitoreo_avanzado_activo: boolean;
  updated_at: string;
};

type RegistroFuente = FilaHoraria & Record<string, unknown>;
type LabFuente = { parametro: string; valor: number | null; valor_texto?: string | null; unidad: string | null; medido_en: string; anulado: boolean; toma_id: string; origen?: "laboratorio" | "enfermeria" | null };

export type FuentesExpediente = {
  registros: RegistroFuente[];
  mediciones: MedicionMedico[];
  respirador: EventoRespirador[];
  lab: LabFuente[];
  bombas: BombaHora[];
  infusiones: InfusionFila[];
  pesoKg: number | null;
  config?: ConfigExpediente | null;
};

export type Parametro = {
  clave: string;
  etiqueta: string;
  unidad: string | null;
  decimales: number;
  meta?: ClaveMeta;
  sinCambio?: true; // volúmenes por registro, textos: el "cambio en 12 h" no aplica
};

const p = (clave: string, etiqueta: string, unidad: string | null, decimales = 0, meta?: ClaveMeta): Parametro => ({ clave, etiqueta, unidad, decimales, meta });
const fijo = (x: Parametro): Parametro => ({ ...x, sinCambio: true });
const bolo = (d: DrogaBolo) => fijo(p(`bolo:${d}`, `${BOLOS[d].etiqueta} (bolo)`, BOLOS[d].unidad, 1));
const config = (clave: keyof Omit<ConfigExpediente, "updated_at">, etiqueta: string) => fijo(p(`config:${clave}`, etiqueta, null));

// Drogas por sistema (dosis vigente según bombas + dilución).
const DROGAS_HEMODINAMICO: DrogaInfusion[] = ["noradrenalina", "adrenalina", "dopamina", "dobutamina", "isoproterenol", "esmolol", "amiodarona", "vasopresina"];
const DROGAS_RENAL: DrogaInfusion[] = ["furosemida"];
const DROGAS_METABOLICO: DrogaInfusion[] = ["insulina", "potasio", "bicarbonato", "hidrocortisona", "dexametasona"];
const drogas = (xs: DrogaInfusion[]) => xs.map((d) => p(`droga:${d}`, DROGAS_INFUSION[d].etiqueta, DROGAS_INFUSION[d].unidadDosis, 2, d === "noradrenalina" ? "noradrenalina" : undefined));

export const SISTEMAS: { key: string; titulo: string; parametros: Parametro[] }[] = [
  {
    key: "hemodinamico",
    titulo: "Hemodinámico",
    parametros: [
      p("pam", "PAM", "mmHg", 0, "pam"),
      p("fc", "FC", "lpm", 0, "fc"),
      p("pvc", "PVC", "cmH2O", 0, "pvc"),
      p("gc", "Gasto cardíaco", "L/min", 1),
      p("ic_medido", "Índice cardíaco", "L/min/m²", 1, "ic"),
      p("sat_venosa", "SvO2", "%", 0),
      p("delta_pp", "ΔPP", "%", 0),
      p("delta_vs", "ΔVS", "%", 0),
      p("delta_co2_espirado", "Δ CO2 espirado", "%", 0),
      p("indice_vena_cava", "Índice de vena cava", "%", 0),
      p("resultado_pasivo_miembros", "Elevación pasiva de miembros", "% del VS o GC", 0),
      fijo(p("disfuncion_miocardica", "Disfunción miocárdica", null)),
      ...drogas(DROGAS_HEMODINAMICO),
      bolo("esmolol"),
      bolo("vasopresina"),
      p("troponina", "Troponina", null, 2),
      p("cpk_mb", "CPK-MB", null, 1),
      config("corazon_candidato", "Corazón candidato"),
      config("monitoreo_avanzado_activo", "Monitoreo avanzado activo"),
    ],
  },
  {
    key: "respiratorio",
    titulo: "Respiratorio",
    parametros: [
      p("sat_o2", "SatO2", "%", 0, "sat_o2"),
      p("modo", "Modo", null),
      p("fio2", "FiO2", "%", 0),
      p("peep", "PEEP", "cmH2O", 0),
      p("volumen_corriente", "Volumen corriente", "mL", 0),
      p("frecuencia", "Frecuencia respiratoria", "rpm", 0),
      p("presion_plateau", "Presión plateau", "cmH2O", 0),
      p("presion_pico", "Presión pico", "cmH2O", 0),
      p("ph", "pH", null, 2, "ph"),
      p("pao2", "PaO2", "mmHg", 0),
      p("pafi", "PaFi", null, 0, "pafi"),
      config("pulmon_candidato", "Pulmón candidato"),
    ],
  },
  {
    key: "renal",
    titulo: "Renal y balance",
    parametros: [
      p("diuresis_ml", "Diuresis (mL del registro)", "mL", 0),
      fijo(p("ing_sol_09_ml", "Ingreso: solución 0,9 %", "mL", 0)),
      fijo(p("ing_ringer_ml", "Ingreso: Ringer lactato", "mL", 0)),
      fijo(p("ing_sol_medio_ml", "Ingreso: solución al medio (0,45 %)", "mL", 0)),
      fijo(p("ing_dextrosa_ml", "Ingreso: dextrosa", "mL", 0)),
      fijo(p("ing_hemoderivados_ml", "Ingreso: hemoderivados", "mL", 0)),
      fijo(p("egr_sng_drenajes_ml", "Egreso: SNG / drenajes", "mL", 0)),
      fijo(p("perdidas_insensibles_ml", "Egreso: pérdidas insensibles (cargadas a mano)", "mL", 0)),
      p("balance_acumulado", "Balance acumulado", "mL", 0),
      ...drogas(DROGAS_RENAL),
      bolo("furosemida"),
      p("urea", "Urea", "mg/dL", 0),
      p("creatinina", "Creatinina", "mg/dL", 2),
      p("osm_serica", "Osmolaridad sérica", "mOsm/kg", 0),
      p("osm_urinaria", "Osmolaridad urinaria", "mOsm/kg", 0),
      p("densidad_urinaria", "Densidad urinaria", null, 3),
      p("sedimento", "Sedimento urinario", null),
    ],
  },
  {
    key: "metabolico",
    titulo: "Metabólico y temperatura",
    parametros: [
      p("temperatura", "Temperatura", "°C", 1, "temperatura"),
      p("na", "Sodio", "mEq/L", 0, "sodio"),
      p("k", "Potasio", "mEq/L", 1, "potasio"),
      p("glucemia", "Glucemia", "mg/dL", 0, "glucemia"),
      p("amilasa", "Amilasa", "U/L", 0),
      ...drogas(DROGAS_METABOLICO),
      bolo("desmopresina"),
    ],
  },
  {
    key: "hepatico",
    titulo: "Hepático y hematológico",
    parametros: [
      p("tgo", "TGO (AST)", "U/L", 0),
      p("tgp", "TGP (ALT)", "U/L", 0),
      p("bili_total", "Bilirrubina total", "mg/dL", 1),
      p("bili_directa", "Bilirrubina directa", "mg/dL", 1),
      p("fal", "Fosfatasa alcalina", "U/L", 0),
      p("ggt", "GGT", "U/L", 0),
      p("tp", "Tiempo de protrombina", "%", 0),
      p("rin", "RIN", null, 2),
      p("kptt", "KPTT", "s", 0),
      p("fibrinogeno", "Fibrinógeno", "mg/dL", 0),
      p("hb", "Hb", "g/dL", 1),
      p("hto", "Hematocrito", "%", 0),
      p("gb", "Glóbulos blancos", "/mm³", 0),
      p("plaquetas", "Plaquetas", "/mm³", 0),
    ],
  },
  {
    key: "infeccioso",
    titulo: "Infeccioso",
    parametros: [p("temperatura", "Temperatura", "°C", 1, "temperatura"), p("gb", "Glóbulos blancos", "/mm³", 0)],
  },
];

// Columnas de la planilla de enfermería y del médico que se muestran.
const CAMPOS_REGISTRO = [
  "fc", "pam", "temperatura", "sat_o2", "fio2", "peep", "volumen_corriente", "diuresis_ml", "osm_urinaria", "osm_serica", "densidad_urinaria",
  "pvc", "gc", "ic_medido", "sat_venosa", "delta_pp", "delta_vs", "delta_co2_espirado", "indice_vena_cava", "resultado_pasivo_miembros",
  "ing_sol_09_ml", "ing_ringer_ml", "ing_sol_medio_ml", "ing_dextrosa_ml", "ing_hemoderivados_ml", "egr_sng_drenajes_ml", "perdidas_insensibles_ml",
];
const CAMPOS_MEDICO = ["pvc", "gc", "ic_medido", "sat_venosa", "delta_pp", "delta_vs", "delta_co2_espirado", "indice_vena_cava", "resultado_pasivo_miembros"];
const SI_NO_SD: Record<string, string> = { si: "Sí", no: "No", sin_definir: "Sin definir" };
const CAMPOS_RESPIRADOR = ["fio2", "peep", "volumen_corriente", "frecuencia", "presion_plateau", "presion_pico"] as const;

const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const porHora = (xs: Dato[]) => [...xs].sort((a, b) => a.en.localeCompare(b.en));

// Todos los datos de un parámetro, de todas las fuentes, del más viejo al
// más nuevo. Anulados afuera.
export function serie(clave: string, f: FuentesExpediente, ahora: number): Dato[] {
  const r: Dato[] = [];
  if (clave.startsWith("droga:")) {
    const droga = clave.slice(6) as DrogaInfusion;
    const b = estadoBombas({ registros: f.registros, bombas: f.bombas, infusiones: f.infusiones, pesoKg: f.pesoKg, ahora }).porDroga[droga];
    if (b?.dosis) r.push({ valor: b.dosis.dosis, en: b.momento, origen: "enfermeria" });
    return r;
  }
  if (clave.startsWith("bolo:")) {
    const droga = clave.slice(5) as DrogaBolo;
    for (const x of f.infusiones) {
      if (!x.anulado && x.tipo === "bolo" && x.droga === droga && x.dosis_calculada !== null)
        r.push({ valor: x.dosis_calculada, en: x.registrado_en, origen: "enfermeria", unidad: BOLOS[droga].unidad });
    }
    return porHora(r);
  }
  if (clave === "disfuncion_miocardica") {
    const d = disfuncionMiocardica(f.mediciones);
    if (d.estado !== "sin_evaluar") r.push({ valor: d.estado === "si" ? "Sí" : "No", en: d.registrado_en, origen: "medico" });
    return r;
  }
  if (clave.startsWith("config:")) {
    const c = f.config;
    if (!c) return r;
    const campo = clave.slice(7) as keyof Omit<ConfigExpediente, "updated_at">;
    const v = c[campo];
    r.push({ valor: typeof v === "boolean" ? (v ? "Sí" : "No") : SI_NO_SD[v] ?? v, en: c.updated_at, origen: "medico" });
    return r;
  }
  if (clave === "balance_acumulado") {
    const bal = balancePorHora(f.registros, f.bombas, f.pesoKg, ahora);
    const ultima = [...bal.horas].reverse().find((h) => h.estado === "cargada");
    if (ultima && ultima.estado === "cargada") r.push({ valor: bal.acumulado, en: ultima.registrado_en, origen: "enfermeria" });
    return r;
  }
  if (clave === "pafi") {
    const x = pafiConRespirador(f.lab, f.respirador, f.registros as never, ahora);
    if (x) r.push({ valor: x.valor, en: x.medido_en, origen: "laboratorio" });
    return r;
  }
  if (clave === "modo") {
    for (const e of f.respirador) {
      if (e.anulado || !e.modo) continue;
      const etiqueta = e.modo === "otro" ? e.modo_otro ?? "Otro" : MODOS_RESPIRADOR.find((m) => m.valor === e.modo)?.etiqueta ?? e.modo;
      r.push({ valor: etiqueta, en: e.registrado_en, origen: "medico" });
    }
    return porHora(r);
  }
  if (CAMPOS_REGISTRO.includes(clave)) {
    for (const x of f.registros) {
      const v = numero((x as Record<string, unknown>)[clave]);
      if (!x.anulado && v !== null) r.push({ valor: v, en: x.registrado_en, origen: "enfermeria" });
    }
  }
  if (CAMPOS_MEDICO.includes(clave)) {
    for (const x of f.mediciones) {
      const v = numero((x as Record<string, unknown>)[clave]);
      if (!x.anulado && v !== null) r.push({ valor: v, en: x.registrado_en, origen: "medico" });
    }
  }
  if ((CAMPOS_RESPIRADOR as readonly string[]).includes(clave)) {
    for (const x of f.respirador) {
      const v = numero((x as Record<string, unknown>)[clave]);
      if (!x.anulado && v !== null) r.push({ valor: v, en: x.registrado_en, origen: "medico" });
    }
  }
  // La FiO2 "de la gasometría" (lab) es la de esa extracción y se usa para
  // la PaFi; la fila FiO2 muestra la del respirador / enfermería.
  if (clave === "fio2") return porHora(r);
  for (const x of f.lab) {
    if (x.anulado || x.parametro !== clave) continue;
    const valor = x.valor ?? x.valor_texto ?? null;
    if (valor !== null && valor !== "") r.push({ valor, en: x.medido_en, origen: x.origen === "enfermeria" ? "enfermeria" : "laboratorio", unidad: x.unidad });
  }
  return porHora(r);
}

// Unidad efectiva de un dato: la guardada con el valor o, si no tiene, la
// del parámetro.
export const unidadDe = (d: Dato, porDefecto: string | null = null) => d.unidad ?? porDefecto;

// Cambio en 12 h: último valor menos el PRIMERO dentro de las últimas
// 12 h (hacen falta al menos dos números en la ventana). Si en la ventana
// hay unidades distintas (p. ej. troponina en ng/mL y en ng/L) NO se
// calcula: restar entre unidades distintas daría un número falso.
export function cambio12h(datos: Dato[], ahora: number, unidadPorDefecto: string | null = null): number | null {
  const desde = ahora - 12 * 3_600_000;
  const v = porHora(datos).filter((d) => typeof d.valor === "number" && new Date(d.en).getTime() > desde && new Date(d.en).getTime() <= ahora);
  if (v.length < 2) return null;
  if (new Set(v.map((d) => unidadDe(d, unidadPorDefecto))).size > 1) return null;
  return (v[v.length - 1].valor as number) - (v[0].valor as number);
}
export function unidadesMezcladas(datos: Dato[], ahora: number, unidadPorDefecto: string | null = null): boolean {
  const desde = ahora - 12 * 3_600_000;
  const v = datos.filter((d) => typeof d.valor === "number" && new Date(d.en).getTime() > desde && new Date(d.en).getTime() <= ahora);
  return new Set(v.map((d) => unidadDe(d, unidadPorDefecto))).size > 1;
}

export type FilaSistema = {
  clave: string;
  etiqueta: string;
  unidad: string | null;
  decimales: number;
  ultimo: Dato | null;
  cambio12h: number | null;
  referencia: string | null;
  nota: string | null; // dato crudo extra: mL/h de la bomba, cantidad de bolos, unidades distintas
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const mlh = (n: number) => `${String(n).replace(".", ",")} mL/h`;

export function filaParametro(par: Parametro, f: FuentesExpediente, ahora: number): FilaSistema {
  const base = { clave: par.clave, etiqueta: par.etiqueta, decimales: par.decimales, referencia: par.meta ? textoRangoMeta(par.meta) || null : null };
  // Bomba: la dosis calculada con su unidad y, al lado, los mL/h crudos.
  // Si corre pero no hay dosis (falta dilución o peso), se ven los mL/h.
  if (par.clave.startsWith("droga:")) {
    const b = estadoBombas({ registros: f.registros, bombas: f.bombas, infusiones: f.infusiones, pesoKg: f.pesoKg, ahora }).porDroga[par.clave.slice(6) as DrogaInfusion];
    if (!b) return { ...base, unidad: par.unidad, ultimo: null, cambio12h: null, nota: null };
    if (b.dosis) return { ...base, unidad: b.dosis.unidad, ultimo: { valor: b.dosis.dosis, en: b.momento, origen: "enfermeria", unidad: b.dosis.unidad }, cambio12h: null, nota: mlh(b.velocidadMlH) };
    return {
      ...base,
      unidad: "mL/h",
      ultimo: { valor: b.velocidadMlH, en: b.momento, origen: "enfermeria", unidad: "mL/h" },
      cambio12h: null,
      nota: b.estado === "falta_peso" ? "sin dosis: falta el peso" : "sin dosis: falta la dilución",
      referencia: null,
    };
  }
  const s = serie(par.clave, f, ahora);
  const ultimo = s[s.length - 1] ?? null;
  const desde = ahora - 12 * 3_600_000;
  const nota = par.clave.startsWith("bolo:")
    ? plural(s.filter((d) => new Date(d.en).getTime() > desde).length, "bolo en 12 h", "bolos en 12 h")
    : unidadesMezcladas(s, ahora, par.unidad)
      ? "unidades distintas en 12 h: sin cambio calculado"
      : null;
  return {
    ...base,
    unidad: ultimo ? unidadDe(ultimo, par.unidad) : par.unidad,
    ultimo,
    cambio12h: par.sinCambio ? null : cambio12h(s, ahora, par.unidad),
    nota,
  };
}

// Las tarjetas por sistema. Las drogas y los bolos que no se usaron no se
// listan; el resto de los parámetros se lista siempre (sin dato: "—").
export function mantenimientoPorSistema(f: FuentesExpediente, ahora: number) {
  return SISTEMAS.map((s) => ({
    key: s.key,
    titulo: s.titulo,
    filas: s.parametros.map((par) => filaParametro(par, f, ahora)).filter((x) => !(x.clave.startsWith("droga:") || x.clave.startsWith("bolo:")) || x.ultimo !== null),
  }));
}

// Texto de un número con coma decimal ("36,5"); los textos van tal cual.
export function textoValor(valor: number | string, decimales: number): string {
  if (typeof valor === "string") return valor;
  return valor.toLocaleString("es-AR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales, useGrouping: false });
}
export function textoCambio(c: number | null, decimales: number): string {
  if (c === null) return "—";
  if (c === 0) return "sin cambio";
  return `${c > 0 ? "+" : "−"}${textoValor(Math.abs(c), decimales)}`;
}
