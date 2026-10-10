import type { SupabaseClient } from "@supabase/supabase-js";
import { guardarConReintento } from "./guardar";
import type { MensajeCaso, RolChat } from "./chat-calculos";

// Acceso a datos del chat del donante (tabla mensajes_caso). Escrituras
// con guardarConReintento: si fallan TIRAN con el mensaje para mostrar.
// Sin borrado: se anula.

const COLS = "id, rol, autor, texto, creado_en, anulado";

export async function cargarMensajes(supabase: SupabaseClient, donanteId: string): Promise<MensajeCaso[]> {
  const { data, error } = await supabase.from("mensajes_caso").select(COLS).eq("donante_id", donanteId).order("creado_en");
  if (error) throw new Error(`No se pudieron cargar los mensajes: ${error.message}`);
  return (data as MensajeCaso[]) ?? [];
}

export async function enviarMensaje(
  supabase: SupabaseClient,
  donanteId: string,
  datos: { rol: RolChat; autor: string | null; texto: string }
): Promise<MensajeCaso> {
  const r = await guardarConReintento(() => supabase.from("mensajes_caso").insert({ ...datos, donante_id: donanteId }).select(COLS).single());
  if (!r.ok) throw new Error(r.mensaje);
  return r.resultado.data as MensajeCaso;
}

export async function anularMensaje(supabase: SupabaseClient, id: string): Promise<void> {
  const r = await guardarConReintento(() => supabase.from("mensajes_caso").update({ anulado: true }).eq("id", id));
  if (!r.ok) throw new Error(r.mensaje);
}
