// Solicitudes del caso (tabla solicitudes): lógica pura, con tests. La
// Base las crea y las resuelve; el procurador las verá y responderá desde
// "Chat y pedidos" (segunda etapa). Nada se borra: se anula.

export const ROLES_SOLICITUD = [
  { valor: "base", etiqueta: "Base" },
  { valor: "procurador", etiqueta: "Procurador" },
  { valor: "equipo", etiqueta: "Equipo" },
] as const;
export type RolSolicitud = (typeof ROLES_SOLICITUD)[number]["valor"];

export const ESTADOS_SOLICITUD = [
  { valor: "pendiente", etiqueta: "Pendiente" },
  { valor: "derivada", etiqueta: "Derivada" },
  { valor: "en_proceso", etiqueta: "En proceso" },
  { valor: "completado", etiqueta: "Resuelta" },
] as const;
export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number]["valor"];
export type Prioridad = "normal" | "urgente";

// Una urgente sin respuesta pasado este tiempo bloquea al donante (rojo).
export const MINUTOS_URGENTE_SIN_RESPUESTA = 30;

export const MAX_TITULO = 200;
export const MAX_DETALLE = 1000;
export const MAX_NOMBRE = 80;

export type Solicitud = {
  id: string;
  donante_id: string;
  titulo: string;
  detalle: string | null;
  origen: RolSolicitud;
  destino: RolSolicitud;
  organo_key: string | null;
  estado: EstadoSolicitud;
  prioridad: Prioridad;
  pedido_por: string | null;
  respuesta: string | null;
  respondida_por: string | null;
  respondida_en: string | null;
  created_at: string;
  completed_at: string | null;
  anulado: boolean;
};

export type NuevaSolicitud = Pick<Solicitud, "titulo" | "detalle" | "origen" | "destino" | "organo_key" | "prioridad" | "pedido_por">;

const recortar = (x: string | null | undefined) => (x ?? "").trim();

export function validarSolicitud(entrada: {
  titulo: string;
  detalle: string;
  origen: RolSolicitud;
  destino: RolSolicitud | null;
  organoKey?: string | null;
  prioridad: Prioridad;
  pedidoPor: string;
}): { ok: true; datos: NuevaSolicitud } | { ok: false; error: string } {
  const titulo = recortar(entrada.titulo);
  if (!titulo) return { ok: false, error: "Escribí qué se pide." };
  if (titulo.length > MAX_TITULO) return { ok: false, error: `El pedido es demasiado largo (máximo ${MAX_TITULO} caracteres).` };
  if (!entrada.destino) return { ok: false, error: "Elegí a quién va el pedido." };
  if (entrada.destino === entrada.origen) return { ok: false, error: "El pedido tiene que ir a otro rol." };
  const detalle = recortar(entrada.detalle);
  if (detalle.length > MAX_DETALLE) return { ok: false, error: `El detalle es demasiado largo (máximo ${MAX_DETALLE} caracteres).` };
  const pedidoPor = recortar(entrada.pedidoPor).slice(0, MAX_NOMBRE);
  return {
    ok: true,
    datos: {
      titulo,
      detalle: detalle || null,
      origen: entrada.origen,
      destino: entrada.destino,
      organo_key: entrada.organoKey ?? null,
      prioridad: entrada.prioridad,
      pedido_por: pedidoPor || null,
    },
  };
}

export function validarRespuesta(texto: string, nombre: string): { ok: true; respuesta: string; respondidaPor: string | null } | { ok: false; error: string } {
  const r = recortar(texto);
  if (!r) return { ok: false, error: "Escribí la respuesta." };
  if (r.length > MAX_DETALLE) return { ok: false, error: `La respuesta es demasiado larga (máximo ${MAX_DETALLE} caracteres).` };
  const n = recortar(nombre).slice(0, MAX_NOMBRE);
  return { ok: true, respuesta: r, respondidaPor: n || null };
}

// Columnas que cambia cada acción (update por columna, sin delete).
export function cambiosAlResponder(respuesta: string, respondidaPor: string | null, ahoraIso: string) {
  return { respuesta, respondida_por: respondidaPor, respondida_en: ahoraIso, estado: "en_proceso" as const };
}
export function cambiosAlResolver(ahoraIso: string) {
  return { estado: "completado" as const, completed_at: ahoraIso };
}

export const esAbierta = (s: Pick<Solicitud, "estado" | "anulado">) => !s.anulado && s.estado !== "completado";
export const sinRespuesta = (s: Pick<Solicitud, "estado" | "anulado" | "respuesta">) => esAbierta(s) && !recortar(s.respuesta);

export function minutosDesde(iso: string, ahora: number): number {
  return Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 60_000));
}

// Urgente, abierta, sin respuesta, hace MÁS de 30 min.
export function urgenteVencida(s: Pick<Solicitud, "estado" | "anulado" | "respuesta" | "prioridad" | "created_at">, ahora: number): boolean {
  return s.prioridad === "urgente" && sinRespuesta(s) && minutosDesde(s.created_at, ahora) > MINUTOS_URGENTE_SIN_RESPUESTA;
}

// Abiertas primero (urgentes antes, y la más vieja antes); después las
// resueltas, la más nueva arriba. Las anuladas al final.
export function ordenarSolicitudes<T extends Pick<Solicitud, "estado" | "anulado" | "prioridad" | "created_at" | "id">>(xs: T[]): T[] {
  const grupo = (s: T) => (s.anulado ? 2 : esAbierta(s) ? 0 : 1);
  return [...xs].sort((a, b) => {
    const g = grupo(a) - grupo(b);
    if (g) return g;
    if (grupo(a) === 0) {
      const p = (a.prioridad === "urgente" ? 0 : 1) - (b.prioridad === "urgente" ? 0 : 1);
      if (p) return p;
      return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
    }
    return b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id);
  });
}

export const etiquetaRol = (r: RolSolicitud) => ROLES_SOLICITUD.find((x) => x.valor === r)?.etiqueta ?? r;
export const etiquetaEstado = (e: EstadoSolicitud) => ESTADOS_SOLICITUD.find((x) => x.valor === e)?.etiqueta ?? e;
