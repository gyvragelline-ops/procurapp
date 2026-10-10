import type { SupabaseClient } from "@supabase/supabase-js";
import { guardarConReintento } from "./guardar";
import type { DatosEquipo, EquipoQuirofano, HorarioQuirofano, MensajeCaso, RolChat } from "./quirofano-calculos";

// Acceso a datos de la etapa Hora de quirófano (tablas quirofano_horarios,
// quirofano_equipos y mensajes_caso). Escrituras con guardarConReintento:
// si fallan TIRAN con el mensaje para mostrar. Sin borrado: se anula.

const COLS_HORA = "id, hora, registrado_en, anulado";
const COLS_EQUIPO = "id, equipo, organos, organo_otro, anestesista, informado_por, medio, creado_en, modificado_en, anulado";
const COLS_MENSAJE = "id, rol, autor, texto, creado_en, anulado";

export async function cargarHorariosQuirofano(supabase: SupabaseClient, donanteId: string): Promise<HorarioQuirofano[]> {
  const { data, error } = await supabase.from("quirofano_horarios").select(COLS_HORA).eq("donante_id", donanteId).order("registrado_en");
  if (error) throw new Error(`No se pudo cargar la hora de quirófano: ${error.message}`);
  return (data as HorarioQuirofano[]) ?? [];
}

export async function cargarEquiposYMensajes(
  supabase: SupabaseClient,
  donanteId: string
): Promise<{ equipos: EquipoQuirofano[]; mensajes: MensajeCaso[] }> {
  const [eq, me] = await Promise.all([
    supabase.from("quirofano_equipos").select(COLS_EQUIPO).eq("donante_id", donanteId).order("creado_en"),
    supabase.from("mensajes_caso").select(COLS_MENSAJE).eq("donante_id", donanteId).order("creado_en"),
  ]);
  const error = eq.error ?? me.error;
  if (error) throw new Error(`No se pudieron cargar los equipos y el chat: ${error.message}`);
  return { equipos: (eq.data as EquipoQuirofano[]) ?? [], mensajes: (me.data as MensajeCaso[]) ?? [] };
}

// Cada cambio de hora es una fila nueva (queda el historial).
export async function guardarHoraQuirofano(supabase: SupabaseClient, donanteId: string, hora: string): Promise<HorarioQuirofano> {
  const r = await guardarConReintento(() => supabase.from("quirofano_horarios").insert({ donante_id: donanteId, hora }).select(COLS_HORA).single());
  if (!r.ok) throw new Error(r.mensaje);
  return r.resultado.data as HorarioQuirofano;
}

export async function anularHoraQuirofano(supabase: SupabaseClient, id: string): Promise<void> {
  const r = await guardarConReintento(() => supabase.from("quirofano_horarios").update({ anulado: true }).eq("id", id));
  if (!r.ok) throw new Error(r.mensaje);
}

export async function crearEquipo(supabase: SupabaseClient, donanteId: string, datos: DatosEquipo): Promise<EquipoQuirofano> {
  const r = await guardarConReintento(() => supabase.from("quirofano_equipos").insert({ ...datos, donante_id: donanteId }).select(COLS_EQUIPO).single());
  if (!r.ok) throw new Error(r.mensaje);
  return r.resultado.data as EquipoQuirofano;
}

// Edición: los datos editables y la hora de la modificación.
export async function editarEquipo(supabase: SupabaseClient, id: string, datos: DatosEquipo, modificadoEn: string): Promise<EquipoQuirofano> {
  const r = await guardarConReintento(() =>
    supabase.from("quirofano_equipos").update({ ...datos, modificado_en: modificadoEn }).eq("id", id).select(COLS_EQUIPO).single()
  );
  if (!r.ok) throw new Error(r.mensaje);
  return r.resultado.data as EquipoQuirofano;
}

export async function anularEquipo(supabase: SupabaseClient, id: string): Promise<void> {
  const r = await guardarConReintento(() => supabase.from("quirofano_equipos").update({ anulado: true }).eq("id", id));
  if (!r.ok) throw new Error(r.mensaje);
}

export async function enviarMensaje(
  supabase: SupabaseClient,
  donanteId: string,
  datos: { rol: RolChat; autor: string | null; texto: string }
): Promise<MensajeCaso> {
  const r = await guardarConReintento(() => supabase.from("mensajes_caso").insert({ ...datos, donante_id: donanteId }).select(COLS_MENSAJE).single());
  if (!r.ok) throw new Error(r.mensaje);
  return r.resultado.data as MensajeCaso;
}

export async function anularMensaje(supabase: SupabaseClient, id: string): Promise<void> {
  const r = await guardarConReintento(() => supabase.from("mensajes_caso").update({ anulado: true }).eq("id", id));
  if (!r.ok) throw new Error(r.mensaje);
}
