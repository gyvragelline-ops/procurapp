import type { SupabaseClient } from "@supabase/supabase-js";
import { guardarConReintento } from "./guardar";
import { esMarca, textoTimelineMarca, type MarcaEtapa, type MarcaManual } from "./marca-etapa";

// Acceso a datos de la marca manual por etapa (etapas_estado.marcado_manual
// / marcado_en). Si las columnas todavía no existen (SQL sin aplicar), la
// carga devuelve disponible=false y la pantalla funciona igual, sin marca.

export async function cargarMarcas(
  supabase: SupabaseClient,
  donanteId: string
): Promise<{ disponible: boolean; marcas: Record<string, MarcaEtapa> }> {
  const { data, error } = await supabase.from("etapas_estado").select("etapa_key, marcado_manual, marcado_en").eq("donante_id", donanteId);
  if (error) return { disponible: false, marcas: {} };
  const marcas: Record<string, MarcaEtapa> = {};
  for (const r of (data as { etapa_key: string; marcado_manual: string | null; marcado_en: string | null }[]) ?? []) {
    if (esMarca(r.marcado_manual)) marcas[r.etapa_key] = { marca: r.marcado_manual, en: r.marcado_en };
  }
  return { disponible: true, marcas };
}

// Guarda la marca (null = quitarla y volver al cálculo) y la deja en la
// línea de tiempo. Tira con el mensaje para mostrar si falla la marca; si
// solo falla la línea de tiempo, devuelve ese aviso.
export async function guardarMarca(
  supabase: SupabaseClient,
  donanteId: string,
  etapaKey: string,
  etiqueta: string,
  marca: MarcaManual | null
): Promise<{ en: string; avisoTimeline: string | null }> {
  const ahora = new Date();
  const en = ahora.toISOString();
  // Actualiza la fila de la etapa; si todavía no existe, la crea (sin
  // upsert, para no necesitar permiso de update sobre donante_id/etapa_key).
  const cambios = { marcado_manual: marca, marcado_en: marca ? en : null, updated_at: en };
  const u = await guardarConReintento(() =>
    supabase.from("etapas_estado").update(cambios).eq("donante_id", donanteId).eq("etapa_key", etapaKey).select("id")
  );
  if (!u.ok) throw new Error(u.mensaje);
  const actualizadas = (u.resultado.data as { id: string }[] | null)?.length ?? 0;
  const r = actualizadas
    ? u
    : await guardarConReintento(() => supabase.from("etapas_estado").insert({ donante_id: donanteId, etapa_key: etapaKey, ...cambios }));
  if (!r.ok) throw new Error(r.mensaje);
  const hora = ahora.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  const t = await guardarConReintento(() =>
    supabase.from("timeline_eventos").insert({ donante_id: donanteId, texto: textoTimelineMarca(etiqueta, marca, hora) })
  );
  return { en, avisoTimeline: t.ok ? null : `La marca se guardó, pero no se pudo registrar en la línea de tiempo: ${t.mensaje}` };
}
