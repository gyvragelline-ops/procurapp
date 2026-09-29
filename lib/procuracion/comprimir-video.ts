// Recompresión de video en el cliente, portada tal cual de PASE
// (lib/estudios.ts, mismo autor) -- MediaRecorder + <canvas> nativos del
// navegador, sin librerías nuevas. Si el archivo ya pesa menos de lo que
// daría el bitrate objetivo para su duración, o si cualquier paso falla
// (formato raro, navegador sin soporte), devuelve el archivo original sin
// tocar -- nunca bloquea la subida por esto. esDeCamara=true (grabado con
// el botón de Cámara/Video de esta pantalla, no elegido de Galería) fuerza
// la recompresión aunque ya sea liviano, para garantizar que no lleve
// audio (recomprimirConMediaRecorder es mudo por diseño).

const LADO_MAX_MINIATURA = 480; // solo para el carrusel, no hace falta más

const RESOLUCION_MAX_LADO_MAYOR = 720;
const BITRATE_OBJETIVO_VIDEO = 1_750_000; // bits/seg, entre 1.5 y 2 Mbps
const FPS_RECOMPRESION = 30;
const CANDIDATOS_MIME_VIDEO = [
  // mp4 primero: es lo único que soporta MediaRecorder en Safari/iOS.
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

function elegirMimeTypeSoportado(): string | null {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return null;
  return CANDIDATOS_MIME_VIDEO.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

function extensionDeMimeType(mimeType: string): string {
  return mimeType.startsWith("video/mp4") ? "mp4" : "webm";
}

function cargarMetadataDeVideo(
  archivo: Blob
): Promise<{ anchoNatural: number; altoNatural: number; duracion: number } | null> {
  return new Promise((resolve) => {
    let resuelto = false;
    const url = URL.createObjectURL(archivo);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    function terminar(resultado: { anchoNatural: number; altoNatural: number; duracion: number } | null) {
      if (resuelto) return;
      resuelto = true;
      URL.revokeObjectURL(url);
      resolve(resultado);
    }

    video.onloadedmetadata = () => {
      terminar({ anchoNatural: video.videoWidth, altoNatural: video.videoHeight, duracion: video.duration });
    };
    video.onerror = () => terminar(null);
    setTimeout(() => terminar(null), 5000);

    video.src = url;
  });
}

function recomprimirConMediaRecorder(
  archivo: Blob,
  ancho: number,
  alto: number,
  mimeType: string,
  duracionSegundos: number,
  onProgreso?: (fraccion: number) => void
): Promise<Blob | null> {
  return new Promise((resolve) => {
    let resuelto = false;
    const url = URL.createObjectURL(archivo);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true; // necesario para poder reproducir sin gesto del usuario
    video.playsInline = true;

    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext("2d");

    let rafId: number | null = null;
    const watchdog = setTimeout(() => terminar(null), duracionSegundos * 1000 + 15000);

    function terminar(resultado: Blob | null) {
      if (resuelto) return;
      resuelto = true;
      clearTimeout(watchdog);
      if (rafId !== null) cancelAnimationFrame(rafId);
      URL.revokeObjectURL(url);
      video.pause();
      video.removeAttribute("src");
      resolve(resultado);
    }

    if (!ctx) {
      terminar(null);
      return;
    }

    video.onerror = () => terminar(null);

    video.onloadedmetadata = () => {
      try {
        const canvasStream = canvas.captureStream(FPS_RECOMPRESION);
        const recorder = new MediaRecorder(canvasStream, { mimeType, videoBitsPerSecond: BITRATE_OBJETIVO_VIDEO });

        const partes: Blob[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) partes.push(e.data);
        };
        recorder.onerror = () => terminar(null);
        recorder.onstop = () => {
          if (partes.length === 0) {
            terminar(null);
            return;
          }
          terminar(new Blob(partes, { type: mimeType }));
        };

        function dibujarFrame() {
          if (video.paused || video.ended) return;
          ctx!.drawImage(video, 0, 0, ancho, alto);
          if (onProgreso && duracionSegundos > 0) {
            onProgreso(Math.min(1, video.currentTime / duracionSegundos));
          }
          rafId = requestAnimationFrame(dibujarFrame);
        }

        video.onended = () => {
          if (recorder.state !== "inactive") recorder.stop();
        };

        recorder.start();
        video
          .play()
          .then(() => {
            rafId = requestAnimationFrame(dibujarFrame);
          })
          .catch(() => terminar(null));
      } catch {
        terminar(null);
      }
    };

    video.src = url;
  });
}

// Captura un fotograma del video (seg. 1, o el último frame disponible si
// dura menos) y lo devuelve como JPEG comprimido -- portado tal cual de
// PASE (lib/estudios.ts). Best-effort: cualquier falla resuelve null en
// vez de tirar, para no bloquear la subida del video en sí. Puramente
// mecánico (un frame-grab de <canvas>), no es análisis ni clasificación.
export function capturarFotogramaDeVideo(archivo: Blob): Promise<Blob | null> {
  return new Promise((resolve) => {
    let resuelto = false;
    const url = URL.createObjectURL(archivo);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    function terminar(resultado: Blob | null) {
      if (resuelto) return;
      resuelto = true;
      URL.revokeObjectURL(url);
      resolve(resultado);
    }

    video.onloadedmetadata = () => {
      const duracion = video.duration;
      let t = 1.0;
      if (!Number.isFinite(duracion) || duracion <= 0) {
        t = 0;
      } else if (duracion < 1.0) {
        t = Math.max(0, duracion - 0.05);
      }
      video.currentTime = t;
    };

    video.onseeked = () => {
      const anchoNatural = video.videoWidth;
      const altoNatural = video.videoHeight;
      if (!anchoNatural || !altoNatural) return terminar(null);

      const ladoMayor = Math.max(anchoNatural, altoNatural);
      const factor = ladoMayor > LADO_MAX_MINIATURA ? LADO_MAX_MINIATURA / ladoMayor : 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(anchoNatural * factor));
      canvas.height = Math.max(1, Math.round(altoNatural * factor));
      const ctx = canvas.getContext("2d");
      if (!ctx) return terminar(null);

      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } catch {
        return terminar(null);
      }
      canvas.toBlob((blob) => terminar(blob), "image/jpeg", 0.7);
    };

    video.onerror = () => terminar(null);
    setTimeout(() => terminar(null), 5000);

    video.src = url;
  });
}

export async function comprimirVideoSiHaceFalta(
  archivo: Blob,
  esDeCamara: boolean,
  onProgreso?: (fraccion: number) => void
): Promise<{ blob: Blob; extension: string | null }> {
  try {
    const metadata = await cargarMetadataDeVideo(archivo);
    if (!metadata) return { blob: archivo, extension: null };

    const { anchoNatural, altoNatural, duracion } = metadata;
    if (!anchoNatural || !altoNatural || !Number.isFinite(duracion) || duracion <= 0) {
      return { blob: archivo, extension: null };
    }

    const mimeType = elegirMimeTypeSoportado();
    if (!mimeType) return { blob: archivo, extension: null };

    const tamanoObjetivo = (BITRATE_OBJETIVO_VIDEO / 8) * duracion;
    if (!esDeCamara && archivo.size <= tamanoObjetivo) {
      return { blob: archivo, extension: null };
    }

    const ladoMayor = Math.max(anchoNatural, altoNatural);
    const factor = ladoMayor > RESOLUCION_MAX_LADO_MAYOR ? RESOLUCION_MAX_LADO_MAYOR / ladoMayor : 1;
    // Par: varios codecs (H.264 entre otros) piden ancho/alto divisibles por 2.
    const ancho = Math.max(2, Math.round((anchoNatural * factor) / 2) * 2);
    const alto = Math.max(2, Math.round((altoNatural * factor) / 2) * 2);

    const comprimido = await recomprimirConMediaRecorder(archivo, ancho, alto, mimeType, duracion, onProgreso);
    if (!comprimido) return { blob: archivo, extension: null };

    return { blob: comprimido, extension: extensionDeMimeType(mimeType) };
  } catch {
    return { blob: archivo, extension: null };
  }
}
