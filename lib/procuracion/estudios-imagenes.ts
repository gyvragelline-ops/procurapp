import type { SupabaseClient } from "@supabase/supabase-js";

export type TipoEstudio = "Laboratorio" | "Rx_torax" | "TAC_torax" | "Ecografia" | "Fotos_cuerpo";

// 5 categorías fijas, siempre visibles como tarjeta propia (una por
// donante) -- ver ImagenesVideosPanel. Orden fijo pedido.
export const TIPOS_ESTUDIO_INFO: { valor: TipoEstudio; etiqueta: string; nota?: string }[] = [
  { valor: "Laboratorio", etiqueta: "Laboratorio" },
  { valor: "Rx_torax", etiqueta: "Rx de tórax" },
  { valor: "TAC_torax", etiqueta: "TAC de tórax" },
  { valor: "Ecografia", etiqueta: "Ecografía" },
  {
    valor: "Fotos_cuerpo",
    etiqueta: "Fotos del cuerpo",
    nota: "Tórax, abdomen, tatuajes o marcas identificativas — sin mostrar la cara.",
  },
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

// Miniatura de un video por convención de nombre (mismo timestamp, sufijo
// "-thumb.jpg"), igual que rutaMiniaturaVideo en PASE -- sin columna
// nueva. Si la miniatura no se pudo generar o subir al momento de cargar
// el video (best-effort, ver capturarFotogramaDeVideo en
// comprimir-video.ts), la URL simplemente no resuelve y el carrusel cae
// al ícono genérico.
export function rutaMiniaturaVideo(archivoUrl: string): string {
  return archivoUrl.replace(/\.[^./]+$/, "-thumb.jpg");
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
  if (ruta) {
    const rutaThumb = rutaDesdeUrlPublica(rutaMiniaturaVideo(estudio.archivo_url));
    await supabase.storage.from("estudios-imagenes").remove(rutaThumb ? [ruta, rutaThumb] : [ruta]);
  }

  return { ok: true };
}
