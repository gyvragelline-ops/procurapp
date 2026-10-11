import type { SupabaseClient } from "@supabase/supabase-js";
import { guardarConReintento } from "./guardar";
import type { NuevaSolicitud, Solicitud } from "./base-solicitudes";

// Solicitudes desde el panel del procurador: la MISMA tabla que usa la
// Base. Escrituras con guardarConReintento (si fallan, tiran con el
// mensaje para mostrar) y su línea en timeline_eventos. Sin borrado.

export async function cargarSolicitudes(supabase: SupabaseClient, donanteId: string): Promise<Solicitud[]> {
  const r = await supabase.from("solicitudes").select("*").eq("donante_id", donanteId).order("created_at");
  if (r.error) throw new Error(`No se pudieron cargar las solicitudes: ${r.error.message}`);
  return ((r.data as Record<string, unknown>[]) ?? []).map(
    (x) => ({ detalle: null, prioridad: "normal", pedido_por: null, respuesta: null, respondida_por: null, respondida_en: null, anulado: false, ...x }) as Solicitud
  );
}

async function linea(supabase: SupabaseClient, donanteId: string, texto: string, que: string) {
  const t = await guardarConReintento(() => supabase.from("timeline_eventos").insert({ donante_id: donanteId, texto }));
  if (!t.ok) throw new Error(`${que}, pero no se pudo registrar en la línea de tiempo: ${t.mensaje}`);
}

export async function cambiarSolicitudProcurador(supabase: SupabaseClient, s: Pick<Solicitud, "id" | "donante_id">, cambios: Partial<Solicitud>, textoLinea: string) {
  const r = await guardarConReintento(() => supabase.from("solicitudes").update(cambios).eq("id", s.id));
  if (!r.ok) throw new Error(r.mensaje);
  await linea(supabase, s.donante_id, textoLinea, "La solicitud se guardó");
}

export async function crearSolicitudProcurador(supabase: SupabaseClient, donanteId: string, datos: NuevaSolicitud, textoLinea: string) {
  const r = await guardarConReintento(() => supabase.from("solicitudes").insert({ ...datos, donante_id: donanteId }));
  if (!r.ok) throw new Error(r.mensaje);
  await linea(supabase, donanteId, textoLinea, "El pedido se guardó");
}
