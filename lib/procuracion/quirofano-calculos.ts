// Hora de quirófano, aviso de los equipos y chat del caso: lógica pura
// (sin Supabase ni React), con tests. Sin login todavía: la Base carga en
// nombre del equipo, con "informado por" (equipo + medio). Nada se borra:
// se anula. Nada de esto se muestra fuera de su etapa.
import type { EstadoEtapa } from "./constants.ts";

const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const ddmm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// ---------------------------------------------------------------------
// Hora de quirófano: cada cambio es una fila nueva; la vigente es la
// última no anulada. Los cambios quedan como historial dentro de la etapa.
// ---------------------------------------------------------------------
export type HorarioQuirofano = { id: string; hora: string; registrado_en: string; anulado: boolean };

const porRegistro = <T extends { registrado_en: string }>(xs: T[]) => [...xs].sort((a, b) => a.registrado_en.localeCompare(b.registrado_en));

export function horaVigente(horarios: HorarioQuirofano[]): HorarioQuirofano | null {
  const v = porRegistro(horarios.filter((h) => !h.anulado));
  return v[v.length - 1] ?? null;
}

// "14:00 → 16:30 (10/10) · cambiado 10:12" -- del más nuevo al más viejo.
export function historialHora(horarios: HorarioQuirofano[]): { id: string; texto: string }[] {
  const v = porRegistro(horarios.filter((h) => !h.anulado));
  return v
    .map((h, i) => {
      const hora = `${hhmm(h.hora)} (${ddmm(h.hora)})`;
      const texto = i === 0 ? `${hora} · cargada ${hhmm(h.registrado_en)}` : `${hhmm(v[i - 1].hora)} → ${hora} · cambiado ${hhmm(h.registrado_en)}`;
      return { id: h.id, texto };
    })
    .reverse();
}

export function validarHora(horaIso: string | null): { ok: true; hora: string } | { ok: false; error: string } {
  if (!horaIso || Number.isNaN(new Date(horaIso).getTime())) return { ok: false, error: "Falta la fecha y hora de quirófano." };
  return { ok: true, hora: horaIso };
}

export function estadoEtapaQuirofano(horarios: HorarioQuirofano[]): EstadoEtapa {
  return horaVigente(horarios) ? "green" : "gray";
}

// ---------------------------------------------------------------------
// Aviso de los equipos
// ---------------------------------------------------------------------
export const ORGANOS_EQUIPO = [
  { valor: "corazon", etiqueta: "Corazón" },
  { valor: "pulmones", etiqueta: "Pulmones" },
  { valor: "higado", etiqueta: "Hígado" },
  { valor: "rinones", etiqueta: "Riñones" },
  { valor: "pancreas", etiqueta: "Páncreas" },
  { valor: "intestino", etiqueta: "Intestino" },
  { valor: "otro", etiqueta: "Otro" },
] as const;
export type OrganoEquipo = (typeof ORGANOS_EQUIPO)[number]["valor"];

export const MEDIOS_AVISO = [
  { valor: "telefono", etiqueta: "Teléfono" },
  { valor: "whatsapp", etiqueta: "WhatsApp" },
  { valor: "mail", etiqueta: "Mail" },
  { valor: "presencial", etiqueta: "Presencial" },
  { valor: "otro", etiqueta: "Otro" },
] as const;
export type MedioAviso = (typeof MEDIOS_AVISO)[number]["valor"];

export const ANESTESISTA = [
  { valor: "si", etiqueta: "Sí" },
  { valor: "no", etiqueta: "No" },
  { valor: "sin_confirmar", etiqueta: "Sin confirmar" },
] as const;
export type Anestesista = (typeof ANESTESISTA)[number]["valor"];

export type EquipoQuirofano = {
  id: string;
  equipo: string;
  organos: OrganoEquipo[];
  organo_otro: string | null;
  anestesista: Anestesista;
  informado_por: string | null;
  medio: MedioAviso | null;
  creado_en: string;
  modificado_en: string | null;
  anulado: boolean;
};

export type DatosEquipo = Pick<EquipoQuirofano, "equipo" | "organos" | "organo_otro" | "anestesista" | "informado_por" | "medio">;

export function validarEquipo(entrada: {
  equipo: string;
  organos: OrganoEquipo[];
  organoOtro: string;
  anestesista: Anestesista | null;
  informadoPor: string;
  medio: MedioAviso | null;
}): { ok: true; datos: DatosEquipo } | { ok: false; error: string } {
  const equipo = entrada.equipo.trim();
  if (!equipo) return { ok: false, error: "Falta el nombre del equipo." };
  const organos = ORGANOS_EQUIPO.map((o) => o.valor).filter((o) => entrada.organos.includes(o));
  if (organos.length === 0) return { ok: false, error: "Elegí al menos un órgano." };
  const otro = entrada.organoOtro.trim();
  if (organos.includes("otro") && !otro) return { ok: false, error: "Escribí cuál es el otro órgano." };
  const informado = entrada.informadoPor.trim();
  return {
    ok: true,
    datos: {
      equipo: equipo.slice(0, 80),
      organos,
      organo_otro: organos.includes("otro") ? otro.slice(0, 60) : null,
      anestesista: entrada.anestesista ?? "sin_confirmar",
      informado_por: informado ? informado.slice(0, 80) : null,
      medio: entrada.medio,
    },
  };
}

export function textoOrganos(e: Pick<EquipoQuirofano, "organos" | "organo_otro">): string {
  return e.organos
    .map((o) => (o === "otro" ? (e.organo_otro ?? "Otro") : (ORGANOS_EQUIPO.find((x) => x.valor === o)?.etiqueta ?? o)))
    .join(", ");
}

// Equipos vigentes en el orden en que se cargaron.
export function equiposVigentes(equipos: EquipoQuirofano[]): EquipoQuirofano[] {
  return equipos.filter((e) => !e.anulado).sort((a, b) => a.creado_en.localeCompare(b.creado_en));
}

// ---------------------------------------------------------------------
// Chat del caso (al pie de la etapa; sin avisos afuera)
// ---------------------------------------------------------------------
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

// ---------------------------------------------------------------------
// Intervención judicial: foto del precario y de la autorización del juez.
// Gris sin fotos, ámbar con una de las dos, verde con las dos.
// ---------------------------------------------------------------------
export function estadoEtapaJudicial(fotos: { tipo: string }[]): EstadoEtapa {
  const precario = fotos.some((f) => f.tipo === "precario");
  const juez = fotos.some((f) => f.tipo === "autorizacion_juez");
  if (precario && juez) return "green";
  if (precario || juez) return "amber";
  return "gray";
}
