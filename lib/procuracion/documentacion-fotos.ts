import type { SupabaseClient } from "@supabase/supabase-js";
import { guardarConReintento } from "./guardar";

export type TipoFotoDoc = "dni" | "grupo_factor";

export type DocumentacionFotoRow = {
  id: string;
  tipo: TipoFotoDoc;
  archivo_url: string;
  mime_type: string | null;
  created_at: string;
};

// Tira con el mensaje de guardarConReintento si no se pudo guardar: el
// panel lo muestra (mismo try/catch que el error de subida al storage),
// nunca queda como "cargada" una foto que no llegó a la base.
export async function guardarDocumentacionFoto(
  supabase: SupabaseClient,
  donanteId: string,
  tipo: TipoFotoDoc,
  archivoUrl: string,
  mimeType: string
): Promise<void> {
  const r = await guardarConReintento(() =>
    supabase.from("documentacion_fotos").insert({
      donante_id: donanteId,
      tipo,
      archivo_url: archivoUrl,
      mime_type: mimeType,
    })
  );
  if (!r.ok) throw new Error(r.mensaje);
}

export async function cargarDocumentacionFotos(supabase: SupabaseClient, donanteId: string): Promise<DocumentacionFotoRow[]> {
  const { data } = await supabase
    .from("documentacion_fotos")
    .select("id, tipo, archivo_url, mime_type, created_at")
    .eq("donante_id", donanteId)
    .order("created_at", { ascending: false });
  return (data as DocumentacionFotoRow[]) ?? [];
}

function rutaDesdeUrlPublica(url: string): string | null {
  const marca = "/estudios-imagenes/";
  const i = url.indexOf(marca);
  if (i === -1) return null;
  return url.slice(i + marca.length);
}

export async function borrarDocumentacionFoto(
  supabase: SupabaseClient,
  foto: Pick<DocumentacionFotoRow, "id" | "archivo_url">
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from("documentacion_fotos").delete().eq("id", foto.id);
  if (error) return { ok: false, error: error.message };
  // La fila ya se borró (lo que el procurador ve): si falla borrar el
  // archivo, queda basura en el bucket pero nada visible cambia -- se
  // registra en consola en vez de mostrar un error que no tiene arreglo.
  const ruta = rutaDesdeUrlPublica(foto.archivo_url);
  if (ruta) {
    const { error: errorArchivo } = await supabase.storage.from("estudios-imagenes").remove([ruta]);
    if (errorArchivo) console.error("[borrarDocumentacionFoto] Archivo huérfano en storage:", ruta, errorArchivo.message);
  }
  return { ok: true };
}

/**
 * Mantiene en sincronía el chip genérico "Foto de DNI"/"Foto de grupo y
 * factor" que ya se muestra en la lista de la pestaña Documentación
 * (lib/procuracion/panels.ts, categoria='documentacion') -- "si" cuando
 * hay al menos 1 foto (chip verde "Completo"), se borra la fila cuando
 * no queda ninguna (así cae al fallback ámbar "Pendiente" en vez de
 * mostrar el rojo "Crítico" que usa el estado "no" explícito).
 */
export async function sincronizarEstadoFotoDoc(
  supabase: SupabaseClient,
  donanteId: string,
  tipo: TipoFotoDoc,
  hayFotos: boolean
): Promise<void> {
  const itemKey = tipo === "dni" ? "foto_dni" : "foto_grupo_factor";
  const r = hayFotos
    ? await guardarConReintento(() =>
        supabase
          .from("documentacion_estado")
          .upsert(
            { donante_id: donanteId, categoria: "documentacion", item_key: itemKey, estado: "si" },
            { onConflict: "donante_id,categoria,item_key" }
          )
      )
    : await guardarConReintento(() =>
        supabase
          .from("documentacion_estado")
          .delete()
          .eq("donante_id", donanteId)
          .eq("categoria", "documentacion")
          .eq("item_key", itemKey)
      );
  // Tira: el chip "Completo"/"Pendiente" quedaría desincronizado de las
  // fotos reales -- el panel lo muestra como error.
  if (!r.ok) throw new Error(r.mensaje);
}
