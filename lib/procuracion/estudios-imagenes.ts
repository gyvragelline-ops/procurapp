import type { SupabaseClient } from "@supabase/supabase-js";

export const TIPOS_ESTUDIO = [
  "ECG",
  "Ecografia",
  "Radiografia",
  "Foto_monitor",
  "Video",
  "Otro",
] as const;

export type TipoEstudio = (typeof TIPOS_ESTUDIO)[number];

export type EstudioImagenRow = {
  id: string;
  tipo_estudio: TipoEstudio;
  descripcion: string | null;
  archivo_url: string;
  archivo_tipo: "image" | "video";
  mime_type: string | null;
  created_at: string;
};

export async function guardarEstudioImagen(
  supabase: SupabaseClient,
  donanteId: string,
  datos: { tipoEstudio: TipoEstudio; descripcion?: string; archivoUrl: string; archivoTipo: "image" | "video"; mimeType: string }
): Promise<void> {
  await supabase.from("estudios_imagenes").insert({
    donante_id: donanteId,
    tipo_estudio: datos.tipoEstudio,
    descripcion: datos.descripcion ?? null,
    archivo_url: datos.archivoUrl,
    archivo_tipo: datos.archivoTipo,
    mime_type: datos.mimeType,
  });
}

export async function cargarEstudiosImagenes(supabase: SupabaseClient, donanteId: string): Promise<EstudioImagenRow[]> {
  const { data } = await supabase
    .from("estudios_imagenes")
    .select("id, tipo_estudio, descripcion, archivo_url, archivo_tipo, mime_type, created_at")
    .eq("donante_id", donanteId)
    .order("created_at", { ascending: false });
  return (data as EstudioImagenRow[]) ?? [];
}
