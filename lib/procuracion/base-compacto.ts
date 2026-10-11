// Base operativa · Expediente compacto (diseño handoff/disenos/
// Base-Expediente-Compacto.dc.html). Lógica pura, con tests: la línea de
// progreso de etapas, las tarjetas que agrupan varias etapas y el
// laboratorio condensado por sistema. No cambia qué se copia ni qué se
// comparte: el texto sigue saliendo de base-secciones.

import type { ExpedienteDatos } from "./base-armado.ts";
import type { EtapaBarra } from "./base-tablero.ts";
import type { EstadoEtapa } from "./constants.ts";
import { SISTEMAS, filaParametro, textoValor } from "./base-expediente.ts";
import { LAB_POR_SISTEMA, horaTexto, type ContenidoSeccion, type FilaSeccion, type GrupoSeccion } from "./base-secciones.ts";

// ------------------------------------------------- línea de progreso
export const ETIQUETA_CORTA: Record<string, string> = {
  potencial: "Datos",
  me: "Neuro",
  certificacion: "Auxiliares",
  comMuerte: "Com. muerte",
  comDonacion: "Com. donación",
  muestras: "Muestras",
  medidas: "Medidas",
  labImagenes: "Lab. e imág.",
  cultivos: "Cultivos",
  documentacion: "Document.",
  mantenimiento: "Mantenim.",
  judicial: "Judicial",
  quirofano: "Quirófano",
  entregaCorneas: "Córneas",
};

// Tarjeta a la que lleva cada etapa (id del elemento: sec-<tarjeta>).
// Documentación no tiene tarjeta: lleva a 01.
export const TARJETA_DE_ETAPA: Record<string, string> = {
  potencial: "potencial",
  documentacion: "potencial",
  me: "certificacion",
  certificacion: "certificacion",
  comMuerte: "comunicacion",
  comDonacion: "comunicacion",
  muestras: "comunicacion",
  medidas: "medidas",
  labImagenes: "laboratorios",
  cultivos: "cultivos",
  mantenimiento: "mantenimiento",
  judicial: "judicial",
  quirofano: "quirofano",
};
export const tarjetaDeEtapa = (key: string) => TARJETA_DE_ETAPA[key] ?? "potencial";

export type SegmentoProgreso = { key: string; numero: number; etiqueta: string; estado: EstadoEtapa; manual: boolean; tarjeta: string };

// ✓ = la etapa fue marcada completa a mano.
export function progresoEtapas(barra: EtapaBarra[], marcas: Record<string, { marca: string } | undefined>): SegmentoProgreso[] {
  return barra.map((e) => ({
    key: e.key,
    numero: e.numero,
    etiqueta: ETIQUETA_CORTA[e.key] ?? e.label,
    estado: e.estado,
    manual: marcas[e.key]?.marca === "completo",
    tarjeta: tarjetaDeEtapa(e.key),
  }));
}

// "02·03" (dos etapas) · "04–06" (tres o más). Sin números: "".
const p2 = (n: number) => String(n).padStart(2, "0");
export function numeroTarjeta(numeros: number[]): string {
  const xs = [...numeros].sort((a, b) => a - b);
  if (!xs.length) return "";
  if (xs.length === 1) return p2(xs[0]);
  if (xs.length === 2) return `${p2(xs[0])}·${p2(xs[1])}`;
  return `${p2(xs[0])}–${p2(xs[xs.length - 1])}`;
}

// Estado del encabezado de la tarjeta, a partir de sus etapas.
export type EstadoTarjeta = { texto: string; color: "g" | "a" | "r" | "mu"; detalle: string[] };
export function estadoTarjeta(etapas: { estado: EstadoEtapa; pendientes: string[] }[]): EstadoTarjeta {
  if (!etapas.length) return { texto: "", color: "mu", detalle: [] };
  const pendientes = etapas.flatMap((e) => (e.estado === "green" ? [] : e.pendientes));
  if (etapas.some((e) => e.estado === "red")) return { texto: "bloqueada", color: "r", detalle: pendientes };
  if (etapas.every((e) => e.estado === "green")) return { texto: "completa", color: "g", detalle: [] };
  if (etapas.every((e) => e.estado === "gray")) return { texto: "sin iniciar", color: "mu", detalle: pendientes };
  if (pendientes.length) return { texto: `${pendientes.length} pendiente${pendientes.length === 1 ? "" : "s"}`, color: "a", detalle: pendientes };
  return { texto: "en curso", color: "a", detalle: [] };
}

// ------------------------------------------ tarjetas que agrupan etapas
// Una sola tarjeta con el contenido de varias secciones (cada una con su
// subtítulo). Copiar y compartir sacan el texto de todas juntas.
export function unirSecciones(clave: string, numero: string, titulo: string, partes: { c: ContenidoSeccion; subtitulo: string }[]): ContenidoSeccion {
  const grupos: GrupoSeccion[] = [];
  const soloBase: GrupoSeccion[] = [];
  for (const { c, subtitulo } of partes) {
    const conFilas = c.grupos.filter((g) => g.filas.length);
    if (!conFilas.length) {
      if (c.vacio && !c.imagenes.length) grupos.push({ titulo: subtitulo, filas: [{ etiqueta: subtitulo, valor: c.vacio }] });
    } else {
      conFilas.forEach((g, i) => grupos.push({ titulo: i === 0 ? (g.titulo ? `${subtitulo} · ${g.titulo}` : subtitulo) : g.titulo, filas: g.filas }));
    }
    soloBase.push(...c.soloBase);
  }
  const hasta = partes.map((p) => p.c.datosHasta).filter((x): x is string => !!x);
  return {
    clave,
    numero,
    titulo,
    grupos,
    soloBase,
    imagenes: partes.flatMap((p) => p.c.imagenes),
    datosHasta: hasta.length ? [...hasta].sort()[hasta.length - 1] : null,
    acciones: { copiar: partes.some((p) => p.c.acciones.copiar), compartir: partes.some((p) => p.c.acciones.compartir) },
    vacio: null,
  };
}

// ---------------------------------------------- laboratorio condensado
// Un renglón por sistema: "Urea 38 mg/dL · Creatinina 1,2 mg/dL", con la
// hora que comparten más valores (si empatan, la más nueva). Un valor de
// otra hora lleva la suya al lado.
const PARAMETROS = new Map(SISTEMAS.flatMap((s) => s.parametros.map((x) => [x.clave, x] as const)));

export function laboratorioCondensado(d: Pick<ExpedienteDatos, "fuentes">, ahora: number): FilaSeccion[] {
  const fuentes = { ...d.fuentes, registros: [], mediciones: [] }; // solo laboratorio
  return LAB_POR_SISTEMA.flatMap((s) => {
    const vals = s.claves.flatMap((k) => {
      const par = PARAMETROS.get(k);
      if (!par) return [];
      const f = filaParametro(par, fuentes, ahora);
      if (!f.ultimo) return [];
      return [{ texto: `${par.etiqueta} ${textoValor(f.ultimo.valor, par.decimales)}${f.unidad ? ` ${f.unidad}` : ""}`, hora: horaTexto(f.ultimo.en, ahora), en: f.ultimo.en }];
    });
    if (!vals.length) return [];
    const cuantos = (h: string) => vals.filter((v) => v.hora === h).length;
    const ref = vals.reduce((a, v) => (cuantos(v.hora) > cuantos(a.hora) || (cuantos(v.hora) === cuantos(a.hora) && v.en > a.en) ? v : a));
    return [{ etiqueta: s.titulo, valor: vals.map((v) => (v.hora === ref.hora ? v.texto : `${v.texto} (${v.hora})`)).join(" · "), detalle: ref.hora }];
  });
}
