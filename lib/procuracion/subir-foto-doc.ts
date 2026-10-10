import type { SupabaseClient } from "@supabase/supabase-js";
import { guardarDocumentacionFoto, sincronizarEstadoFotoDoc, type RolFoto, type TipoFotoDoc } from "./documentacion-fotos";

// Subida de una foto de documentación (DNI, grupo y factor, precario,
// autorización del juez): comprime en el navegador, sube al storage y la
// registra. La usan el panel del procurador y la Base.

const MAX_DIM = 1600;

export function comprimirImagen(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("No se pudo procesar la imagen."));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        resolve({ base64: dataUrl.split(",")[1], mediaType: "image/jpeg" });
      } catch (e) {
        reject(e instanceof Error ? e : new Error("No se pudo procesar la imagen."));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen."));
    };
    img.src = url;
  });
}

export async function subirFotoDocumentacion(supabase: SupabaseClient, donanteId: string, tipo: TipoFotoDoc, file: File, rol: RolFoto | null): Promise<void> {
  const comprimida = await comprimirImagen(file);
  const uploadBody = Uint8Array.from(atob(comprimida.base64), (c) => c.charCodeAt(0));
  const contentType = comprimida.mediaType;

  const stamp = Date.now();
  const path = `${donanteId}/doc-${tipo}-${stamp}.jpg`;
  const { error: uploadError } = await supabase.storage.from("estudios-imagenes").upload(path, uploadBody, { contentType, upsert: true });
  if (uploadError) throw new Error(`No se pudo subir el archivo: ${uploadError.message}`);
  const { data: pub } = supabase.storage.from("estudios-imagenes").getPublicUrl(path);

  await guardarDocumentacionFoto(supabase, donanteId, tipo, pub.publicUrl, contentType, rol);
  await sincronizarEstadoFotoDoc(supabase, donanteId, tipo, true);
}
