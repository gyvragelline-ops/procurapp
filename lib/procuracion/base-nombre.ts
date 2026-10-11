// Base operativa · quién hace cada acción. Lógica pura, con tests.
//
// Regla: ninguna acción de la Base se graba "sin nombre". Si el
// dispositivo no tiene nombre guardado (el mismo del chat), se pide una
// vez y se guarda; si no lo dan, la acción no se hace.

export const MAX_NOMBRE_BASE = 80;

export function validarNombreBase(n: string): { ok: true; nombre: string } | { ok: false; error: string } {
  const t = n.trim().replace(/\s+/g, " ");
  if (!t) return { ok: false, error: "Escribí tu nombre." };
  if (/^sin nombre$/i.test(t)) return { ok: false, error: "Escribí tu nombre." };
  if (t.length > MAX_NOMBRE_BASE) return { ok: false, error: `El nombre es demasiado largo (máximo ${MAX_NOMBRE_BASE} caracteres).` };
  return { ok: true, nombre: t };
}

// "Base · Ana · <texto>" para las líneas que no traían autor (exportar,
// cerrar o reabrir el protocolo, solicitudes).
export function lineaConAutor(quien: string, texto: string): string {
  const v = validarNombreBase(quien);
  if (!v.ok) throw new Error("Falta el nombre de quien hace la acción.");
  return `Base · ${v.nombre} · ${texto}`;
}

// Control final antes de grabar en la línea de tiempo: toda línea de la
// Base lleva "Base · <nombre> · ...", y el nombre no puede faltar.
export function lineaBaseValida(texto: string): boolean {
  const m = /^Base · ([^·]*) · ./.exec(texto);
  return !!m && validarNombreBase(m[1]).ok;
}

const p2 = (n: number) => String(n).padStart(2, "0");
const hhmm = (t: number) => `${p2(new Date(t).getHours())}:${p2(new Date(t).getMinutes())}`;

// Solicitudes desde la Base (antes solo la creación dejaba línea).
export type AccionSolicitudBase = "pidió" | "respondió" | "resolvió" | "anuló";
export function lineaSolicitudBase(accion: AccionSolicitudBase, s: { titulo: string; prioridad?: string | null }, quien: string, ahora: number, extra?: string | null): string {
  const que =
    accion === "pidió"
      ? `pidió${s.prioridad === "urgente" ? " (urgente)" : ""}: «${s.titulo}»`
      : `${accion} la solicitud «${s.titulo}»${extra ? `: ${extra}` : ""}`;
  return lineaConAutor(quien, `${que} (${hhmm(ahora)})`);
}
