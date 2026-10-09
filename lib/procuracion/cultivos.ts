import type { SupabaseClient } from "@supabase/supabase-js";
import { guardarConReintento } from "./guardar";
import type { CambiosResultado, Cultivo, TipoCultivo } from "./cultivos-calculos";

// Acceso a datos de Cultivos (tabla cultivos). Escrituras con
// guardarConReintento: si fallan TIRAN con el mensaje para mostrar. Sin
// borrado: se anula. El resultado se completa sobre el mismo registro.

const COLS = "id, tipo, tipo_otro, tomado_en, estado, germen, sensibilidad, resultado_en, modificado_en, anulado";

export async function cargarCultivos(supabase: SupabaseClient, donanteId: string): Promise<Cultivo[]> {
  const { data, error } = await supabase.from("cultivos").select(COLS).eq("donante_id", donanteId).order("tomado_en", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar los cultivos: ${error.message}`);
  return (data as Cultivo[]) ?? [];
}

export async function crearCultivo(
  supabase: SupabaseClient,
  donanteId: string,
  datos: { tipo: TipoCultivo; tipo_otro: string | null; tomado_en: string }
): Promise<Cultivo> {
  const r = await guardarConReintento(() => supabase.from("cultivos").insert({ ...datos, donante_id: donanteId }).select(COLS).single());
  if (!r.ok) throw new Error(r.mensaje);
  return r.resultado.data as Cultivo;
}

// Completa (o corrige) el resultado sobre el mismo registro: solo las
// columnas de resultado (lo que permite la base).
export async function guardarResultadoCultivo(supabase: SupabaseClient, id: string, cambios: CambiosResultado): Promise<Cultivo> {
  const r = await guardarConReintento(() => supabase.from("cultivos").update(cambios).eq("id", id).select(COLS).single());
  if (!r.ok) throw new Error(r.mensaje);
  return r.resultado.data as Cultivo;
}

export async function anularCultivo(supabase: SupabaseClient, id: string): Promise<void> {
  const r = await guardarConReintento(() => supabase.from("cultivos").update({ anulado: true }).eq("id", id));
  if (!r.ok) throw new Error(r.mensaje);
}
