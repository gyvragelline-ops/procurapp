// Base operativa: estado de la actualización automática. Si la última
// consulta falló (o el navegador quedó sin red), NO se muestran los datos
// como actuales: "Sin conexión: datos de HH:MM".

// Cada cuánto se vuelve a consultar (dentro de 30 a 60 s).
export const CONSULTA_BASE_MS = 30_000;

export type EstadoActualizacion =
  | { tipo: "cargando"; texto: string }
  | { tipo: "ok"; texto: string }
  | { tipo: "sin_conexion"; texto: string };

const p2 = (n: number) => String(n).padStart(2, "0");
const hora = (t: number, conSegundos: boolean) => {
  const d = new Date(t);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}${conSegundos ? `:${p2(d.getSeconds())}` : ""}`;
};

// cargadoEn: última consulta que salió bien. falloEn: última que falló.
export function estadoActualizacion(cargadoEn: number | null, falloEn: number | null): EstadoActualizacion {
  const fallo = falloEn !== null && (cargadoEn === null || falloEn >= cargadoEn);
  if (fallo) return { tipo: "sin_conexion", texto: cargadoEn === null ? "Sin conexión: todavía no hay datos" : `Sin conexión: datos de ${hora(cargadoEn, false)}` };
  if (cargadoEn === null) return { tipo: "cargando", texto: "Cargando…" };
  return { tipo: "ok", texto: `Actualizado ${hora(cargadoEn, true)}` };
}
