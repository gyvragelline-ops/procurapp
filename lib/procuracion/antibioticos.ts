import type { SupabaseClient } from "@supabase/supabase-js";
import { guardarConReintento } from "./guardar";
import type { Antibiotico } from "./antibioticos-calculos";

// Acceso a datos de antibióticos (tabla antibioticos). Escrituras con
// guardarConReintento: si fallan, TIRAN con el mensaje para mostrar. Sin
// borrado: se anula.

const COLS = "id, antibiotico, desde, foco, creado_en, anulado";

export async function cargarAntibioticos(supabase: SupabaseClient, donanteId: string): Promise<Antibiotico[]> {
  const { data, error } = await supabase.from("antibioticos").select(COLS).eq("donante_id", donanteId).order("desde", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar los antibióticos: ${error.message}`);
  return (data as Antibiotico[]) ?? [];
}

export async function crearAntibiotico(
  supabase: SupabaseClient,
  donanteId: string,
  datos: { antibiotico: string; desde: string; foco: string | null }
): Promise<Antibiotico> {
  const r = await guardarConReintento(() => supabase.from("antibioticos").insert({ ...datos, donante_id: donanteId }).select(COLS).single());
  if (!r.ok) throw new Error(r.mensaje);
  return r.resultado.data as Antibiotico;
}

export async function anularAntibiotico(supabase: SupabaseClient, id: string): Promise<void> {
  const r = await guardarConReintento(() => supabase.from("antibioticos").update({ anulado: true }).eq("id", id));
  if (!r.ok) throw new Error(r.mensaje);
}
