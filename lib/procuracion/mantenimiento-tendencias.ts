// Tendencias de la vista del médico: series por hora, dirección, ritmo
// diurético, clasificación en meta y textos de las tarjetas. Lógica pura
// (sin React ni Supabase), con tests. Umbrales y ejes en
// mantenimiento-metas.ts (A VALIDAR CON PROTOCOLO CUCAIBA/INCUCAI).
import { colorDe, inicioDeHora, type Color, type DiuresisCalculada, type Punto } from "./mantenimiento-calculos.ts";
import { CAMBIO_MINIMO_FLECHA, EJE_Y, METAS, type ClaveMeta, type ClaveTendencia } from "./mantenimiento-metas.ts";

const HORA = 3_600_000;
const fmt = (n: number, dec = 2) => Number(n.toFixed(dec)).toLocaleString("es-AR", { maximumFractionDigits: dec });

// Número con decimales FIJOS y coma: 36 -> "36,0" (1), 0,3 -> "0,30" (2), 62 -> "62" (0).
export function numFijo(n: number, dec: number): string {
  return n.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: false });
}

// ---------------------------------------------------------------------
// Ventana y serie por hora
// ---------------------------------------------------------------------
// Puntos dentro de [ahora − horas, ahora].
export function recortarVentana<T extends Punto>(puntos: T[], ahora: number, horas: number): T[] {
  const desde = ahora - horas * HORA;
  return puntos.filter((p) => p.t >= desde && p.t <= ahora);
}

// Minutos desde el último punto (edad del dato); null sin puntos.
export function edadUltimoDato(puntos: Punto[], ahora: number): number | null {
  if (puntos.length === 0) return null;
  return (ahora - Math.max(...puntos.map((p) => p.t))) / 60_000;
}

// t = hora real del punto elegido (para el eje X de tiempo); null en huecos.
export type ValorHora = { inicio: number; valor: number | null; t?: number | null };

// Una casilla por hora de reloj de la ventana (la última es la hora en
// curso). Valor = el último punto de esa hora; sin punto = null (HUECO:
// no se interpola ni se inventa).
export function serieHoraria(puntos: Punto[], ahora: number, horas: number): ValorHora[] {
  const actual = inicioDeHora(ahora);
  const out: ValorHora[] = [];
  for (let i = horas - 1; i >= 0; i--) {
    const inicio = actual - i * HORA;
    const deLaHora = puntos.filter((p) => p.t >= inicio && p.t < inicio + HORA && p.t <= ahora);
    const u = deLaHora.reduce<Punto | null>((a, b) => (!a || b.t >= a.t ? b : a), null);
    out.push({ inicio, valor: u ? u.valor : null, t: u ? u.t : null });
  }
  return out;
}

const validos = (v: ValorHora[]) => v.filter((x): x is { inicio: number; valor: number } => x.valor !== null);

// ---------------------------------------------------------------------
// Dirección: primer y último valor VÁLIDO de la ventana (con 3 o más
// valores; si no, null). Por debajo del cambio mínimo: "estable".
// ---------------------------------------------------------------------
export type Direccion = {
  dir: "sube" | "baja" | "estable" | null;
  cambio: number | null; // último − primero
  primero: { inicio: number; valor: number } | null;
  ultimo: { inicio: number; valor: number } | null;
};

export function direccion(valores: ValorHora[], cambioMinimo: number): Direccion {
  const v = validos(valores);
  const primero = v[0] ?? null;
  const ultimo = v[v.length - 1] ?? null;
  const cambio = primero && ultimo ? ultimo.valor - primero.valor : null;
  if (v.length < 3 || cambio === null) return { dir: null, cambio, primero, ultimo };
  const dir = Math.abs(cambio) < cambioMinimo ? "estable" : cambio > 0 ? "sube" : "baja";
  return { dir, cambio, primero, ultimo };
}

// Dirección a partir de puntos sueltos (sin grilla horaria).
export function direccionTendencia(puntos: Punto[], cambioMinimo: number): "sube" | "baja" | "estable" | null {
  return direccion(
    [...puntos].sort((a, b) => a.t - b.t).map((p) => ({ inicio: p.t, valor: p.valor })),
    cambioMinimo
  ).dir;
}

// Chip de las tarjetas: "↑ subiendo +12 en 12 h" / "↓ bajando −18 en 12 h" / "→ estable".
export function textoChipDireccion(d: Direccion, horas: number, decimales: number): string | null {
  if (!d.dir || d.cambio === null) return null;
  if (d.dir === "estable") return "→ estable";
  const signo = d.cambio > 0 ? "+" : "−";
  return `${d.dir === "sube" ? "↑ subiendo" : "↓ bajando"} ${signo}${fmt(Math.abs(d.cambio), decimales)} en ${horas} h`;
}

// Héroe: "↓ Cayendo" / "↑ Subiendo" / "→ Estable".
export function textoDireccionHeroe(d: Direccion): string | null {
  if (!d.dir) return null;
  return d.dir === "sube" ? "↑ Subiendo" : d.dir === "baja" ? "↓ Cayendo" : "→ Estable";
}

// ---------------------------------------------------------------------
// Ejes fijos
// ---------------------------------------------------------------------
// Posición en el eje fijo: un valor fuera del eje queda en el borde (y se
// marca), sin cambiar la escala.
export function enEje(valor: number, clave: ClaveTendencia): { valor: number; recortado: boolean } {
  const e = EJE_Y[clave];
  if (valor < e.min) return { valor: e.min, recortado: true };
  if (valor > e.max) return { valor: e.max, recortado: true };
  return { valor, recortado: false };
}

// Banda de meta (verde de METAS) dentro del eje: [desde, hasta].
export function bandaMeta(clave: ClaveMeta, eje: { min: number; max: number }): { desde: number; hasta: number } | null {
  const v = METAS[clave].verde[0];
  if (!v) return null;
  return { desde: Math.max(v.desde ?? eje.min, eje.min), hasta: Math.min(v.hasta ?? eje.max, eje.max) };
}

// "60–80 mmHg", ">94 %", "≤0,3 γ" (sin unidad: "60–80", ">94")
export function textoRangoMeta(clave: ClaveMeta, conUnidad = true): string {
  const m = METAS[clave];
  const v = m.verde[0];
  const u = m.unidad && conUnidad ? ` ${m.unidad}` : "";
  if (!v) return "";
  if (v.desde !== undefined && v.hasta !== undefined) return `${fmt(v.desde)}–${fmt(v.hasta)}${u}`;
  if (v.desde !== undefined) return `${v.desdeExcluido ? ">" : "≥"}${fmt(v.desde)}${u}`;
  return `${v.hastaExcluido ? "<" : "≤"}${fmt(v.hasta!)}${u}`;
}

// ---------------------------------------------------------------------
// Tarjeta de tendencia
// ---------------------------------------------------------------------
export type Tarjeta = {
  clave: ClaveTendencia;
  meta: ClaveMeta;
  valores: ValorHora[];
  ultimo: { inicio: number; valor: number } | null;
  color: Color; // del ÚLTIMO valor ("sin_dato" si desactualizado o sin datos)
  enMeta: boolean | null; // null = sin dato
  estado: string; // "En meta · 60–80 mmHg" / "Fuera de meta · 60–80 mmHg"
  direccion: Direccion;
  chip: string | null;
  vacio: string | null; // "Sin datos de enfermería en las últimas N h"
  desactualizado: boolean;
};

export function textoVacio(horas: number): string {
  return `Sin datos de enfermería en las últimas ${horas} h`;
}

export function tarjetaTendencia(datos: {
  clave: ClaveTendencia;
  meta: ClaveMeta;
  puntos: Punto[];
  ahora: number;
  horas: number;
  cambioMinimo: number;
  decimales: number;
  desactualizado?: boolean; // p. ej. dosis de bomba con más de 70 min
}): Tarjeta {
  const valores = serieHoraria(datos.puntos, datos.ahora, datos.horas);
  const d = direccion(valores, datos.cambioMinimo);
  const ultimo = d.ultimo;
  const desactualizado = datos.desactualizado ?? false;
  const color: Color = !ultimo || desactualizado ? "sin_dato" : colorDe(datos.meta, ultimo.valor);
  // Desactualizado (dosis de bomba >70 min, laboratorio >6 h): no se
  // clasifica en meta ni fuera.
  const enMeta = !ultimo || desactualizado ? null : colorDe(datos.meta, ultimo.valor) === "verde";
  const rango = textoRangoMeta(datos.meta);
  return {
    clave: datos.clave,
    meta: datos.meta,
    valores,
    ultimo,
    color,
    enMeta,
    estado: enMeta === null ? rango : `${enMeta ? "En meta" : "Fuera de meta"} · ${rango}`,
    direccion: d,
    chip: textoChipDireccion(d, datos.horas, datos.decimales),
    vacio: ultimo ? null : textoVacio(datos.horas),
    desactualizado,
  };
}

// "N fuera de meta": solo las tarjetas de tendencia, con dato.
export function fueraDeMeta(tarjetas: Pick<Tarjeta, "enMeta">[]): number {
  return tarjetas.filter((t) => t.enMeta === false).length;
}

// Cambio del primer al último valor válido de la ventana (balance:
// "↑ +X en 12 h").
export function cambioEnVentana(valores: ValorHora[]): number | null {
  const v = validos(valores);
  if (v.length < 2) return null;
  return v[v.length - 1].valor - v[0].valor;
}

// ---------------------------------------------------------------------
// Héroe "Ritmo diurético"
// ---------------------------------------------------------------------
export type Heroe = {
  barras: (ValorHora & { color: Color })[]; // una por hora de la ventana
  actual: { inicio: number; valor: number } | null;
  direccion: Direccion;
  textoDireccion: string | null; // "↓ Cayendo"
  textoInicio: string | null; // "hace 12 h: 2,1"
  textoPie: string | null; // "Última hora: 49 mL · en 12 h bajó de 2,1 a 0,7 mL/kg/h"
  vacio: string | null;
};

// Color de cada barra: >1,0 verde, 0,5–1,0 ámbar, <0,5 rojo (METAS.diuresis).
export function heroeRitmoDiuretico(
  diuresis: DiuresisCalculada[],
  ahora: number,
  horas: number,
  cambioMinimo: number = CAMBIO_MINIMO_FLECHA.diuresis
): Heroe {
  const puntos = diuresis.filter((d) => d.mlKgH !== null).map((d) => ({ t: new Date(d.registrado_en).getTime(), valor: d.mlKgH! }));
  const valores = serieHoraria(puntos, ahora, horas);
  const barras = valores.map((v) => ({ ...v, color: v.valor === null ? ("sin_dato" as Color) : colorDe("diuresis", v.valor) }));
  const d = direccion(valores, cambioMinimo);
  if (!d.ultimo) return { barras, actual: null, direccion: d, textoDireccion: null, textoInicio: null, textoPie: null, vacio: textoVacio(horas) };
  const haceH = Math.round((inicioDeHora(ahora) - d.primero!.inicio) / HORA);
  const ultimaMl = [...diuresis].reverse().find((x) => x.mlH !== null && new Date(x.registrado_en).getTime() <= ahora)?.mlH ?? null;
  const verbo = d.cambio === null || d.dir === "estable" || d.dir === null ? "pasó" : d.cambio < 0 ? "bajó" : "subió";
  const tramo = d.primero && d.ultimo && d.primero !== d.ultimo ? ` · en ${horas} h ${verbo} de ${fmt(d.primero.valor, 1)} a ${fmt(d.ultimo.valor, 1)} mL/kg/h` : "";
  return {
    barras,
    actual: d.ultimo,
    direccion: d,
    textoDireccion: textoDireccionHeroe(d),
    textoInicio: d.primero && d.primero !== d.ultimo ? `hace ${haceH} h: ${fmt(d.primero.valor, 1)}` : null,
    textoPie: `${ultimaMl !== null ? `Última hora: ${fmt(ultimaMl, 0)} mL` : "Última hora: sin dato"}${tramo}`,
    vacio: null,
  };
}

// ---------------------------------------------------------------------
// Tarjeta de ALERTAS (arriba): SOLO lo que está fuera de rango, una línea
// por ítem, de más a menos grave. Laboratorio vencido (>6 h): línea gris
// aparte, no alerta. Sin nada fuera de rango, la UI muestra "Todo en meta".
// ---------------------------------------------------------------------
export type ItemAlerta = { id: string; nivel: "rojo" | "amarillo"; texto: string; destino: string };
export type LineaVencida = { id: string; texto: string; destino: string };

const textoDir = (d: Direccion["dir"]) => (d === "sube" ? " · ↑ subiendo" : d === "baja" ? " · ↓ bajando" : d === "estable" ? " · → estable" : "");

export function alertasFueraDeRango(
  tarjetas: {
    clave: ClaveTendencia;
    meta: ClaveMeta;
    nombre: string;
    unidad: string;
    dec: number;
    ultimo: { valor: number } | null;
    direccion: Direccion;
    desactualizado: boolean;
  }[],
  labs: { meta: ClaveMeta; etiqueta: string; unidad: string; dec: number; dato: { valor: number; medido_en: string; desactualizado: boolean } | null }[],
  ahora: number
): { alertas: ItemAlerta[]; vencidos: LineaVencida[] } {
  const rojas: ItemAlerta[] = [];
  const ambar: ItemAlerta[] = [];
  const poner = (a: ItemAlerta) => (a.nivel === "rojo" ? rojas : ambar).push(a);
  const metasEnTarjetas = new Set<ClaveMeta>();
  for (const t of tarjetas) {
    metasEnTarjetas.add(t.meta);
    if (!t.ultimo || t.desactualizado) continue;
    const color = colorDe(t.meta, t.ultimo.valor);
    if (color !== "rojo" && color !== "amarillo") continue;
    poner({
      id: t.clave,
      nivel: color,
      texto: `✕ ${t.nombre} ${numFijo(t.ultimo.valor, t.dec)} ${t.unidad} · meta ${textoRangoMeta(t.meta, false)}${textoDir(t.direccion.dir)}`,
      destino: `tarjeta-${t.clave}`,
    });
  }
  const vencidos: LineaVencida[] = [];
  for (const l of labs) {
    if (!l.dato) continue;
    if (l.dato.desactualizado) {
      const horas = Math.floor((ahora - new Date(l.dato.medido_en).getTime()) / HORA);
      vencidos.push({ id: l.meta, texto: `${l.etiqueta} sin actualizar hace ${horas} h`, destino: "laboratorio" });
      continue;
    }
    if (metasEnTarjetas.has(l.meta)) continue; // ya tiene tarjeta (glucemia): sin duplicar
    const color = colorDe(l.meta, l.dato.valor);
    if (color !== "rojo" && color !== "amarillo") continue;
    poner({
      id: l.meta,
      nivel: color,
      texto: `✕ ${l.etiqueta} ${numFijo(l.dato.valor, l.dec)}${l.unidad ? ` ${l.unidad}` : ""} · meta ${textoRangoMeta(l.meta, false)}`,
      destino: "laboratorio",
    });
  }
  return { alertas: [...rojas, ...ambar], vencidos };
}
