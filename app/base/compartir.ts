"use client";

// Copiar y compartir desde la Base (computadora). Web Share del navegador
// cuando está; si no, WhatsApp con el texto o descarga. Las imágenes se
// copian / comparten como PNG.

export type ResultadoCompartir = "compartido" | "cancelado" | "no_soportado";

export async function copiarTexto(texto: string): Promise<void> {
  await navigator.clipboard.writeText(texto);
}

export function puedeCompartir(archivos: File[] = []): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  if (!archivos.length) return true;
  return typeof navigator.canShare === "function" && navigator.canShare({ files: archivos });
}

export async function compartir(texto: string, archivos: File[] = []): Promise<ResultadoCompartir> {
  if (!puedeCompartir(archivos)) {
    // con archivos que no se pueden compartir, probar al menos el texto
    if (archivos.length && puedeCompartir()) return compartir(texto);
    return "no_soportado";
  }
  try {
    await navigator.share(archivos.length ? { text: texto, files: archivos } : { text: texto });
    return "compartido";
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return "cancelado";
    throw e;
  }
}

export function abrirWhatsApp(texto: string) {
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener,noreferrer");
}

export function descargarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function descargarTexto(texto: string, nombre: string) {
  descargarBlob(new Blob([texto], { type: "text/plain;charset=utf-8" }), nombre);
}

function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo leer la imagen."));
    img.src = src;
  });
}

// Cualquier imagen (jpg, png, svg; URL o data URL) -> PNG.
export async function imagenAPng(url: string): Promise<Blob> {
  const img = await cargarImagen(url);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width || 800;
  canvas.height = img.naturalHeight || img.height || 600;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo convertir la imagen."))), "image/png"));
}

// Un <svg> de la página (gráfica) -> PNG.
export async function svgAPng(svg: SVGSVGElement, escala = 2): Promise<Blob> {
  const copia = svg.cloneNode(true) as SVGSVGElement;
  const { width, height } = svg.getBoundingClientRect();
  copia.setAttribute("width", String(width * escala));
  copia.setAttribute("height", String(height * escala));
  copia.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const datos = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copia))}`;
  return imagenAPng(datos);
}

export async function copiarImagen(png: Blob): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

export const nombreArchivo = (base: string, ext: string) => `${base.replace(/[^A-Za-z0-9áéíóúñÁÉÍÓÚÑ_-]+/g, "_").slice(0, 60)}.${ext}`;
