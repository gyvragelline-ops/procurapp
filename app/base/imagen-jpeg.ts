"use client";

// Imagen de un estudio -> JPEG comprimido (lado mayor ≤ 1600 px) como data
// URL, para meterla en el PDF de la ficha sin que pese de más.
export const LADO_MAX_PDF = 1600;
export const CALIDAD_JPEG_PDF = 0.72;

export function imagenJpeg(url: string, ladoMax = LADO_MAX_PDF, calidad = CALIDAD_JPEG_PDF): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const factor = Math.min(1, ladoMax / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * factor));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * factor));
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("No se pudo procesar la imagen."));
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", calidad));
    };
    img.onerror = () => reject(new Error("No se pudo leer la imagen del estudio."));
    img.src = url;
  });
}
