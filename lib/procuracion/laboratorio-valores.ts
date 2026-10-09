import type { SupabaseClient } from "@supabase/supabase-js";
import { guardarConReintento } from "./guardar";

// laboratorio_valores: fuente única de valores de laboratorio (ver
// handoff/mantenimiento.sql). Hoy la carga el formulario mínimo de
// Mantenimiento; a futuro la puede escribir también Laboratorio e
// imágenes. Sin borrado: un valor mal cargado se anula.
//
// Escrituras con guardarConReintento: si fallan TIRAN con el mensaje para
// mostrar -- nunca queda como guardado algo que no llegó a la base.

export type ValorLaboratorio = {
  id: string;
  toma_id: string;
  parametro: string;
  valor: number | null; // null = valor en texto (sedimento urinario)
  valor_texto: string | null;
  unidad: string | null;
  medido_en: string;
  // Quién lo cargó: "enfermeria" (glucemia capilar de la fila horaria) o
  // "laboratorio". null en los valores viejos.
  origen: "laboratorio" | "enfermeria" | null;
  anulado: boolean;
};

// Laboratorios de Mantenimiento, por grupos (tipeados). La unidad se
// guarda con cada valor y se muestra siempre al lado. `unidades`: la
// unidad se ELIGE al cargar (troponina, CPK-MB). `texto`: valor en texto
// libre corto, fuera de las reglas (sedimento urinario).
export type ParametroLab = { parametro: string; etiqueta: string; unidad: string | null; unidades?: string[]; texto?: true };
export const MAX_TEXTO_LAB = 200;
export const GRUPOS_LAB: { grupo: string; parametros: ParametroLab[] }[] = [
  {
    grupo: "Básicos",
    parametros: [
      { parametro: "na", etiqueta: "Sodio", unidad: "mEq/L" },
      { parametro: "k", etiqueta: "Potasio", unidad: "mEq/L" },
      { parametro: "glucemia", etiqueta: "Glucemia", unidad: "mg/dL" },
      { parametro: "ph", etiqueta: "pH", unidad: null },
      { parametro: "pao2", etiqueta: "PaO2", unidad: "mmHg" },
      { parametro: "amilasa", etiqueta: "Amilasa", unidad: "U/L" },
    ],
  },
  {
    grupo: "Hemograma",
    parametros: [
      { parametro: "hb", etiqueta: "Hb", unidad: "g/dL" },
      { parametro: "hto", etiqueta: "Hematocrito", unidad: "%" },
      { parametro: "gb", etiqueta: "Glóbulos blancos", unidad: "/mm³" },
      { parametro: "plaquetas", etiqueta: "Plaquetas", unidad: "/mm³" },
    ],
  },
  {
    grupo: "Hepatograma",
    parametros: [
      { parametro: "tgo", etiqueta: "TGO (AST)", unidad: "U/L" },
      { parametro: "tgp", etiqueta: "TGP (ALT)", unidad: "U/L" },
      { parametro: "bili_total", etiqueta: "Bilirrubina total", unidad: "mg/dL" },
      { parametro: "bili_directa", etiqueta: "Bilirrubina directa", unidad: "mg/dL" },
      { parametro: "fal", etiqueta: "Fosfatasa alcalina", unidad: "U/L" },
      { parametro: "ggt", etiqueta: "GGT", unidad: "U/L" },
    ],
  },
  {
    grupo: "Coagulograma",
    parametros: [
      { parametro: "tp", etiqueta: "Tiempo de protrombina", unidad: "%" },
      { parametro: "rin", etiqueta: "RIN", unidad: null },
      { parametro: "kptt", etiqueta: "KPTT", unidad: "s" },
      { parametro: "fibrinogeno", etiqueta: "Fibrinógeno", unidad: "mg/dL" },
    ],
  },
  {
    grupo: "Diabetes insípida",
    parametros: [
      { parametro: "osm_serica", etiqueta: "Osmolaridad sérica", unidad: "mOsm/kg" },
      { parametro: "osm_urinaria", etiqueta: "Osmolaridad urinaria", unidad: "mOsm/kg" },
      { parametro: "densidad_urinaria", etiqueta: "Densidad urinaria", unidad: null },
    ],
  },
  {
    grupo: "Corazón",
    parametros: [
      { parametro: "troponina", etiqueta: "Troponina", unidad: null, unidades: ["ng/mL", "ng/L"] },
      { parametro: "cpk_mb", etiqueta: "CPK-MB", unidad: null, unidades: ["U/L", "ng/mL"] },
    ],
  },
  {
    grupo: "Riñón",
    parametros: [
      { parametro: "urea", etiqueta: "Urea", unidad: "mg/dL" },
      { parametro: "creatinina", etiqueta: "Creatinina", unidad: "mg/dL" },
    ],
  },
  {
    grupo: "Orina",
    parametros: [{ parametro: "sedimento", etiqueta: "Sedimento urinario", unidad: null, texto: true }],
  },
];

// Todos los parámetros (para etiquetas), más la FiO2 de tomas viejas
// (hoy la FiO2 de la PaFi sale del respirador).
export const PARAMETROS_LAB_MANTENIMIENTO: ParametroLab[] = [
  ...GRUPOS_LAB.flatMap((g) => g.parametros),
  { parametro: "fio2", etiqueta: "FiO2 de la gasometría", unidad: "%" },
];

const COLUMNAS = "id, toma_id, parametro, valor, valor_texto, unidad, medido_en, origen, anulado";

export async function cargarLaboratorioValores(supabase: SupabaseClient, donanteId: string): Promise<ValorLaboratorio[]> {
  const { data, error } = await supabase
    .from("laboratorio_valores")
    .select(COLUMNAS)
    .eq("donante_id", donanteId)
    .order("medido_en", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar los valores de laboratorio: ${error.message}`);
  return (data as ValorLaboratorio[]) ?? [];
}

// Una extracción: todos sus valores con el mismo toma_id y la misma hora
// (así PaO2 y FiO2 se emparejan para la PaFi).
export async function guardarTomaLaboratorio(
  supabase: SupabaseClient,
  donanteId: string,
  medidoEn: string,
  valores: { parametro: string; valor: number | null; unidad: string | null; valor_texto?: string | null }[],
  origen: "laboratorio" | "enfermeria" = "laboratorio"
): Promise<ValorLaboratorio[]> {
  if (valores.length === 0) throw new Error("Cargá al menos un valor.");
  const tomaId = crypto.randomUUID();
  const filas = valores.map((v) => ({ donante_id: donanteId, toma_id: tomaId, medido_en: medidoEn, origen, ...v }));
  const r = await guardarConReintento(() => supabase.from("laboratorio_valores").insert(filas).select(COLUMNAS));
  if (!r.ok) throw new Error(r.mensaje);
  return (r.resultado.data as ValorLaboratorio[]) ?? [];
}

// Glucemia suelta desde la fila horaria, con su propia hora de medición
// (editable; NO es la hora de la fila). Mismo parámetro que la de
// laboratorio: el tablero y el score leen la última de las dos.
export async function guardarGlucemia(
  supabase: SupabaseClient,
  donanteId: string,
  valor: number,
  medidoEn: string,
  origen: "laboratorio" | "enfermeria"
): Promise<ValorLaboratorio> {
  const [v] = await guardarTomaLaboratorio(supabase, donanteId, medidoEn, [{ parametro: "glucemia", valor, unidad: "mg/dL" }], origen);
  return v;
}

// Única edición permitida (por permisos de la base): marcar anulado.
// "Corregir" = anular y cargar uno nuevo.
export async function anularValorLaboratorio(supabase: SupabaseClient, id: string): Promise<void> {
  const r = await guardarConReintento(() => supabase.from("laboratorio_valores").update({ anulado: true }).eq("id", id));
  if (!r.ok) throw new Error(r.mensaje);
}
