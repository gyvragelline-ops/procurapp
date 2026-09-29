import type { SupabaseClient } from "@supabase/supabase-js";

export type TipoEstudio =
  | "Laboratorio"
  | "Rx_torax"
  | "TAC_torax"
  | "Foto_paciente"
  | "ECG"
  | "Ecografia"
  | "Radiografia"
  | "Foto_monitor"
  | "Video"
  | "Otro";

// Orden fijo pedido: las primeras 4 van siempre arriba (Laboratorio
// preseleccionada por defecto), el resto son las que ya existían.
export const TIPOS_ESTUDIO_INFO: { valor: TipoEstudio; etiqueta: string; nota?: string }[] = [
  { valor: "Laboratorio", etiqueta: "Laboratorio" },
  { valor: "Rx_torax", etiqueta: "Rx de tórax" },
  { valor: "TAC_torax", etiqueta: "TAC de tórax" },
  { valor: "Foto_paciente", etiqueta: "Foto del paciente", nota: "No debe verse la cara" },
  { valor: "ECG", etiqueta: "ECG" },
  { valor: "Ecografia", etiqueta: "Ecografía" },
  { valor: "Radiografia", etiqueta: "Radiografía" },
  { valor: "Foto_monitor", etiqueta: "Foto de monitor" },
  { valor: "Video", etiqueta: "Video" },
  { valor: "Otro", etiqueta: "Otro" },
];

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

// archivo_url guarda la URL pública completa (no la ruta dentro del
// bucket) -- se recupera la ruta parseándola, para no necesitar una
// columna nueva (y otra migración manual) solo para esto.
function rutaDesdeUrlPublica(url: string): string | null {
  const marca = "/estudios-imagenes/";
  const i = url.indexOf(marca);
  if (i === -1) return null;
  return url.slice(i + marca.length);
}

// Borrado real: fila primero (si falla, no queda un archivo huérfano sin
// registro apuntándolo); el archivo de Storage después (si eso falla,
// queda basura huérfana en el bucket, pero la tabla ya quedó consistente).
// Mismo orden que borrarEstudio en PASE.
export async function borrarEstudioImagen(
  supabase: SupabaseClient,
  estudio: Pick<EstudioImagenRow, "id" | "archivo_url">
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from("estudios_imagenes").delete().eq("id", estudio.id);
  if (error) return { ok: false, error: error.message };

  const ruta = rutaDesdeUrlPublica(estudio.archivo_url);
  if (ruta) await supabase.storage.from("estudios-imagenes").remove([ruta]);

  return { ok: true };
}
