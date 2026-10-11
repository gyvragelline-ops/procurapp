// Distribución por órgano (solo Base): cruza los requisitos de cada
// equipo (distribucion-requisitos.ts, A VALIDAR CON PROTOCOLO
// CUCAIBA/INCUCAI) con lo cargado en la app, arma el mensaje de WhatsApp
// y la línea de la línea de tiempo. Lógica pura, con tests.
//
// Reglas:
// - Se manda SOLO lo que la Base deja tildado. Lo tildado que falta sale
//   como "Pendiente".
// - Sin nombre ni DNI: se identifica por PD (identificacionCorta).
// - La app no juzga la aptitud; el mensaje cierra con CIERRE_FICHA.

import type { ExpedienteDatos } from "./base-armado.ts";
import { SISTEMAS, filaParametro, serie, textoValor } from "./base-expediente.ts";
import { horaTexto, organosVigentes } from "./base-secciones.ts";
import { fio2Valida, pafiGasometria, respiradorVigenteEn, textoFio2, textoFio2Despues } from "./mantenimiento-calculos.ts";
import { DROGAS_INFUSION, MODOS_RESPIRADOR, RANGOS_A_VERIFICAR, type DrogaInfusion } from "./mantenimiento-metas.ts";
import { ANESTESISTA, horaVigente, type EquipoQuirofano } from "./quirofano-calculos.ts";
import { TIPOS_CULTIVO } from "./cultivos-calculos.ts";
import { CAMPOS_PLANILLA } from "./medidas-campos.ts";
import { lineaConAutor } from "./base-nombre.ts";
import {
  CIERRE_FICHA,
  ITEMS_COMUNES,
  ORGANOS_DISTRIBUCION,
  PERIMETROS_TORACICOS,
  RX_TORAX_HORAS_AVISO,
  type ClaveDato,
  type ConfigOrgano,
  type Requisito,
  type TipoRequisito,
} from "./distribucion-requisitos.ts";

export { ORGANOS_DISTRIBUCION, CIERRE_FICHA };

// ✓ listo · ○ falta · ! informativo (o aviso, como la Rx de más de 12 h)
// · "a verificar": valor inverosímil (RANGOS_A_VERIFICAR); se muestra así
// y NO se manda como dato.
export type Marca = "listo" | "falta" | "info" | "verificar";
export const SIMBOLO: Record<Marca, string> = { listo: "✓", falta: "○", info: "!", verificar: "!" };
export const A_VERIFICAR = "a verificar";

export type Evaluado = {
  clave: string;
  etiqueta: string;
  tipo: TipoRequisito | "comun";
  marca: Marca;
  valor: string; // corto, para la banda
  linea: string | null; // para el mensaje; null = no hay nada que mandar
  hora: string | null; // ISO del dato más nuevo que usa
  nota: string | null;
};

type Datos = Pick<ExpedienteDatos, "donante" | "fuentes" | "cultivos" | "estudios" | "planillas" | "equipos" | "organosAceptados" | "insumos">;

// ------------------------------------------------------------ formatos
const p2 = (n: number) => String(n).padStart(2, "0");
const hhmm = (t: number) => `${p2(new Date(t).getHours())}:${p2(new Date(t).getMinutes())}`;
const num = (v: number | string, dec = 0) => (typeof v === "number" ? textoValor(v, dec) : v);
const PARAMETROS = new Map(SISTEMAS.flatMap((s) => s.parametros.map((x) => [x.clave, x] as const)));
const mayor = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x).sort().pop() ?? null;

// Último valor de un parámetro del expediente, con su unidad y su hora.
function ultimo(d: Datos, clave: string, ahora: number): { texto: string; en: string; etiqueta: string } | null {
  const par = PARAMETROS.get(clave);
  if (!par) return null;
  const f = filaParametro(par, d.fuentes, ahora);
  if (!f.ultimo) return null;
  return { texto: `${num(f.ultimo.valor, par.decimales)}${f.unidad ? ` ${f.unidad}` : ""}`, en: f.ultimo.en, etiqueta: par.etiqueta };
}

// Varios parámetros: los que hay, con su nombre; los que faltan, aparte.
function varios(d: Datos, claves: string[], ahora: number, corto?: Record<string, string>) {
  const hay: { clave: string; texto: string; en: string; etiqueta: string }[] = [];
  const faltan: string[] = [];
  for (const k of claves) {
    const u = ultimo(d, k, ahora);
    const et = corto?.[k] ?? PARAMETROS.get(k)?.etiqueta ?? k;
    if (u) hay.push({ ...u, clave: k, etiqueta: et });
    else faltan.push(et);
  }
  return { hay, faltan, hora: mayor(hay.map((x) => x.en)) };
}

const ev = (r: Pick<Evaluado, "clave" | "etiqueta" | "tipo">, x: Partial<Evaluado> & Pick<Evaluado, "marca" | "valor">): Evaluado => ({ linea: null, hora: null, nota: null, ...r, ...x });

function deVarios(r: Requisito, v: ReturnType<typeof varios>, ahora: number): Evaluado {
  if (!v.hay.length) return ev(r, { marca: "falta", valor: "falta" });
  const lista = v.hay.map((x) => `${x.etiqueta} ${x.texto}`).join(" · ");
  const linea = `${lista} (${horaTexto(v.hora!, ahora)})${v.faltan.length ? ` · pendiente: ${v.faltan.join(", ")}` : ""}`;
  return ev(r, { marca: v.faltan.length ? "falta" : "listo", valor: v.faltan.length ? `falta ${v.faltan.join(", ")}` : horaTexto(v.hora!, ahora), linea, hora: v.hora });
}

// Último estudio de alguno de esos tipos.
function estudio(d: Datos, tipos: string[]) {
  return [...d.estudios].filter((e) => tipos.includes(e.tipo_estudio)).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}
function deEstudio(r: Requisito, d: Datos, tipos: string[], nombre: string, ahora: number): Evaluado {
  const e = estudio(d, tipos);
  if (!e) return ev(r, { marca: "falta", valor: "falta", nota: r.nota ?? null });
  return ev(r, { marca: "listo", valor: horaTexto(e.created_at, ahora), linea: `${nombre}: cargado ${horaTexto(e.created_at, ahora)}${e.descripcion ? ` (${e.descripcion})` : ""}`, hora: e.created_at, nota: r.nota ?? null });
}

function cultivo(r: Requisito, d: Datos, tipo: string, ahora: number): Evaluado {
  const cs = d.cultivos.filter((c) => !c.anulado && c.tipo === tipo).sort((a, b) => b.tomado_en.localeCompare(a.tomado_en));
  if (!cs.length) return ev(r, { marca: "falta", valor: "falta" });
  const nombre = TIPOS_CULTIVO.find((t) => t.valor === tipo)?.etiqueta ?? tipo;
  const estado = (e: string) => (e === "pendiente" ? "pendiente" : e === "positivo" ? "positivo" : "negativo");
  const partes = cs.map((c) => `${estado(c.estado)}${c.germen ? ` (${c.germen})` : ""}, toma ${horaTexto(c.tomado_en, ahora)}`);
  return ev(r, { marca: "listo", valor: estado(cs[0].estado), linea: `${nombre}: ${partes.join(" · ")}`, hora: cs[0].tomado_en });
}

// ------------------------------------------------- un requisito con datos
function evaluarDato(r: Requisito, dato: ClaveDato, d: Datos, ahora: number): Evaluado {
  const f = d.fuentes;
  switch (dato) {
    case "pafi": {
      // FiO2 en fracción; si no se puede calcular, el motivo (nunca un número)
      const x = pafiGasometria(f.lab as never, f.respirador, ahora);
      if (!x.ok) return ev(r, { marca: "falta", valor: x.motivo, linea: x.medido_en ? `PaO₂/FiO₂: ${x.motivo}` : null, hora: x.medido_en });
      if (x.aVerificar) return ev(r, { marca: "verificar", valor: A_VERIFICAR, hora: x.medido_en, nota: `PaO₂/FiO₂ ${num(x.valor)}: fuera de lo verosímil (hasta ${RANGOS_A_VERIFICAR.pafi.max})` });
      const extra = [`FiO₂ ${textoFio2(x.fio2)}`, x.peep !== null ? `PEEP ${num(x.peep)}` : null].filter(Boolean).join(" · ");
      const despues = x.minutosDespues !== null ? textoFio2Despues(x.minutosDespues) : null;
      return ev(r, {
        marca: "listo",
        valor: `${num(x.valor)} · ${extra}`,
        linea: [`PaO₂/FiO₂ ${num(x.valor)}`, extra, despues].filter(Boolean).join(" · "),
        hora: x.medido_en,
        nota: despues,
      });
    }
    case "rx_torax": {
      const e = estudio(d, ["Rx_torax"]);
      if (!e) return ev(r, { marca: "falta", valor: "falta" });
      const h = Math.max(0, Math.floor((ahora - new Date(e.created_at).getTime()) / 3_600_000));
      const vieja = h > RX_TORAX_HORAS_AVISO;
      return ev(r, {
        marca: vieja ? "info" : "listo",
        valor: `de hace ${h} h`,
        linea: `Rx de tórax: ${horaTexto(e.created_at, ahora)} (de hace ${h} h)`,
        hora: e.created_at,
        nota: vieja ? `más de ${RX_TORAX_HORAS_AVISO} h` : null,
      });
    }
    case "fibrobroncoscopia":
      return deEstudio(r, d, ["Broncoscopia"], "Fibrobroncoscopia", ahora);
    case "ecocardiograma":
      return deEstudio(r, d, ["Ecocardiograma"], "Ecocardiograma", ahora);
    case "ecg":
      return deEstudio(r, d, ["ECG"], "ECG", ahora);
    case "coronariografia": {
      const e = deEstudio(r, d, ["Coronariografia"], "Cinecoronariografía", ahora);
      return { ...e, nota: d.donante.edad !== null ? `edad ${d.donante.edad} años` : null };
    }
    // Hasta la Fase 3 hay un solo tipo "Ecografía" (sin distinguir).
    case "ecografia_renal":
      return deEstudio(r, d, ["Eco_renal", "Ecografia"], "Ecografía", ahora);
    case "ecografia_abdominal":
      return deEstudio(r, d, ["Eco_abdominal", "Ecografia"], "Ecografía", ahora);
    case "talla_perimetros": {
      const talla = d.donante.talla;
      const per = PERIMETROS_TORACICOS.flatMap((k) => {
        const v = d.planillas.medidas[k];
        const et = CAMPOS_PLANILLA.find((c) => c.key === k)?.label.replace(/^\d+\.\s*/, "") ?? k;
        return v && v.trim() ? [`${et} ${v} cm`] : [];
      });
      const partes = [talla !== null ? `Talla ${num(talla)} cm` : null, ...per].filter((x): x is string => !!x);
      if (!partes.length) return ev(r, { marca: "falta", valor: "falta" });
      const faltan = [talla === null ? "talla" : null, per.length ? null : "perímetro torácico"].filter(Boolean);
      return ev(r, { marca: faltan.length ? "falta" : "listo", valor: faltan.length ? `falta ${faltan.join(", ")}` : partes.map((p) => p.replace(/^[^\d]+/, "")).join(" · "), linea: partes.join(" · ") + (faltan.length ? ` · pendiente: ${faltan.join(", ")}` : "") });
    }
    case "respirador": {
      const e = respiradorVigenteEn(f.respirador, Infinity);
      if (!e) return ev(r, { marca: "falta", valor: "falta" });
      const modo = e.modo ? (e.modo === "otro" ? e.modo_otro ?? "Otro" : MODOS_RESPIRADOR.find((m) => m.valor === e.modo)?.etiqueta ?? e.modo) : null;
      const partes = [
        modo,
        e.volumen_corriente !== null ? `VT ${num(e.volumen_corriente)} mL` : null,
        e.frecuencia !== null ? `FR ${num(e.frecuencia)}` : null,
        e.peep !== null ? `PEEP ${num(e.peep)}` : null,
        e.fio2 !== null ? (fio2Valida(e.fio2) ? `FiO₂ ${textoFio2(e.fio2)}` : `FiO₂ ${A_VERIFICAR}`) : null,
        e.presion_plateau !== null ? `plateau ${num(e.presion_plateau)}` : null,
        e.presion_pico !== null ? `pico ${num(e.presion_pico)}` : null,
      ].filter((x): x is string => !!x);
      return ev(r, { marca: "listo", valor: partes.slice(0, 3).join(" · ") || horaTexto(e.registrado_en, ahora), linea: `Respirador (${horaTexto(e.registrado_en, ahora)}): ${partes.join(" · ")}`, hora: e.registrado_en });
    }
    case "cultivo_aspirado":
      return cultivo(r, d, "aspirado_traqueal", ahora);
    case "hemocultivos":
      return cultivo(r, d, "hemocultivo", ahora);
    case "vasoactivos": {
      const drogas = (["noradrenalina", "adrenalina", "dopamina", "dobutamina", "vasopresina"] as DrogaInfusion[]).flatMap((dr) => {
        const u = ultimo(d, `droga:${dr}`, ahora);
        return u ? [{ ...u, nombre: DROGAS_INFUSION[dr].etiqueta }] : [];
      });
      if (drogas.length) {
        const t = drogas.map((x) => `${x.nombre} ${x.texto}`).join(" · ");
        const hora = mayor(drogas.map((x) => x.en));
        return ev(r, { marca: "listo", valor: t, linea: `Vasoactivos: ${t} (${horaTexto(hora!, ahora)})`, hora });
      }
      // con registros de enfermería y ninguna bomba en curso: dato real "ninguno"
      const hayRegistros = f.registros.some((x) => !x.anulado);
      return hayRegistros ? ev(r, { marca: "listo", valor: "ninguno en curso", linea: "Vasoactivos: ninguno en curso" }) : ev(r, { marca: "falta", valor: "falta" });
    }
    case "troponina_cpkmb":
      return deVarios(r, varios(d, ["troponina", "cpk_mb"], ahora), ahora);
    case "pam":
      return deVarios(r, varios(d, ["pam"], ahora), ahora);
    case "sodio":
      return deVarios(r, varios(d, ["na"], ahora), ahora);
    case "sedimento_proteinuria":
      return deVarios(r, varios(d, ["sedimento", "proteinuria"], ahora), ahora);
    case "hepatograma":
      return deVarios(r, varios(d, ["tgo", "tgp", "bili_total", "bili_directa", "fal", "ggt"], ahora, { tgo: "TGO", tgp: "TGP", bili_total: "BT", bili_directa: "BD", fal: "FA", ggt: "GGT" }), ahora);
    case "tp_kptt":
      return deVarios(r, varios(d, ["tp", "kptt"], ahora, { tp: "TP", kptt: "KPTT" }), ahora);
    case "amilasa_lipasa":
      return deVarios(r, varios(d, ["amilasa", "lipasa"], ahora), ahora);
    case "diuresis_balance": {
      // diuresis inverosímil de una fila horaria: "a verificar", no se manda
      const dz = serie("diuresis_ml", f, ahora);
      const d0 = dz[dz.length - 1];
      const rg = RANGOS_A_VERIFICAR.diuresis_ml;
      if (d0 && typeof d0.valor === "number" && (d0.valor < rg.min || d0.valor > rg.max))
        return ev(r, { marca: "verificar", valor: A_VERIFICAR, hora: d0.en, nota: `Diuresis ${num(d0.valor)} mL: fuera de lo verosímil (${rg.min}–${rg.max} mL por fila)` });
      return deVarios(r, varios(d, ["diuresis_ml", "balance_acumulado"], ahora, { diuresis_ml: "Diuresis", balance_acumulado: "Balance acumulado" }), ahora);
    }
    case "creatinina_urea": {
      const cr = serie("creatinina", f, ahora);
      const urea = ultimo(d, "urea", ahora);
      if (!cr.length && !urea) return ev(r, { marca: "falta", valor: "falta" });
      const fmt = (x: { valor: number | string; en: string }) => `${num(x.valor, 2)} (${horaTexto(x.en, ahora)})`;
      const creat = cr.length ? `Creatinina ${cr.length > 1 ? `${fmt(cr[0])} → ${fmt(cr[cr.length - 1])}` : fmt(cr[0])}` : null;
      const faltan = [cr.length ? null : "creatinina", urea ? null : "urea"].filter(Boolean);
      const linea = [creat, urea ? `Urea ${urea.texto} (${horaTexto(urea.en, ahora)})` : null].filter(Boolean).join(" · ") + (faltan.length ? ` · pendiente: ${faltan.join(", ")}` : "");
      const corto = [cr.length ? num(cr[cr.length - 1].valor, 2) : null, urea ? urea.texto.split(" ")[0] : null].filter(Boolean).join(" · ");
      return ev(r, { marca: faltan.length ? "falta" : "listo", valor: faltan.length ? `falta ${faltan.join(", ")}` : corto, linea, hora: mayor([cr[cr.length - 1]?.en, urea?.en]) });
    }
    case "glucemias": {
      const g = serie("glucemia", f, ahora);
      if (!g.length) return ev(r, { marca: "falta", valor: "falta" });
      const ult = g.slice(-6);
      return ev(r, {
        marca: "listo",
        valor: `${g.length} valor${g.length === 1 ? "" : "es"}`,
        linea: `Glucemias (mg/dL): ${ult.map((x) => `${num(x.valor)} (${horaTexto(x.en, ahora)})`).join(" · ")}${g.length > ult.length ? ` · últimas ${ult.length} de ${g.length}` : ""}`,
        hora: g[g.length - 1].en,
      });
    }
    case "peso_talla": {
      const { peso, talla } = d.donante;
      if (peso === null && talla === null) return ev(r, { marca: "falta", valor: "falta" });
      const corto = [peso !== null ? num(peso) : "—", talla !== null ? num(talla) : "—"].join(" · ");
      const linea = [peso !== null ? `Peso ${num(peso)} kg` : null, talla !== null ? `Talla ${num(talla)} cm` : null].filter(Boolean).join(" · ") + (peso === null || talla === null ? ` · pendiente: ${peso === null ? "peso" : "talla"}` : "");
      return ev(r, { marca: peso !== null && talla !== null ? "listo" : "falta", valor: corto, linea });
    }
  }
}

export function evaluarRequisito(r: Requisito, d: Datos, ahora: number): Evaluado {
  if (r.tipo === "informativo") return ev(r, { marca: "info", valor: r.nota ?? "informativo", linea: `${r.etiqueta}: ${r.nota ?? ""}`.trim(), nota: r.nota ?? null });
  if (r.tipo === "texto") return ev(r, { marca: "falta", valor: "sin cargar", nota: "la app no lo carga: escribilo en la ficha" });
  if (r.tipo === "antecedentes") {
    // en una sola línea (el texto libre puede venir en varios renglones)
    const a = d.donante.antecedentes?.trim().replace(/\s*\n+\s*/g, " · ");
    return a ? ev(r, { marca: "info", valor: a.length > 28 ? `${a.slice(0, 27)}…` : a, linea: `Antecedentes: ${a}`, nota: "texto libre: la Base decide si lo incluye" }) : ev(r, { marca: "falta", valor: "sin cargar" });
  }
  return evaluarDato(r, r.dato!, d, ahora);
}

// ------------------------------------------------- ítems comunes
const SEXO: Record<string, string> = { masculino: "masculino", femenino: "femenino" };
export function itemDonante(d: Datos): Evaluado {
  const x = d.donante;
  const partes = [
    x.sexo ? `Donante ${SEXO[x.sexo] ?? x.sexo}` : "Donante",
    x.edad !== null ? `${x.edad} años` : null,
    x.peso !== null ? `${num(x.peso)} kg` : null,
    x.talla !== null ? `${num(x.talla)} cm` : null,
    x.grupo_sanguineo ? `grupo ${x.grupo_sanguineo}` : null,
  ].filter(Boolean);
  return ev({ ...ITEMS_COMUNES.donante, tipo: "comun" }, { marca: partes.length > 1 ? "listo" : "falta", valor: partes.slice(1).join(" · ") || "falta", linea: partes.join(" · ") });
}

export function itemQuirofano(d: Datos, equipo: EquipoQuirofano | null, ahora: number): Evaluado {
  const h = horaVigente(d.insumos.etapas.horariosQx);
  const anest = equipo ? ANESTESISTA.find((a) => a.valor === equipo.anestesista)?.etiqueta.toLowerCase() ?? equipo.anestesista : null;
  if (!h) return ev({ ...ITEMS_COMUNES.quirofano, tipo: "comun" }, { marca: "falta", valor: "sin hora", linea: anest ? `Quirófano: sin hora definida · anestesista: ${anest}` : null });
  return ev({ ...ITEMS_COMUNES.quirofano, tipo: "comun" }, { marca: "listo", valor: horaTexto(h.hora, ahora), linea: `Quirófano ${horaTexto(h.hora, ahora)}${anest ? ` · anestesista: ${anest}` : ""}` });
}

// ------------------------------------------------- estado del órgano
export type EstadoOrgano = { texto: string; color: "g" | "a" | "r" | "mu"; equipo: EquipoQuirofano | null };
export function estadoOrgano(cfg: ConfigOrgano, d: Datos): EstadoOrgano {
  const marca = organosVigentes(d.organosAceptados ?? []).get(cfg.organoQuirofano) ?? null;
  const vigentes = d.equipos.filter((e) => !e.anulado);
  const equipo = (marca?.equipo_id ? vigentes.find((e) => e.id === marca.equipo_id) : null) ?? vigentes.find((e) => e.organos.includes(cfg.organoQuirofano)) ?? null;
  const anest = equipo ? (equipo.anestesista === "si" ? "lleva anestesista" : equipo.anestesista === "no" ? "sin anestesista" : "anestesista sin confirmar") : null;
  if (marca?.aceptado) return { texto: ["Aceptado", equipo?.equipo, anest].filter(Boolean).join(" · "), color: "g", equipo };
  if (marca && !marca.aceptado) return { texto: "No aceptado", color: "r", equipo };
  if (equipo) return { texto: ["Pendiente", equipo.equipo, anest].filter(Boolean).join(" · "), color: "a", equipo };
  return { texto: "Sin avisar", color: "mu", equipo: null };
}

// ------------------------------------------------- órgano completo
export type FichaOrgano = {
  cfg: ConfigOrgano;
  estado: EstadoOrgano;
  nombreEquipo: string;
  requisitos: Evaluado[];
  donante: Evaluado;
  quirofano: Evaluado;
  listos: number;
  total: number; // sin informativos
};

export function fichaOrgano(cfg: ConfigOrgano, d: Datos, ahora: number): FichaOrgano {
  const estado = estadoOrgano(cfg, d);
  const requisitos = cfg.requisitos.map((r) => evaluarRequisito(r, d, ahora));
  const cuentan = requisitos.filter((x) => x.tipo !== "informativo");
  return {
    cfg,
    estado,
    nombreEquipo: estado.equipo?.equipo ?? cfg.equipo,
    requisitos,
    donante: itemDonante(d),
    quirofano: itemQuirofano(d, estado.equipo, ahora),
    listos: cuentan.filter((x) => x.marca === "listo" || (x.tipo === "antecedentes" && x.marca === "info") || (x.clave === "rx_torax" && x.marca === "info")).length,
    total: cuentan.length,
  };
}

export const fichasDistribucion = (d: Datos, ahora: number) => ORGANOS_DISTRIBUCION.map((c) => fichaOrgano(c, d, ahora));

// ------------------------------------------------- la ficha que se manda
// Tildes y textos de la ficha: no se guardan (vuelven al valor inicial).
export type EleccionFicha = { tildes: Record<string, boolean>; textos: Record<string, string> };

// Tildado de entrada: todo, salvo los informativos.
export function eleccionInicial(f: FichaOrgano): EleccionFicha {
  const tildes: Record<string, boolean> = { [f.donante.clave]: true, [f.quirofano.clave]: true };
  for (const r of f.requisitos) tildes[r.clave] = r.tipo !== "informativo";
  return { tildes, textos: {} };
}

// Lo que la Base escribió en un ítem "texto" (o para completar uno que falta).
const escrito = (e: EleccionFicha, clave: string) => (e.textos[clave] ?? "").trim();

export function itemsElegidos(f: FichaOrgano, e: EleccionFicha) {
  const elegidos = f.requisitos.filter((r) => e.tildes[r.clave]);
  const lineas: string[] = [];
  const pendientes: string[] = [];
  const aVerificar: string[] = [];
  for (const r of elegidos) {
    const t = escrito(e, r.clave);
    if (t) lineas.push(`${r.etiqueta.replace(/\s*\(.*\)$/, "")}: ${t}${r.linea && r.marca !== "falta" ? ` · ${r.linea}` : ""}`);
    else if (r.marca === "verificar") aVerificar.push(r.etiqueta);
    else if (r.linea) lineas.push(r.linea);
    else pendientes.push(r.etiqueta);
  }
  return { elegidos, lineas, pendientes, aVerificar };
}

// "Datos hasta": la hora del dato más nuevo de lo que se manda.
export function datosHastaFicha(f: FichaOrgano, e: EleccionFicha): string | null {
  return mayor(f.requisitos.filter((r) => e.tildes[r.clave]).map((r) => r.hora));
}

export function mensajeFicha(f: FichaOrgano, e: EleccionFicha, ident: string, ahora: number): string {
  const { lineas, pendientes, aVerificar } = itemsElegidos(f, e);
  const hasta = datosHastaFicha(f, e);
  const out = [`*${ident} · Ficha ${f.nombreEquipo}*`, hasta ? `Datos hasta ${horaTexto(hasta, ahora)}` : `Generado ${horaTexto(ahora, ahora)}`];
  if (e.tildes[f.donante.clave] && f.donante.linea) out.push(f.donante.linea);
  if (lineas.length) out.push("", ...lineas.map((l) => `• ${l}`));
  if (pendientes.length) out.push("", "*Pendiente*", ...pendientes.map((p) => `• ${p}`));
  if (aVerificar.length) out.push("", "*A verificar* (no se envía el valor)", ...aVerificar.map((p) => `• ${p}`));
  if (e.tildes[f.quirofano.clave] && f.quirofano.linea) out.push("", f.quirofano.linea);
  out.push("", CIERRE_FICHA);
  return out.join("\n");
}

// Línea de tiempo de cada envío: quién, hora, equipo y adjuntos.
export type EnvioFicha = "copió" | "descargó la imagen de" | "envió por WhatsApp";
export function lineaEnvioFicha(accion: EnvioFicha, f: Pick<FichaOrgano, "cfg" | "nombreEquipo">, adjuntos: number, quien: string, ahora: number): string {
  return lineaConAutor(quien, `${accion} la ficha de ${f.cfg.etiqueta} para ${f.nombreEquipo} · ${adjuntos} adjunto${adjuntos === 1 ? "" : "s"} (${hhmm(ahora)})`);
}
