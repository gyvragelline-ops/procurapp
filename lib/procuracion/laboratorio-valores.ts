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
  valor: number;
  unidad: string | null;
  medido_en: string;
  anulado: boolean;
};

// Parámetros que carga hoy el formulario de Mantenimiento.
export const PARAMETROS_LAB_MANTENIMIENTO: { parametro: string; etiqueta: string; unidad: string | null }[] = [
  { parametro: "na", etiqueta: "Sodio", unidad: "mEq/L" },
  { parametro: "k", etiqueta: "Potasio", unidad: "mEq/L" },
  { parametro: "glucemia", etiqueta: "Glucemia", unidad: "mg/dL" },
  { parametro: "ph", etiqueta: "pH", unidad: null },
  { parametro: "pao2", etiqueta: "PaO2", unidad: "mmHg" },
  { parametro: "fio2", etiqueta: "FiO2 de la gasometría", unidad: "%" },
  { parametro: "hb", etiqueta: "Hb", unidad: "g/dL" },
];

const COLUMNAS = "id, toma_id, parametro, valor, unidad, medido_en, anulado";

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
  valores: { parametro: string; valor: number; unidad: string | null }[]
): Promise<ValorLaboratorio[]> {
  if (valores.length === 0) throw new Error("Cargá al menos un valor.");
  const tomaId = crypto.randomUUID();
  const filas = valores.map((v) => ({ donante_id: donanteId, toma_id: tomaId, medido_en: medidoEn, ...v }));
  const r = await guardarConReintento(() => supabase.from("laboratorio_valores").insert(filas).select(COLUMNAS));
  if (!r.ok) throw new Error(r.mensaje);
  return (r.resultado.data as ValorLaboratorio[]) ?? [];
}

// Única edición permitida (por permisos de la base): marcar anulado.
export async function anularValorLaboratorio(supabase: SupabaseClient, id: string): Promise<void> {
  const r = await guardarConReintento(() => supabase.from("laboratorio_valores").update({ anulado: true }).eq("id", id));
  if (!r.ok) throw new Error(r.mensaje);
}
