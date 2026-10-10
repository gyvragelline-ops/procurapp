// Cultivos: lógica pura (sin Supabase ni React), con tests. Un cultivo se
// da de alta pendiente y el resultado se completa SOBRE EL MISMO registro
// (no se duplica). No se borra: se anula. Corregir un resultado ya cargado
// deja la hora de la corrección en modificado_en ("corregido HH:MM").
import type { EstadoEtapa } from "./constants.ts";

export const TIPOS_CULTIVO = [
  { valor: "aspirado_traqueal", etiqueta: "Aspirado traqueal" },
  { valor: "hemocultivo", etiqueta: "Hemocultivos" },
  { valor: "punta_cvc", etiqueta: "Punta de CVC" },
  { valor: "punta_tam", etiqueta: "Punta de TAM" },
  { valor: "lcr", etiqueta: "LCR" },
  { valor: "urocultivo", etiqueta: "Urocultivo" },
  { valor: "otro", etiqueta: "Otro" },
] as const;
export type TipoCultivo = (typeof TIPOS_CULTIVO)[number]["valor"];
export type EstadoCultivo = "pendiente" | "negativo" | "positivo";

export const MAX_TIPO_OTRO = 60;
export const MAX_GERMEN = 120;
export const MAX_SENSIBILIDAD = 500;

export type Cultivo = {
  id: string;
  tipo: TipoCultivo;
  tipo_otro: string | null;
  tomado_en: string;
  estado: EstadoCultivo;
  germen: string | null;
  sensibilidad: string | null;
  resultado_en: string | null;
  modificado_en: string | null; // última corrección del resultado
  anulado: boolean;
};

const HORA = 3_600_000;
const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function etiquetaCultivo(c: Pick<Cultivo, "tipo" | "tipo_otro">): string {
  if (c.tipo === "otro") return c.tipo_otro?.trim() || "Otro";
  return TIPOS_CULTIVO.find((t) => t.valor === c.tipo)?.etiqueta ?? c.tipo;
}

// ---------------------------------------------------------------------
// Alta: tipo (y texto si es "otro") y hora de toma (no futura).
// ---------------------------------------------------------------------
export function validarAlta(
  entrada: { tipo: TipoCultivo | null; tipoOtro: string; tomadoEnIso: string | null },
  ahora: number
): { ok: true; datos: { tipo: TipoCultivo; tipo_otro: string | null; tomado_en: string } } | { ok: false; error: string } {
  if (!entrada.tipo) return { ok: false, error: "Elegí el tipo de cultivo." };
  const otro = entrada.tipoOtro.trim();
  if (entrada.tipo === "otro" && !otro) return { ok: false, error: "Escribí qué cultivo es." };
  if (!entrada.tomadoEnIso || Number.isNaN(new Date(entrada.tomadoEnIso).getTime())) return { ok: false, error: "Falta la fecha y hora de toma." };
  if (new Date(entrada.tomadoEnIso).getTime() > ahora) return { ok: false, error: "La toma no puede ser futura." };
  return {
    ok: true,
    datos: { tipo: entrada.tipo, tipo_otro: entrada.tipo === "otro" ? otro.slice(0, MAX_TIPO_OTRO) : null, tomado_en: entrada.tomadoEnIso },
  };
}

// ---------------------------------------------------------------------
// Resultado, sobre el mismo registro: SOLO estado, germen, sensibilidad,
// resultado_en y modificado_en (nunca el tipo ni la toma). Positivo exige
// germen (texto libre); negativo no guarda germen ni sensibilidad.
// modificado_en solo cuando se corrige un resultado ya cargado.
// ---------------------------------------------------------------------
export type CambiosResultado = {
  estado: "negativo" | "positivo";
  germen: string | null;
  sensibilidad: string | null;
  resultado_en: string;
  modificado_en: string | null;
};

export function validarResultado(
  cultivo: Pick<Cultivo, "tomado_en" | "estado" | "modificado_en">,
  entrada: { estado: EstadoCultivo | null; germen: string; sensibilidad: string; resultadoEnIso: string | null },
  ahora: number
): { ok: true; cambios: CambiosResultado } | { ok: false; error: string } {
  if (entrada.estado !== "negativo" && entrada.estado !== "positivo") return { ok: false, error: "Elegí negativo o positivo." };
  const germen = entrada.germen.trim();
  if (entrada.estado === "positivo" && !germen) return { ok: false, error: "Si es positivo, escribí el germen." };
  if (!entrada.resultadoEnIso || Number.isNaN(new Date(entrada.resultadoEnIso).getTime())) return { ok: false, error: "Falta la fecha y hora del resultado." };
  const t = new Date(entrada.resultadoEnIso).getTime();
  if (t > ahora) return { ok: false, error: "El resultado no puede ser futuro." };
  if (t < new Date(cultivo.tomado_en).getTime()) return { ok: false, error: "El resultado no puede ser anterior a la toma." };
  const sens = entrada.sensibilidad.trim();
  const positivo = entrada.estado === "positivo";
  return {
    ok: true,
    cambios: {
      estado: entrada.estado,
      germen: positivo ? germen.slice(0, MAX_GERMEN) : null,
      sensibilidad: positivo && sens ? sens.slice(0, MAX_SENSIBILIDAD) : null,
      resultado_en: entrada.resultadoEnIso,
      // Primera carga: sin marca. Corrección de un resultado ya cargado: la hora de ahora.
      modificado_en: cultivo.estado === "pendiente" ? cultivo.modificado_en : new Date(ahora).toISOString(),
    },
  };
}

// ---------------------------------------------------------------------
// Etapa (lista y barra de etapas): SOLO avance, como las demás. Gris sin
// cultivos, ámbar con alguno pendiente, verde si todos tienen resultado.
// Un positivo NO se marca afuera: se ve dentro de la etapa Cultivos y en
// la tarjeta de Alertas de la vista del médico. Lo anulado no cuenta.
// ---------------------------------------------------------------------
export function estadoEtapaCultivos(cultivos: Pick<Cultivo, "estado" | "anulado">[]): EstadoEtapa {
  const vigentes = cultivos.filter((c) => !c.anulado);
  if (vigentes.length === 0) return "gray";
  if (vigentes.some((c) => c.estado === "pendiente")) return "amber";
  return "green";
}

// ---------------------------------------------------------------------
// Vista del médico: positivo = línea en ALERTAS; pendiente = línea gris
// con las horas sin resultado. Lo anulado y lo negativo no aparecen.
// ---------------------------------------------------------------------
export function lineasCultivosMedico(cultivos: Cultivo[], ahora: number): { alertas: { id: string; texto: string }[]; pendientes: { id: string; texto: string }[] } {
  const vigentes = cultivos.filter((c) => !c.anulado).sort((a, b) => a.tomado_en.localeCompare(b.tomado_en));
  const alertas = vigentes
    .filter((c) => c.estado === "positivo")
    .map((c) => ({
      id: c.id,
      texto: `✕ ${etiquetaCultivo(c)} positivo · ${c.germen ?? "germen sin cargar"}${c.resultado_en ? ` · resultado ${hhmm(c.resultado_en)}` : ""}`,
    }));
  const pendientes = vigentes
    .filter((c) => c.estado === "pendiente")
    .map((c) => {
      const horas = Math.floor((ahora - new Date(c.tomado_en).getTime()) / HORA);
      return { id: c.id, texto: `${etiquetaCultivo(c)} pendiente ${horas < 1 ? "hace menos de 1 h" : `hace ${horas} h`}` };
    });
  return { alertas, pendientes };
}
