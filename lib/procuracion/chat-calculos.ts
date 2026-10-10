// Chat del donante (tabla mensajes_caso): lógica pura, con tests. Vive en
// la pantalla principal del donante, detrás del botón "Chat con la Base".
// Sin login todavía: el rol se elige a mano y se recuerda en el
// dispositivo; "míos" = los del rol elegido. Nada se borra: se anula.
// El globito de "sin leer" es la ÚNICA notificación permitida afuera de
// las etapas.

export const ROLES_CHAT = [
  { valor: "procurador", etiqueta: "Procurador" },
  { valor: "base", etiqueta: "Base" },
  { valor: "equipo", etiqueta: "Equipo" },
] as const;
export type RolChat = (typeof ROLES_CHAT)[number]["valor"];
export const MAX_MENSAJE = 1000;

export type MensajeCaso = { id: string; rol: RolChat; autor: string | null; texto: string; creado_en: string; anulado: boolean };

export function validarMensaje(entrada: { rol: RolChat | null; autor: string; texto: string }):
  | { ok: true; datos: { rol: RolChat; autor: string | null; texto: string } }
  | { ok: false; error: string } {
  if (!entrada.rol) return { ok: false, error: "Elegí quién escribe (Procurador, Base o Equipo)." };
  const texto = entrada.texto.trim();
  if (!texto) return { ok: false, error: "Escribí el mensaje." };
  if (texto.length > MAX_MENSAJE) return { ok: false, error: `El mensaje es demasiado largo (máximo ${MAX_MENSAJE} caracteres).` };
  const autor = entrada.autor.trim();
  return { ok: true, datos: { rol: entrada.rol, autor: autor ? autor.slice(0, 80) : null, texto } };
}

// Del más viejo al más nuevo (como un chat); los anulados quedan, tachados.
export function mensajesOrdenados(mensajes: MensajeCaso[]): MensajeCaso[] {
  return [...mensajes].sort((a, b) => a.creado_en.localeCompare(b.creado_en));
}

// "Míos" (a la derecha): los del rol elegido en este dispositivo.
export function esMio(m: Pick<MensajeCaso, "rol">, miRol: RolChat | null): boolean {
  return miRol !== null && m.rol === miRol;
}

// Sin leer: mensajes de OTROS roles, no anulados, posteriores a la última
// lectura en este dispositivo (sin lectura previa: todos los de otros).
export function contarNoLeidos(mensajes: MensajeCaso[], ultimaLectura: string | null, miRol: RolChat | null): number {
  return mensajes.filter((m) => !m.anulado && !esMio(m, miRol) && (ultimaLectura === null || m.creado_en > ultimaLectura)).length;
}

// Marca de lectura al abrir el chat: la hora del último mensaje.
export function marcaDeLectura(mensajes: MensajeCaso[]): string | null {
  const o = mensajesOrdenados(mensajes);
  return o.length ? o[o.length - 1].creado_en : null;
}

// ---------------------------------------------------------------------
// Quién habla y a quién. El destinatario NO se guarda: sale de la regla.
//   Procurador -> Base · Equipo -> Base · Base -> Procurador y Equipo
// ---------------------------------------------------------------------
export function destinatarios(rol: RolChat): RolChat[] {
  return rol === "base" ? ["procurador", "equipo"] : ["base"];
}

const ETIQUETA_ROL: Record<RolChat, string> = { procurador: "Procurador", base: "Base", equipo: "Equipo" };

// "Procurador → Base" / "Base → Procurador y Equipo"
export function textoDeA(rol: RolChat): string {
  return `${ETIQUETA_ROL[rol]} → ${destinatarios(rol).map((r) => ETIQUETA_ROL[r]).join(" y ")}`;
}

// Mensajes que llegaron entre dos lecturas (ids que antes no estaban), de
// OTRO rol y no anulados: los que disparan el aviso breve. Nada por los
// propios.
export function nuevosDeOtros(idsAntes: Set<string>, mensajes: MensajeCaso[], miRol: RolChat | null): MensajeCaso[] {
  return mensajesOrdenados(mensajes).filter((m) => !idsAntes.has(m.id) && !m.anulado && !esMio(m, miRol));
}

// "Base: texto cortado…" para el aviso breve.
export function textoAviso(m: Pick<MensajeCaso, "rol" | "texto">, max = 60): string {
  const t = m.texto.replace(/\s+/g, " ").trim();
  return `${ETIQUETA_ROL[m.rol]}: ${t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t}`;
}
