import type { SupabaseClient } from "@supabase/supabase-js";

export type TipoEstudio = "Laboratorio" | "Rx_torax" | "TAC_torax" | "Ecografia" | "Fotos_cuerpo";

// Sin IA en ningún punto de este archivo ni de ImagenesVideosPanel --
// es solo carga y almacenamiento de archivos. Cada categoría define qué
// modos de carga ofrece (no todas admiten los tres): Laboratorio/Rx/
// Fotos del cuerpo son fotos fijas (Cámara+Galería); TAC es video en
// movimiento (Video+Galería, sin foto); Ecografía admite los tres --
// Cámara para el informe escrito, Video para el estudio en sí.
export type Modo = "foto" | "video" | "galeria";

export const TIPOS_ESTUDIO_INFO: { valor: TipoEstudio; etiqueta: string; nota?: string; modos: Modo[] }[] = [
  { valor: "Laboratorio", etiqueta: "Laboratorio", modos: ["foto", "galeria"] },
  { valor: "Rx_torax", etiqueta: "Rx de tórax", modos: ["foto", "galeria"] },
  { valor: "TAC_torax", etiqueta: "TAC de tórax", modos: ["video", "galeria"] },
  { valor: "Ecografia", etiqueta: "Ecografía", modos: ["foto", "video", "galeria"] },
  {
    valor: "Fotos_cuerpo",
    etiqueta: "Fotos del cuerpo",
    nota: "Tórax, abdomen, tatuajes o marcas identificativas — sin mostrar la cara.",
    modos: ["foto", "galeria"],
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

function extensionDeUrl(url: string): string {
  const ext = url.split("?")[0].split(".").pop();
  return ext ? ext.toLowerCase() : "dat";
}

function nombreArchivoCompartido(estudio: Pick<EstudioImagenRow, "tipo_estudio" | "archivo_url" | "created_at">): string {
  return `${estudio.tipo_estudio}-${estudio.created_at.slice(0, 10)}.${extensionDeUrl(estudio.archivo_url)}`;
}

// Compartir con la Web Share API nativa (WhatsApp, mail, etc. sin sumar
// ninguna librería) -- portado tal cual de PASE (lib/estudios.ts,
// compartirEstudios). Acá archivo_url ya es pública (el bucket lo es),
// así que no hace falta el paso de URL firmada que tiene PASE -- se
// puede fetch() directo.
export async function compartirEstudios(
  estudios: Pick<EstudioImagenRow, "tipo_estudio" | "archivo_url" | "archivo_tipo" | "created_at">[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof navigator === "undefined" || !navigator.share) {
    return { ok: false, error: "Este navegador no permite compartir archivos." };
  }

  const archivos: File[] = [];
  for (const estudio of estudios) {
    const respuesta = await fetch(estudio.archivo_url);
    if (!respuesta.ok) return { ok: false, error: "No se pudo preparar un archivo para compartir." };
    const blob = await respuesta.blob();
    archivos.push(
      new File([blob], nombreArchivoCompartido(estudio), {
        type: blob.type || (estudio.archivo_tipo === "video" ? "video/mp4" : "image/jpeg"),
      })
    );
  }

  if (navigator.canShare && !navigator.canShare({ files: archivos })) {
    return { ok: false, error: "El navegador no admite compartir este tipo de archivo." };
  }

  try {
    await navigator.share({ files: archivos });
    return { ok: true };
  } catch (e) {
    // AbortError: el usuario cerró el panel de compartir sin elegir nada -- no es un error real.
    if (e instanceof DOMException && e.name === "AbortError") return { ok: true };
    return { ok: false, error: "No se pudo compartir." };
  }
}
