// Marca manual por etapa (columnas marcado_manual / marcado_en de
// etapas_estado): lógica pura, con tests. La marca manual PREVALECE sobre
// el estado calculado; el cálculo se sigue mostrando como nota cuando no
// coincide. Sin IA: reglas fijas.

import type { EstadoEtapa } from "./constants.ts";

export type MarcaManual = "completo" | "no_completo";
export type MarcaEtapa = { marca: MarcaManual; en: string | null };

export type EstadoConMarca = {
  estado: EstadoEtapa;
  manual: boolean; // el estado sale de la marca
  // Marcada completa pero el sistema calcula que faltan datos.
  faltanDatos: boolean;
};

// completo     -> verde (si el cálculo no daba verde, se avisa en gris adentro)
// no_completo  -> si el cálculo daba verde, ámbar; si no, el cálculo
// sin marca    -> el cálculo (sin dato, gris)
export function estadoConMarca(calculado: EstadoEtapa | undefined, marca: MarcaManual | null | undefined): EstadoConMarca {
  const c: EstadoEtapa = calculado ?? "gray";
  if (marca === "completo") return { estado: "green", manual: true, faltanDatos: c !== "green" };
  if (marca === "no_completo") return { estado: c === "green" ? "amber" : c, manual: true, faltanDatos: false };
  return { estado: c, manual: false, faltanDatos: false };
}

// La primera etapa (en el orden de la lista) que no está completa: se
// resalta con un anillo en la franja de luces. null si están todas.
export function primeraNoCompleta(keys: string[], estadoDe: (key: string) => EstadoEtapa | undefined): string | null {
  return keys.find((k) => estadoDe(k) !== "green") ?? null;
}

// Texto para la línea de tiempo del caso.
export function textoTimelineMarca(etiqueta: string, marca: MarcaManual | null, hora: string): string {
  if (marca === "completo") return `${etiqueta} — marcada completa manualmente (${hora})`;
  if (marca === "no_completo") return `${etiqueta} — marcada no completa manualmente (${hora})`;
  return `${etiqueta} — se quitó la marca manual; vuelve al cálculo (${hora})`;
}

// El botón ofrece lo contrario de lo que se ve ahora.
export function proximaMarca(estadoVisible: EstadoEtapa): MarcaManual {
  return estadoVisible === "green" ? "no_completo" : "completo";
}

export const esMarca = (x: unknown): x is MarcaManual => x === "completo" || x === "no_completo";
