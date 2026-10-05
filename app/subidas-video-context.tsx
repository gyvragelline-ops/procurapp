"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { guardarEstudioImagen, rutaMiniaturaVideo, type TipoEstudio } from "@/lib/procuracion/estudios-imagenes";
import { capturarFotogramaDeVideo, comprimirVideoSiHaceFalta } from "@/lib/procuracion/comprimir-video";
import { subirArchivoConProgreso } from "@/lib/procuracion/subir-con-progreso";

const supabase = createClient();

export type EtapaSubidaVideo = "comprimiendo" | "subiendo" | "error" | "listo";

export type UploadVideoEnCurso = {
  id: string;
  donanteId: string;
  tipoEstudio: TipoEstudio;
  archivo: Blob; // el original, se conserva para poder reintentar
  extensionOriginal: string;
  esDeCamara: boolean; // grabado con el botón de Video de esta pantalla, no elegido de Galería
  etapa: EtapaSubidaVideo;
  progreso: number; // 0-1, de la etapa activa (comprimiendo o subiendo)
  error: string | null;
};

type DatosNuevaSubida = Omit<UploadVideoEnCurso, "id" | "etapa" | "progreso" | "error">;

type SubidasVideoContextoTipo = {
  subidas: Record<string, UploadVideoEnCurso>;
  iniciarSubidaVideo: (datos: DatosNuevaSubida) => string;
  reintentar: (id: string) => void;
  descartar: (id: string) => void;
};

const SubidasVideoContexto = createContext<SubidasVideoContextoTipo | null>(null);

export function useSubidasVideo(): SubidasVideoContextoTipo {
  const ctx = useContext(SubidasVideoContexto);
  if (!ctx) throw new Error("useSubidasVideo: usar dentro de SubidasVideoProvider (ver layout.tsx).");
  return ctx;
}

/**
 * Subida de video en segundo plano, portado de PASE
 * (app/[unidadId]/SubidasVideoContext.tsx) -- vive acá, montado en
 * layout.tsx (por encima de la página), para que comprimir+subir+
 * guardar no dependa de que el panel de Imágenes y videos siga montado:
 * el procurador puede cambiar de donante o de etapa mientras sigue
 * corriendo. Sin cola offline (ver comentario en estudios-imagenes.ts /
 * lib/procuracion): si no hay señal, esto termina en etapa "error" con
 * reintentar manual, nunca en silencio.
 */
export default function SubidasVideoProvider({ children }: { children: React.ReactNode }) {
  const [subidas, setSubidas] = useState<Record<string, UploadVideoEnCurso>>({});

  function actualizar(id: string, parcial: Partial<UploadVideoEnCurso>) {
    setSubidas((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...parcial } } : prev));
  }

  async function ejecutar(entrada: UploadVideoEnCurso) {
    actualizar(entrada.id, { etapa: "comprimiendo", progreso: 0, error: null });
    try {
      const comprimido = await comprimirVideoSiHaceFalta(entrada.archivo, entrada.esDeCamara, (fraccion) =>
        actualizar(entrada.id, { progreso: fraccion })
      );
      const ext = comprimido.extension ?? entrada.extensionOriginal;
      const contentType = comprimido.extension ? (comprimido.extension === "mp4" ? "video/mp4" : "video/webm") : entrada.archivo.type || "video/mp4";
      const uploadBody = comprimido.blob;

      actualizar(entrada.id, { etapa: "subiendo", progreso: 0 });
      const stamp = Date.now();
      const path = `${entrada.donanteId}/${stamp}.${ext}`;
      const resultadoSubida = await subirArchivoConProgreso("estudios-imagenes", path, uploadBody, (fraccion) =>
        actualizar(entrada.id, { progreso: fraccion })
      );
      if (!resultadoSubida.ok) {
        actualizar(entrada.id, { etapa: "error", error: resultadoSubida.error });
        return;
      }

      const { data: pub } = supabase.storage.from("estudios-imagenes").getPublicUrl(path);

      // Miniatura best-effort: no bloquea ni hace fallar la subida del
      // video en sí (mismo criterio que en PASE).
      try {
        const fotograma = await capturarFotogramaDeVideo(uploadBody);
        if (fotograma) {
          const { error: errorMiniatura } = await supabase.storage
            .from("estudios-imagenes")
            .upload(rutaMiniaturaVideo(path), fotograma, { contentType: "image/jpeg", upsert: true });
          // El video ya subió: sin miniatura, el carrusel muestra el ícono
          // genérico. Se registra en consola, no se muestra como error.
          if (errorMiniatura) console.error("[SubidasVideoProvider] No se pudo subir la miniatura:", errorMiniatura.message);
        }
      } catch (e) {
        console.error("[SubidasVideoProvider] No se pudo generar la miniatura:", e);
      }

      await guardarEstudioImagen(supabase, entrada.donanteId, {
        tipoEstudio: entrada.tipoEstudio,
        archivoUrl: pub.publicUrl,
        archivoTipo: "video",
        mimeType: contentType,
      });

      actualizar(entrada.id, { etapa: "listo", progreso: 1 });
    } catch (e) {
      console.error("[SubidasVideoProvider] Error al subir video:", e);
      actualizar(entrada.id, { etapa: "error", error: e instanceof Error ? e.message : "Error inesperado al subir el video." });
    }
  }

  function iniciarSubidaVideo(datos: DatosNuevaSubida): string {
    const id = crypto.randomUUID();
    const entrada: UploadVideoEnCurso = { ...datos, id, etapa: "comprimiendo", progreso: 0, error: null };
    setSubidas((prev) => ({ ...prev, [id]: entrada }));
    ejecutar(entrada);
    return id;
  }

  function reintentar(id: string) {
    const entrada = subidas[id];
    if (!entrada) return;
    ejecutar(entrada);
  }

  function descartar(id: string) {
    setSubidas((prev) => {
      const nuevo = { ...prev };
      delete nuevo[id];
      return nuevo;
    });
  }

  // Avisa antes de cerrar/recargar si hay algo activo -- perderla ahí es
  // aceptable (no hay persistencia entre sesiones), pero no en silencio.
  useEffect(() => {
    const hayActivos = Object.values(subidas).some((s) => s.etapa === "comprimiendo" || s.etapa === "subiendo");
    if (!hayActivos) return;

    function avisar(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [subidas]);

  return (
    <SubidasVideoContexto.Provider value={{ subidas, iniciarSubidaVideo, reintentar, descartar }}>
      {children}
    </SubidasVideoContexto.Provider>
  );
}
