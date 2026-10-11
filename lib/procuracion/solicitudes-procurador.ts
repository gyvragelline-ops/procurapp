// Solicitudes en el panel del procurador (celular): lógica pura, con
// tests. Lee y escribe la MISMA tabla solicitudes que la Base. Nada se
// borra: se anula.

import { MAX_DETALLE, MAX_NOMBRE, esAbierta, ordenarSolicitudes, validarSolicitud, type NuevaSolicitud, type Prioridad, type Solicitud } from "./base-solicitudes.ts";

// Cada cuánto se vuelve a consultar.
export const CONSULTA_SOLICITUDES_MS = 30_000;
export const MAX_RESPUESTA_CORTA = 300;

// Abiertas dirigidas al procurador: destino procurador, no anuladas y
// estado distinto de completado. Urgentes primero, después la más vieja.
export function paraElProcurador<T extends Solicitud>(xs: T[]): T[] {
  return ordenarSolicitudes(xs.filter((s) => s.destino === "procurador" && esAbierta(s)));
}

// Lo que el procurador le pidió a la Base: abiertas primero (urgentes y
// más viejas antes), después las resueltas. Sin anuladas.
export function pedidosALaBase<T extends Solicitud>(xs: T[]): T[] {
  return ordenarSolicitudes(xs.filter((s) => s.origen === "procurador" && s.destino === "base" && !s.anulado));
}

// Resueltas dirigidas al procurador (para consultar; la más nueva arriba).
export function resueltasDelProcurador<T extends Solicitud>(xs: T[]): T[] {
  return ordenarSolicitudes(xs.filter((s) => s.destino === "procurador" && !s.anulado && s.estado === "completado"));
}

export function contadorProcurador(xs: Solicitud[]): { abiertas: number; urgentes: number } {
  const a = paraElProcurador(xs);
  return { abiertas: a.length, urgentes: a.filter((s) => s.prioridad === "urgente").length };
}

// ------------------------------------------------------------- acciones
export const cambiosEnProceso = () => ({ estado: "en_proceso" as const });

// Resuelto, con respuesta corta opcional (y quién y cuándo, si la hay).
export function cambiosResuelto(
  respuesta: string,
  nombre: string,
  ahoraIso: string
): { ok: true; cambios: Partial<Solicitud> } | { ok: false; error: string } {
  const r = respuesta.trim();
  if (r.length > MAX_RESPUESTA_CORTA) return { ok: false, error: `La respuesta es demasiado larga (máximo ${MAX_RESPUESTA_CORTA} caracteres).` };
  const n = nombre.trim().slice(0, MAX_NOMBRE);
  const base = { estado: "completado" as const, completed_at: ahoraIso };
  return { ok: true, cambios: r ? { ...base, respuesta: r, respondida_por: n || null, respondida_en: ahoraIso } : base };
}

// Pedido del procurador a la Base.
export function validarPedidoALaBase(e: { titulo: string; detalle: string; prioridad: Prioridad; nombre: string }): { ok: true; datos: NuevaSolicitud } | { ok: false; error: string } {
  if (e.detalle.trim().length > MAX_DETALLE) return { ok: false, error: `El detalle es demasiado largo (máximo ${MAX_DETALLE} caracteres).` };
  return validarSolicitud({ titulo: e.titulo, detalle: e.detalle, origen: "procurador", destino: "base", prioridad: e.prioridad, pedidoPor: e.nombre });
}

// --------------------------------------------------- línea de tiempo
// Mismo estilo que la Base: "Rol · quién · qué (HH:MM)".
const quien = (n: string) => n.trim() || "sin nombre";
const p2 = (x: number) => String(x).padStart(2, "0");
export const horaLinea = (t: number) => {
  const d = new Date(t);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

export function lineaEnProceso(s: Pick<Solicitud, "titulo">, nombre: string, ahora: number) {
  return `Procurador · ${quien(nombre)} · marcó en proceso la solicitud «${s.titulo}» (${horaLinea(ahora)})`;
}
export function lineaResuelto(s: Pick<Solicitud, "titulo">, respuesta: string, nombre: string, ahora: number) {
  const r = respuesta.trim();
  return `Procurador · ${quien(nombre)} · resolvió la solicitud «${s.titulo}»${r ? `: ${r}` : ""} (${horaLinea(ahora)})`;
}
export function lineaPedido(d: Pick<NuevaSolicitud, "titulo" | "prioridad">, nombre: string, ahora: number) {
  return `Procurador · ${quien(nombre)} · pidió a la Base${d.prioridad === "urgente" ? " (urgente)" : ""}: «${d.titulo}» (${horaLinea(ahora)})`;
}
