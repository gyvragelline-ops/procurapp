// Cálculos del panel de Mantenimiento. Lógica pura (sin Supabase ni
// React): la usan el panel y los tests (node --test). Todos los números
// clínicos salen de mantenimiento-metas.ts.
import {
  DI_DENSIDAD_MENOR_O_IGUAL_A,
  DI_OSM_SERICA_MAYOR_A,
  DI_OSM_URINARIA_MENOR_A,
  DI_PROBABLE_DIURESIS_ML_H,
  DI_PROBABLE_DIURESIS_ML_KG_H,
  DI_SODIO_MAYOR_A,
  DI_SOSPECHA_DIURESIS_ML_KG_H,
  DI_SOSPECHA_MINUTOS_SEGUIDOS,
  DROGAS_INFUSION,
  FACTOR_RVS,
  HIPOTENSION_PAM_MENOR_A,
  BOMBAS_ENFERMERIA,
  HIPOGLUCEMIA_MENOR_A,
  HORAS_LAB_DESACTUALIZADO,
  HORAS_RESPIRADOR_VIEJO,
  LIQUIDOS_ENFERMERIA,
  METAS,
  MINUTOS_ALARMA_SIN_REGISTRO,
  MINUTOS_DOSIS_DESACTUALIZADA,
  MINUTOS_HORA_SIN_CARGAR,
  PERDIDAS_INSENSIBLES,
  RANGO_CANTIDAD_AMPOLLAS,
  RANGO_VOLUMEN_DILUCION_ML,
  RANGOS_SETEO_BOMBA,
  MINUTOS_INTERVALO_CORTO,
  MINUTOS_INTERVALO_LARGO,
  MINUTOS_PRIMER_REGISTRO,
  RANGOS_PLAUSIBLES,
  SCORE_GLUCEMIA_DESDE,
  SCORE_GLUCEMIA_HASTA,
  SCORE_PAFI_MAYOR_A,
  SCORE_PH_DESDE,
  SCORE_PH_HASTA,
  SCORE_SODIO_MENOR_A,
  UMBRALES_VOLEMIA,
  VASOPRESORES,
  type ClaveMeta,
  type Droga,
  type DrogaInfusion,
  type Intervalo,
  type ModoRespirador,
  type SolucionDilucion,
  type UnidadDosis,
} from "./mantenimiento-metas.ts";

// =====================================================================
// Semáforo
// =====================================================================
export type Color = "verde" | "amarillo" | "rojo" | "sin_dato";

function dentro(valor: number, i: Intervalo): boolean {
  if (i.desde !== undefined && (i.desdeExcluido ? valor <= i.desde : valor < i.desde)) return false;
  if (i.hasta !== undefined && (i.hastaExcluido ? valor >= i.hasta : valor > i.hasta)) return false;
  return true;
}

export function colorDe(clave: ClaveMeta, valor: number | null | undefined): Color {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "sin_dato";
  const meta = METAS[clave];
  if (meta.verde.some((i) => dentro(valor, i))) return "verde";
  if (meta.amarillo.some((i) => dentro(valor, i))) return "amarillo";
  return "rojo";
}

// =====================================================================
// Infusiones: concentración y dosis (mostrar SIEMPRE la cuenta)
// =====================================================================
export type Dilucion = {
  ampollas: number;
  contenidoPorAmpolla: number;
  unidadContenido: "mg" | "mcg" | "U" | "mEq";
  volumenFinalMl: number;
};

export type UnidadConcentracion = "mcg/mL" | "mg/mL" | "U/mL" | "mEq/mL";

// Unidad de concentración que necesita cada unidad de dosis.
export function unidadConcentracionPara(unidadDosis: UnidadDosis): UnidadConcentracion {
  if (unidadDosis === "U/min" || unidadDosis === "U/h") return "U/mL";
  if (unidadDosis === "mEq/h") return "mEq/mL";
  if (unidadDosis === "mg/min" || unidadDosis === "mg/h") return "mg/mL";
  return "mcg/mL"; // mcg/kg/min y mcg/min
}

// Unidad del contenido de la ampolla que acepta cada droga.
export function unidadesContenidoPara(droga: Exclude<Droga, "desmopresina">): ("mg" | "mcg" | "U" | "mEq")[] {
  const uc = unidadConcentracionPara(DROGAS_INFUSION[droga].unidadDosis);
  if (uc === "U/mL") return ["U"];
  if (uc === "mEq/mL") return ["mEq"];
  return ["mg", "mcg"];
}

const esPorHora = (u: UnidadDosis) => u === "mg/h" || u === "U/h" || u === "mEq/h";

export type ResultadoConcentracion =
  | { ok: true; valor: number; unidad: UnidadConcentracion; totalDroga: number; unidadTotal: "mg" | "mcg" | "U" | "mEq" }
  | { ok: false; error: string };

export function concentracion(droga: Exclude<Droga, "desmopresina">, d: Dilucion): ResultadoConcentracion {
  if (!(d.ampollas > 0) || !(d.contenidoPorAmpolla > 0) || !(d.volumenFinalMl > 0)) {
    return { ok: false, error: "Faltan datos de la dilución (ampollas, contenido por ampolla y volumen final)." };
  }
  const unidad = unidadConcentracionPara(DROGAS_INFUSION[droga].unidadDosis);
  const total = d.ampollas * d.contenidoPorAmpolla;
  const permitidas = unidadesContenidoPara(droga);
  if (!permitidas.includes(d.unidadContenido)) {
    return { ok: false, error: `Para ${DROGAS_INFUSION[droga].etiqueta} el contenido por ampolla va en ${permitidas.join(" o ")}.` };
  }
  if (unidad === "U/mL" || unidad === "mEq/mL") {
    return { ok: true, valor: total / d.volumenFinalMl, unidad, totalDroga: total, unidadTotal: d.unidadContenido };
  }
  // Pasar el total a la unidad que pide la concentración.
  const totalEnMcg = d.unidadContenido === "mg" ? total * 1000 : total;
  const valor = unidad === "mg/mL" ? totalEnMcg / 1000 / d.volumenFinalMl : totalEnMcg / d.volumenFinalMl;
  return { ok: true, valor, unidad, totalDroga: total, unidadTotal: d.unidadContenido };
}

function fmt(n: number, decimales = 2): string {
  const redondeado = Number(n.toFixed(decimales));
  return redondeado.toLocaleString("es-AR", { maximumFractionDigits: decimales });
}

// "8 mg en 100 mL = 80 mcg/mL. ¿Correcto?" -- se muestra SIEMPRE y exige
// un toque activo antes de calcular nada.
export function textoConfirmacionDilucion(droga: Exclude<Droga, "desmopresina">, d: Dilucion): string | null {
  const c = concentracion(droga, d);
  if (!c.ok) return null;
  return `${fmt(c.totalDroga)} ${c.unidadTotal} en ${fmt(d.volumenFinalMl)} mL = ${fmt(c.valor, 3)} ${c.unidad}. ¿Correcto?`;
}

// Unidad corta para mostrar: "γ" en lugar de mcg/kg/min.
export function unidadCorta(u: UnidadDosis): string {
  return u === "mcg/kg/min" ? "γ" : u;
}

// "¿Seguro?" del seteo de una bomba (no bloquea): ampolla, cantidad o
// volumen fuera del rango plausible de la droga. Vacío = nada que avisar.
export function avisosSeteoBomba(droga: DrogaInfusion, d: Dilucion): string[] {
  const r = RANGOS_SETEO_BOMBA[droga];
  const out: string[] = [];
  const fuera = (v: number, x: { min: number; max: number }) => v < x.min || v > x.max;
  if (fuera(d.contenidoPorAmpolla, r.ampolla))
    out.push(`Ampolla de ${fmt(d.contenidoPorAmpolla)} ${d.unidadContenido} (esperable ${fmt(r.ampolla.min)}-${fmt(r.ampolla.max)} ${d.unidadContenido})`);
  if (fuera(d.ampollas, RANGO_CANTIDAD_AMPOLLAS))
    out.push(`Cantidad ${fmt(d.ampollas)} (esperable ${fmt(RANGO_CANTIDAD_AMPOLLAS.min)}-${fmt(RANGO_CANTIDAD_AMPOLLAS.max)})`);
  if (fuera(d.volumenFinalMl, RANGO_VOLUMEN_DILUCION_ML))
    out.push(`Volumen de ${fmt(d.volumenFinalMl)} mL (esperable ${fmt(RANGO_VOLUMEN_DILUCION_ML.min)}-${fmt(RANGO_VOLUMEN_DILUCION_ML.max)} mL)`);
  return out;
}

// "¿Seguro?" de la dosis resultante (no bloquea); null = dentro de rango.
export function avisoDosisBomba(droga: DrogaInfusion, dosis: number): string | null {
  const r = RANGOS_SETEO_BOMBA[droga].dosis;
  if (dosis >= r.min && dosis <= r.max) return null;
  const u = unidadCorta(DROGAS_INFUSION[droga].unidadDosis);
  const dec = u === "U/min" ? 3 : 2;
  return `${DROGAS_INFUSION[droga].etiqueta} ${fmt(dosis, dec)} ${u} (esperable ${fmt(r.min, dec)}-${fmt(r.max, dec)} ${u})`;
}

export type ResultadoDosis =
  | { ok: true; dosis: number; unidad: UnidadDosis; uPorHora?: number; cuenta: string }
  | { ok: false; error: string; motivo: "sin_peso" | "datos" };

const usaPeso = (u: UnidadDosis) => u === "mcg/kg/min";

// mL/h -> dosis.
//   mcg/kg/min = (mL/h × mcg/mL) / (peso_kg × 60)
//   mcg/min    = (mL/h × mcg/mL) / 60
//   mg/min     = (mL/h × mg/mL) / 60
//   U/min      = (mL/h × U/mL) / 60   (y U/h = mL/h × U/mL)
//   mg/h, U/h, mEq/h = mL/h × concentración (por hora, sin /60)
export function dosisDesdeVelocidad(
  droga: Exclude<Droga, "desmopresina">,
  velocidadMlH: number,
  concentracionPorMl: number,
  pesoKg: number | null
): ResultadoDosis {
  const unidad = DROGAS_INFUSION[droga].unidadDosis;
  const uc = unidadConcentracionPara(unidad);
  if (!(velocidadMlH >= 0) || !(concentracionPorMl > 0)) return { ok: false, motivo: "datos", error: "Faltan velocidad o concentración." };
  if (esPorHora(unidad)) {
    const dosis = velocidadMlH * concentracionPorMl;
    return { ok: true, dosis, unidad, cuenta: `${fmt(velocidadMlH)} mL/h × ${fmt(concentracionPorMl, 3)} ${uc} = ${fmt(dosis, 2)} ${unidad}` };
  }
  if (usaPeso(unidad)) {
    if (!pesoKg || !(pesoKg > 0)) return { ok: false, motivo: "sin_peso", error: "Sin peso cargado no se calcula: cargalo en Medidas antropométricas." };
    const dosis = (velocidadMlH * concentracionPorMl) / (pesoKg * 60);
    return {
      ok: true,
      dosis,
      unidad,
      cuenta: `(${fmt(velocidadMlH)} mL/h × ${fmt(concentracionPorMl, 3)} ${uc}) / (${fmt(pesoKg)} kg × 60) = ${fmt(dosis, 3)} ${unidad}`,
    };
  }
  const dosis = (velocidadMlH * concentracionPorMl) / 60;
  if (unidad === "U/min") {
    const uPorHora = velocidadMlH * concentracionPorMl;
    return {
      ok: true,
      dosis,
      unidad,
      uPorHora,
      cuenta: `(${fmt(velocidadMlH)} mL/h × ${fmt(concentracionPorMl, 3)} U/mL) / 60 = ${fmt(dosis, 4)} U/min (${fmt(uPorHora, 2)} U/h)`,
    };
  }
  return {
    ok: true,
    dosis,
    unidad,
    cuenta: `(${fmt(velocidadMlH)} mL/h × ${fmt(concentracionPorMl, 3)} ${uc}) / 60 = ${fmt(dosis, 3)} ${unidad}`,
  };
}

export type ResultadoVelocidad =
  | { ok: true; velocidadMlH: number; cuenta: string }
  | { ok: false; error: string; motivo: "sin_peso" | "datos" };

// Dosis -> mL/h (inversa).
//   mL/h = (dosis × peso × 60) / (mcg/mL)        para mcg/kg/min
//   mL/h = (dosis × 60) / (concentración)        para mcg/min, mg/min, U/min
//   mL/h = dosis / concentración                 para mg/h, U/h, mEq/h
export function velocidadDesdeDosis(
  droga: Exclude<Droga, "desmopresina">,
  dosis: number,
  concentracionPorMl: number,
  pesoKg: number | null
): ResultadoVelocidad {
  const unidad = DROGAS_INFUSION[droga].unidadDosis;
  const uc = unidadConcentracionPara(unidad);
  if (!(dosis >= 0) || !(concentracionPorMl > 0)) return { ok: false, motivo: "datos", error: "Faltan dosis o concentración." };
  if (esPorHora(unidad)) {
    const v = dosis / concentracionPorMl;
    return { ok: true, velocidadMlH: v, cuenta: `${fmt(dosis, 2)} ${unidad} / ${fmt(concentracionPorMl, 3)} ${uc} = ${fmt(v)} mL/h` };
  }
  if (usaPeso(unidad)) {
    if (!pesoKg || !(pesoKg > 0)) return { ok: false, motivo: "sin_peso", error: "Sin peso cargado no se calcula: cargalo en Medidas antropométricas." };
    const v = (dosis * pesoKg * 60) / concentracionPorMl;
    return { ok: true, velocidadMlH: v, cuenta: `(${fmt(dosis, 3)} ${unidad} × ${fmt(pesoKg)} kg × 60) / ${fmt(concentracionPorMl, 3)} ${uc} = ${fmt(v)} mL/h` };
  }
  const v = (dosis * 60) / concentracionPorMl;
  return { ok: true, velocidadMlH: v, cuenta: `(${fmt(dosis, 4)} ${unidad} × 60) / ${fmt(concentracionPorMl, 3)} ${uc} = ${fmt(v)} mL/h` };
}

// =====================================================================
// Hemodinamia derivada (solo si están los datos necesarios)
// =====================================================================
// Superficie corporal (Mosteller): √(peso kg × talla cm / 3600).
export function superficieCorporal(pesoKg: number | null, tallaCm: number | null): number | null {
  if (!pesoKg || !tallaCm || pesoKg <= 0 || tallaCm <= 0) return null;
  return Math.sqrt((pesoKg * tallaCm) / 3600);
}

// IC: el medido directo si existe; si no, GC / superficie corporal.
export function indiceCardiaco(
  icMedido: number | null,
  gc: number | null,
  pesoKg: number | null,
  tallaCm: number | null
): { valor: number; origen: "medido" | "calculado" } | null {
  if (icMedido !== null && icMedido !== undefined) return { valor: icMedido, origen: "medido" };
  const sc = superficieCorporal(pesoKg, tallaCm);
  if (gc === null || gc === undefined || !(gc > 0) || sc === null) return null;
  return { valor: gc / sc, origen: "calculado" };
}

// RVS = 80 × (PAM − PVC) / GC
export function resistenciaVascularSistemica(pam: number | null, pvc: number | null, gc: number | null): number | null {
  if (pam === null || pvc === null || gc === null || pam === undefined || pvc === undefined || gc === undefined || !(gc > 0)) return null;
  return (FACTOR_RVS * (pam - pvc)) / gc;
}

// PaFi = PaO2 / (FiO2 / 100), con la FiO2 en % de la misma extracción.
export function pafi(pao2: number | null, fio2Porcentaje: number | null): number | null {
  if (pao2 === null || fio2Porcentaje === null || pao2 === undefined || fio2Porcentaje === undefined || !(fio2Porcentaje > 0)) return null;
  return pao2 / (fio2Porcentaje / 100);
}

// =====================================================================
// Registros: diuresis y balance (lo anulado no cuenta)
// =====================================================================
export type RegistroBase = {
  id: string;
  registrado_en: string; // ISO
  anulado: boolean;
  diuresis_ml: number | null;
  diuresis_es_ultima_hora: boolean;
  pam?: number | null;
};

export type DiuresisCalculada = {
  id: string;
  registrado_en: string;
  intervaloMin: number | null;
  mlH: number | null;
  mlKgH: number | null;
  aviso: "intervalo_corto" | "intervalo_largo" | "sin_dato" | null;
};

const minutosEntre = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 60000;

// Ordena por hora ascendente.
export function ordenarPorHora<T extends { registrado_en: string }>(registros: T[]): T[] {
  return [...registros].sort((a, b) => a.registrado_en.localeCompare(b.registrado_en));
}

// Diuresis de cada registro NO anulado, con el tiempo real desde el
// registro anterior no anulado. Primer registro: "mL de la última hora".
// <30 min: no se calcula ("intervalo corto"). Si entre los dos quedó un
// registro anulado y el intervalo supera 2 h: "intervalo largo,
// velocidad subestimada" en vez del número.
export function calcularDiuresis(registros: RegistroBase[], pesoKg: number | null): DiuresisCalculada[] {
  const todos = ordenarPorHora(registros);
  const salida: DiuresisCalculada[] = [];
  let anterior: RegistroBase | null = null;
  let anuladoEnElMedio = false;
  for (const r of todos) {
    if (r.anulado) {
      if (anterior) anuladoEnElMedio = true;
      continue;
    }
    const intervaloMin = anterior ? minutosEntre(anterior.registrado_en, r.registrado_en) : r.diuresis_es_ultima_hora ? MINUTOS_PRIMER_REGISTRO : null;
    let mlH: number | null = null;
    let aviso: DiuresisCalculada["aviso"] = null;
    if (r.diuresis_ml === null || r.diuresis_ml === undefined || intervaloMin === null) {
      aviso = "sin_dato";
    } else if (intervaloMin < MINUTOS_INTERVALO_CORTO) {
      aviso = "intervalo_corto";
    } else if (anuladoEnElMedio && intervaloMin > MINUTOS_INTERVALO_LARGO) {
      aviso = "intervalo_largo";
    } else {
      mlH = r.diuresis_ml / (intervaloMin / 60);
    }
    salida.push({
      id: r.id,
      registrado_en: r.registrado_en,
      intervaloMin,
      mlH,
      mlKgH: mlH !== null && pesoKg && pesoKg > 0 ? mlH / pesoKg : null,
      aviso,
    });
    anterior = r;
    anuladoEnElMedio = false;
  }
  return salida;
}

// Últimos N valores no anulados de un campo, para la mini tendencia.
export function tendencia<T extends { registrado_en: string; anulado: boolean }>(
  registros: T[],
  valor: (r: T) => number | null | undefined,
  n: number
): { registrado_en: string; valor: number }[] {
  return ordenarPorHora(registros)
    .filter((r) => !r.anulado)
    .map((r) => ({ registrado_en: r.registrado_en, valor: valor(r) }))
    .filter((p): p is { registrado_en: string; valor: number } => p.valor !== null && p.valor !== undefined)
    .slice(-n);
}

// =====================================================================
// Laboratorio: último valor por parámetro
// =====================================================================
// valor null = valor en texto (sedimento urinario): fuera de las reglas.
export type ValorLab = { parametro: string; valor: number | null; medido_en: string; anulado: boolean; toma_id: string };

export function ultimoValorLab(
  valores: ValorLab[],
  parametro: string,
  ahora: number
): { valor: number; medido_en: string; desactualizado: boolean; toma_id: string } | null {
  const candidatos = valores.filter((v) => v.parametro === parametro && !v.anulado && v.valor !== null);
  if (candidatos.length === 0) return null;
  const ultimo = candidatos.reduce((a, b) => (b.medido_en > a.medido_en ? b : a));
  const horas = (ahora - new Date(ultimo.medido_en).getTime()) / 3_600_000;
  return { valor: ultimo.valor!, medido_en: ultimo.medido_en, desactualizado: horas > HORAS_LAB_DESACTUALIZADO, toma_id: ultimo.toma_id };
}

// PaFi de la última PaO2: con la FiO2 de LA MISMA extracción (toma_id).
export function ultimaPafi(valores: ValorLab[], ahora: number): { valor: number; medido_en: string; desactualizado: boolean } | null {
  const pao2 = ultimoValorLab(valores, "pao2", ahora);
  if (!pao2) return null;
  const fio2 = valores.find((v) => v.parametro === "fio2" && !v.anulado && v.toma_id === pao2.toma_id);
  const valor = pafi(pao2.valor, fio2?.valor ?? null);
  if (valor === null) return null;
  return { valor, medido_en: pao2.medido_en, desactualizado: pao2.desactualizado };
}

// =====================================================================
// Score de calidad del órgano X/4
// =====================================================================
export type ItemScore = { clave: "glucemia" | "sodio" | "ph" | "pafi"; etiqueta: string; cumple: boolean | null };

export function scoreCalidad(datos: {
  glucemia: number | null;
  sodio: number | null;
  ph: number | null;
  pafi: number | null;
}): { cumplidos: number; total: 4; items: ItemScore[] } {
  const items: ItemScore[] = [
    {
      clave: "glucemia",
      etiqueta: `Glucemia ${SCORE_GLUCEMIA_DESDE}-${SCORE_GLUCEMIA_HASTA}`,
      cumple: datos.glucemia === null ? null : datos.glucemia >= SCORE_GLUCEMIA_DESDE && datos.glucemia <= SCORE_GLUCEMIA_HASTA,
    },
    { clave: "sodio", etiqueta: `Na <${SCORE_SODIO_MENOR_A}`, cumple: datos.sodio === null ? null : datos.sodio < SCORE_SODIO_MENOR_A },
    {
      clave: "ph",
      etiqueta: `pH ${SCORE_PH_DESDE}-${SCORE_PH_HASTA}`,
      cumple: datos.ph === null ? null : datos.ph >= SCORE_PH_DESDE && datos.ph <= SCORE_PH_HASTA,
    },
    { clave: "pafi", etiqueta: `PaFi >${SCORE_PAFI_MAYOR_A}`, cumple: datos.pafi === null ? null : datos.pafi > SCORE_PAFI_MAYOR_A },
  ];
  return { cumplidos: items.filter((i) => i.cumple === true).length, total: 4, items };
}

// =====================================================================
// Volemia: variables dinámicas
// =====================================================================
export type VariablesDinamicas = {
  delta_pp: number | null;
  delta_vs: number | null;
  resultado_pasivo_miembros: number | null;
  indice_vena_cava: number | null;
  delta_co2_espirado: number | null;
};

export function evaluarVolemia(v: VariablesDinamicas): {
  cargadas: number;
  positivas: number;
  detalle: { clave: keyof VariablesDinamicas; etiqueta: string; valor: number; positiva: boolean | null }[];
} {
  const detalle: { clave: keyof VariablesDinamicas; etiqueta: string; valor: number; positiva: boolean | null }[] = [];
  for (const clave of Object.keys(UMBRALES_VOLEMIA) as (keyof VariablesDinamicas)[]) {
    const valor = v[clave];
    if (valor === null || valor === undefined) continue;
    const u = UMBRALES_VOLEMIA[clave] as { etiqueta: string; umbralMayorA?: number | null; umbralMayorOIgualA?: number };
    let positiva: boolean | null;
    if (u.umbralMayorOIgualA !== undefined) positiva = valor >= u.umbralMayorOIgualA;
    else if (u.umbralMayorA === null || u.umbralMayorA === undefined) positiva = null; // sin referencia definida
    else positiva = valor > u.umbralMayorA;
    detalle.push({ clave, etiqueta: u.etiqueta, valor, positiva });
  }
  return { cargadas: detalle.length, positivas: detalle.filter((d) => d.positiva === true).length, detalle };
}

// =====================================================================
// Diabetes insípida
// =====================================================================
export type EstadoDI = "sin_criterios" | "sospecha" | "probable";

export function evaluarDiabetesInsipida(datos: {
  diuresis: DiuresisCalculada[]; // ya calculada (sin anulados), orden ascendente
  pamUltima: number | null;
  sodio: number | null;
  osmUrinaria: number | null;
  densidadUrinaria: number | null;
  osmSerica: number | null;
}): { estado: EstadoDI; motivos: string[] } {
  const motivos: string[] = [];
  const conVel = datos.diuresis.filter((d) => d.mlH !== null);
  const ultima = conVel[conVel.length - 1];
  const sodioAlto = datos.sodio !== null && datos.sodio > DI_SODIO_MAYOR_A;
  const hipotension = datos.pamUltima !== null && datos.pamUltima < HIPOTENSION_PAM_MENOR_A;

  // Probable: diuresis >4 mL/kg/h (o >300 mL/h) y (osm urinaria <300 o
  // densidad ≤1005) y (sodio >145 u osm sérica >300).
  if (ultima) {
    const poliuria = (ultima.mlKgH !== null && ultima.mlKgH > DI_PROBABLE_DIURESIS_ML_KG_H) || (ultima.mlH ?? 0) > DI_PROBABLE_DIURESIS_ML_H;
    const orinaDiluida =
      (datos.osmUrinaria !== null && datos.osmUrinaria < DI_OSM_URINARIA_MENOR_A) ||
      (datos.densidadUrinaria !== null && datos.densidadUrinaria <= DI_DENSIDAD_MENOR_O_IGUAL_A);
    const plasmaConcentrado = sodioAlto || (datos.osmSerica !== null && datos.osmSerica > DI_OSM_SERICA_MAYOR_A);
    if (poliuria && orinaDiluida && plasmaConcentrado) {
      motivos.push(
        `Diuresis >${DI_PROBABLE_DIURESIS_ML_KG_H} mL/kg/h (o >${DI_PROBABLE_DIURESIS_ML_H} mL/h), orina diluida y sodio u osmolaridad sérica altos.`
      );
      return { estado: "probable", motivos };
    }
  }

  // Sospecha: >3 mL/kg/h en 2 registros consecutivos que entre los dos
  // cubren ≥2 h, con sodio >145 o hipotensión.
  if (conVel.length >= 2 && (sodioAlto || hipotension)) {
    const [a, b] = conVel.slice(-2);
    const ambosAltos = (a.mlKgH ?? 0) > DI_SOSPECHA_DIURESIS_ML_KG_H && (b.mlKgH ?? 0) > DI_SOSPECHA_DIURESIS_ML_KG_H;
    const minutos = (a.intervaloMin ?? 0) + (b.intervaloMin ?? 0);
    if (ambosAltos && minutos >= DI_SOSPECHA_MINUTOS_SEGUIDOS) {
      motivos.push(
        `Diuresis >${DI_SOSPECHA_DIURESIS_ML_KG_H} mL/kg/h durante ≥2 h, con ${sodioAlto ? `sodio >${DI_SODIO_MAYOR_A}` : "hipotensión"}.`
      );
      return { estado: "sospecha", motivos };
    }
  }
  return { estado: "sin_criterios", motivos };
}

// =====================================================================
// Plausibilidad (no bloqueante: fuera de rango se pide "¿seguro?")
// =====================================================================
export function fueraDeRangoPlausible(campo: string, valor: number | null | undefined): { min: number; max: number } | null {
  if (valor === null || valor === undefined) return null;
  const r = RANGOS_PLAUSIBLES[campo];
  if (!r) return null;
  return valor < r.min || valor > r.max ? r : null;
}

// =====================================================================
// Infusiones: estado actual por droga
// =====================================================================
export type InfusionFila = {
  id: string;
  registrado_en: string;
  droga: Droga;
  tipo: "infusion" | "bolo";
  ampollas: number | null;
  contenido_por_ampolla: number | null;
  unidad_contenido: "mg" | "mcg" | "U" | "mEq" | null;
  volumen_final_ml: number | null;
  velocidad_ml_h: number | null;
  dosis_calculada: number | null;
  unidad_dosis: string | null;
  // inicio / cambio_dilucion: fila de dilución confirmada; cambio_velocidad:
  // botón "cambié la velocidad" (solo gammas en vivo, no balance). null:
  // filas viejas (Fase 1) y bolos.
  motivo?: "inicio" | "cambio_dilucion" | "cambio_velocidad" | null;
  cargado_por?: string | null;
  // Solución de la dilución (filas de dilución): dextrosa_5 / sf_09 /
  // otra (+ texto corto). null en filas viejas y en los demás motivos.
  solucion_dilucion?: SolucionDilucion | null;
  solucion_dilucion_otra?: string | null;
  anulado: boolean;
};

// ---------------------------------------------------------------------
// Solución de la dilución: formulario <-> columnas de la base
// ---------------------------------------------------------------------
export type Solucion = { tipo: SolucionDilucion; otra: string } | null;
export const MAX_SOLUCION_OTRA = 40;

// Lo que se guarda. El texto solo va con "otra" (recortado, hasta 40
// caracteres; vacío -> null), como exige la restricción de la base.
export function columnasSolucion(s: Solucion): { solucion_dilucion: SolucionDilucion | null; solucion_dilucion_otra: string | null } {
  if (!s) return { solucion_dilucion: null, solucion_dilucion_otra: null };
  if (s.tipo !== "otra") return { solucion_dilucion: s.tipo, solucion_dilucion_otra: null };
  const texto = s.otra.trim().slice(0, MAX_SOLUCION_OTRA);
  return { solucion_dilucion: "otra", solucion_dilucion_otra: texto || null };
}

// Lo que se lee de una fila de dilución.
export function solucionDeFila(f: Pick<InfusionFila, "solucion_dilucion" | "solucion_dilucion_otra"> | null | undefined): Solucion {
  if (!f?.solucion_dilucion) return null;
  return { tipo: f.solucion_dilucion, otra: f.solucion_dilucion === "otra" ? (f.solucion_dilucion_otra ?? "") : "" };
}

// Solución de la dilución guardada con ese id (para la línea plegada).
export function solucionPorId(filas: InfusionFila[], id: string | null): Solucion {
  if (!id) return null;
  return solucionDeFila(filas.find((f) => f.id === id && !f.anulado));
}

// Última dilución usada para una droga en el caso (no anulada): se
// propone de nuevo al cambiar la velocidad, pero se vuelve a confirmar.
export function ultimaDilucion(filas: InfusionFila[], droga: Droga): Dilucion | null {
  return dilucionVigenteEn(filas, droga, Infinity)?.dilucion ?? null;
}

// =====================================================================
// Cabecera y alarmas (solo visuales)
// =====================================================================
export type ParametroTablero = {
  clave: ClaveMeta;
  etiqueta: string;
  valor: number | null;
  color: Color;
  avanzado: boolean; // monitoreo avanzado: sin dato no se muestra ni cuenta
};

export function minutosDesdeUltimoRegistro(registros: { registrado_en: string; anulado: boolean }[], ahora: number): number | null {
  const vigentes = registros.filter((r) => !r.anulado);
  if (vigentes.length === 0) return null;
  const ultimo = vigentes.reduce((a, b) => (b.registrado_en > a.registrado_en ? b : a));
  return (ahora - new Date(ultimo.registrado_en).getTime()) / 60000;
}

// Fuera de meta = amarillo o rojo. Sin dato no cuenta (tampoco los
// avanzados sin dato o con el monitoreo avanzado apagado).
export function contarFueraDeMeta(parametros: ParametroTablero[], monitoreoAvanzadoActivo: boolean): number {
  return parametros.filter((p) => (!p.avanzado || monitoreoAvanzadoActivo) && (p.color === "amarillo" || p.color === "rojo")).length;
}

export type Alarma = { nivel: "rojo" | "amarillo"; texto: string };

export function armarAlarmas(datos: {
  parametros: ParametroTablero[];
  monitoreoAvanzadoActivo: boolean;
  minutosSinRegistro: number | null;
  estadoDI: EstadoDI;
}): Alarma[] {
  const out: Alarma[] = [];
  if (datos.minutosSinRegistro === null) out.push({ nivel: "amarillo", texto: "Sin registros de mantenimiento todavía." });
  else if (datos.minutosSinRegistro > MINUTOS_ALARMA_SIN_REGISTRO)
    out.push({ nivel: "rojo", texto: `Último registro hace ${Math.floor(datos.minutosSinRegistro)} min (más de 1 h).` });
  for (const p of datos.parametros) {
    if (p.avanzado && !datos.monitoreoAvanzadoActivo) continue;
    // Hipoglucemia: solo con un valor al día (el desactualizado queda gris, sin color).
    if (p.clave === "glucemia" && p.color !== "sin_dato" && p.valor !== null && p.valor < HIPOGLUCEMIA_MENOR_A) {
      out.push({ nivel: "rojo", texto: `Hipoglucemia: ${fmt(p.valor)} mg/dL (<${HIPOGLUCEMIA_MENOR_A}).` });
    } else if (p.color === "rojo" || p.color === "amarillo")
      out.push({ nivel: p.color, texto: `${p.etiqueta} fuera de meta: ${p.valor === null ? "—" : fmt(p.valor)}` });
  }
  if (datos.estadoDI === "probable") out.push({ nivel: "rojo", texto: "Diabetes insípida probable." });
  if (datos.estadoDI === "sospecha") out.push({ nivel: "amarillo", texto: "Sospecha de diabetes insípida." });
  // Rojas primero (orden estable dentro de cada nivel).
  return [...out.filter((a) => a.nivel === "rojo"), ...out.filter((a) => a.nivel === "amarillo")];
}

// =====================================================================
// Hora de un registro (al cargarlo o editarlo)
// =====================================================================
// Futura: no se acepta. Si cambia el orden respecto de los demás
// registros vigentes: pedir confirmación.
export function validarHoraRegistro(
  nuevaHoraIso: string,
  ahora: number,
  registros: { id: string; registrado_en: string; anulado: boolean }[],
  idEditado: string | null
): { estado: "futura" } | { estado: "ok"; cambiaOrden: boolean } {
  const nueva = new Date(nuevaHoraIso).getTime();
  if (nueva > ahora) return { estado: "futura" };
  if (!idEditado) return { estado: "ok", cambiaOrden: false };
  const vigentes = registros.filter((r) => !r.anulado);
  const ordenAntes = ordenarPorHora(vigentes).map((r) => r.id);
  const ordenDespues = ordenarPorHora(vigentes.map((r) => (r.id === idEditado ? { ...r, registrado_en: new Date(nueva).toISOString() } : r))).map(
    (r) => r.id
  );
  return { estado: "ok", cambiaOrden: ordenAntes.join() !== ordenDespues.join() };
}

// Plausibilidad de un formulario entero: los campos fuera de rango (no
// bloqueante; el panel pide "¿seguro?" con esta lista).
export function camposFueraDeRango(valores: Record<string, number | null | undefined>): { campo: string; valor: number; min: number; max: number }[] {
  const out: { campo: string; valor: number; min: number; max: number }[] = [];
  for (const [campo, valor] of Object.entries(valores)) {
    const r = fueraDeRangoPlausible(campo, valor);
    if (r && valor !== null && valor !== undefined) out.push({ campo, valor, ...r });
  }
  return out;
}


// =====================================================================
// Fila horaria (una por hora de reloj; la cargan el médico y enfermería)
// =====================================================================

// Pérdidas insensibles de UNA hora (mL/h), por peso:
//   peso × 10 / 24 × (1 + 0,10 × max(0, T − 37))
// Sin peso -> null (no se inventa). Sin temperatura -> la base, sin
// aumento. Sin descuento por hipotermia. Parámetros en
// PERDIDAS_INSENSIBLES (REFERENCIA GENERAL, A VALIDAR).
export function perdidasInsensiblesHora(pesoKg: number | null | undefined, temperatura: number | null | undefined): number | null {
  if (pesoKg === null || pesoKg === undefined || !(pesoKg > 0)) return null;
  const { mlPorKgPorDia, aumentoPorGrado, temperaturaBase } = PERDIDAS_INSENSIBLES;
  const t = temperatura === null || temperatura === undefined || Number.isNaN(temperatura) ? temperaturaBase : temperatura;
  return ((pesoKg * mlPorKgPorDia) / 24) * (1 + aumentoPorGrado * Math.max(0, t - temperaturaBase));
}

// "Hora" = hora de reloj local (09:00-09:59 es la hora 09).
export function inicioDeHora(ms: number): number {
  const d = new Date(ms);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

export function mismaHora(isoA: string, isoB: string): boolean {
  return inicioDeHora(new Date(isoA).getTime()) === inicioDeHora(new Date(isoB).getTime());
}

// "09:05" en hora local.
export function horaMinutos(isoOMs: string | number): string {
  const d = new Date(isoOMs);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Registro vigente (no anulado) de esa hora, si existe: se completa ese
// mismo, lo haya cargado el médico o el enfermero (una sola fuente).
export function registroDeLaHora<T extends { registrado_en: string; anulado: boolean }>(registros: T[], inicioHoraMs: number): T | null {
  return ordenarPorHora(registros).find((r) => !r.anulado && inicioDeHora(new Date(r.registrado_en).getTime()) === inicioHoraMs) ?? null;
}

// Temperatura para las pérdidas insensibles de una hora: la de esa fila
// o, si falta, la última cargada antes (con su hora, para mostrar la edad).
export function temperaturaParaPerdidas(
  registros: { registrado_en: string; anulado: boolean; temperatura?: number | null }[],
  inicioHoraMs: number,
  temperaturaDeLaFila: number | null
): { valor: number; registrado_en: string | null; propia: boolean } | null {
  if (temperaturaDeLaFila !== null && temperaturaDeLaFila !== undefined) return { valor: temperaturaDeLaFila, registrado_en: null, propia: true };
  const finHora = inicioHoraMs + 3_600_000;
  const previas = ordenarPorHora(registros).filter(
    (r) => !r.anulado && r.temperatura !== null && r.temperatura !== undefined && new Date(r.registrado_en).getTime() < finHora
  );
  const u = previas[previas.length - 1];
  return u ? { valor: u.temperatura as number, registrado_en: u.registrado_en, propia: false } : null;
}

export type HoraGrilla = { inicio: number; registroId: string | null; estado: "cargada" | "faltante" | "en_curso" };

// Horas del caso: desde la primera hora con registro (o la actual si no
// hay ninguno) hasta la hora actual. "faltante" = sin fila pasados
// MINUTOS_HORA_SIN_CARGAR desde su inicio; antes de eso, "en_curso".
export function horasDelCaso(registros: { id: string; registrado_en: string; anulado: boolean }[], ahora: number): HoraGrilla[] {
  const vigentes = registros.filter((r) => !r.anulado);
  const actual = inicioDeHora(ahora);
  const primera = vigentes.length ? Math.min(...vigentes.map((r) => inicioDeHora(new Date(r.registrado_en).getTime()))) : actual;
  const horas: HoraGrilla[] = [];
  for (let h = Math.min(primera, actual); h <= actual; h += 3_600_000) {
    const reg = registroDeLaHora(vigentes, h);
    const estado = reg ? "cargada" : ahora - h >= MINUTOS_HORA_SIN_CARGAR * 60_000 ? "faltante" : "en_curso";
    horas.push({ inicio: h, registroId: reg?.id ?? null, estado });
  }
  return horas;
}

// Alarma roja del enfermero: SOLO la hora en curso, pasados 15 minutos
// sin cargar (salvaguarda principal). Las horas anteriores no alarman.
export function alarmasEnfermeria(horas: HoraGrilla[]): { inicio: number; texto: string }[] {
  const actual = horas[horas.length - 1];
  if (!actual || actual.estado !== "faltante") return [];
  const d = new Date(actual.inicio);
  return [{ inicio: actual.inicio, texto: `Hora ${String(d.getHours()).padStart(2, "0")} sin cargar` }];
}

// La pantalla principal muestra solo la próxima hora pendiente: la hora
// actual si todavía no está cargada ("pendiente", con alarma pasados 15
// minutos); si ya está cargada, la siguiente ("próxima carga HH:00").
export function horaPendiente(
  registros: { registrado_en: string; anulado: boolean }[],
  ahora: number
): { inicio: number; estado: "pendiente" | "proxima"; alarma: boolean } {
  const actual = inicioDeHora(ahora);
  if (registroDeLaHora(registros, actual)) return { inicio: actual + 3_600_000, estado: "proxima", alarma: false };
  return { inicio: actual, estado: "pendiente", alarma: ahora - actual >= MINUTOS_HORA_SIN_CARGAR * 60_000 };
}

// Aviso de hueco (gris, chico, junto al balance): solo horas sin cargar
// ENTRE dos horas cargadas. Al día -> null.
export function textoHuecos(huecos: number): string | null {
  if (huecos <= 0) return null;
  return huecos === 1 ? "falta 1 hora intermedia" : `faltan ${huecos} horas intermedias`;
}

// ---------------------------------------------------------------------
// Tarjeta de cada bomba: cuatro preguntas, todas OBLIGATORIAS y vacías al
// arrancar (los ejemplos son solo placeholder):
//   1. ¿Cuántas ampollas usaste?     2. ¿De cuántos mg es cada ampolla?
//   3. ¿En cuántos mL la diluiste?   4. ¿A cuánto tenés la bomba?
// ---------------------------------------------------------------------
export const SETEO_VACIO = { cantidad: "", contenido: "", volumen: "", velocidad: "" } as const;

// Preguntas sin responder (1 a 4). Vacío = completa.
export function preguntasFaltantes(r: {
  cantidad: number | null;
  contenidoPorAmpolla: number | null;
  volumenMl: number | null;
  velocidadMlH: number | null;
}): (1 | 2 | 3 | 4)[] {
  const ok = (n: number | null, permiteCero = false) => n !== null && !Number.isNaN(n) && (permiteCero ? n >= 0 : n > 0);
  const out: (1 | 2 | 3 | 4)[] = [];
  if (!ok(r.cantidad)) out.push(1);
  if (!ok(r.contenidoPorAmpolla)) out.push(2);
  if (!ok(r.volumenMl)) out.push(3);
  if (!ok(r.velocidadMlH, true)) out.push(4); // 0 = suspendida
  return out;
}

// Frase en lenguaje común, sin cuentas: "2 ampollas de 4 mg en 100 mL".
// Solo con los tres datos del seteo completos; si no, null.
export function fraseSeteo(c: { cantidad: number | null; contenidoPorAmpolla: number | null; volumenMl: number | null }, unidad: string): string | null {
  if (preguntasFaltantes({ ...c, velocidadMlH: 0 }).length > 0) return null;
  return `${fmt(c.cantidad!)} ${c.cantidad === 1 ? "ampolla" : "ampollas"} de ${fmt(c.contenidoPorAmpolla!)} ${unidad} en ${fmt(c.volumenMl!)} mL`;
}

// Orden fijo de las tarjetas (vasoactivas: noradrenalina, vasopresina,
// adrenalina, dobutamina, dopamina, isoproterenol; después las otras).
export function ordenarBombas(drogas: DrogaInfusion[]): DrogaInfusion[] {
  return [...new Set(drogas)].sort((a, b) => ordenBomba(a) - ordenBomba(b));
}

// Seteo -> dilución (la cantidad de ampollas es obligatoria, sin valor
// por defecto).
export function seteoDesdeCampos(
  droga: DrogaInfusion,
  campos: { cantidad: number | null; contenidoPorAmpolla: number | null; volumenMl: number | null }
): { ok: true; dilucion: Dilucion; concentracion: number; unidad: UnidadConcentracion } | { ok: false; error: string } {
  const valido = (n: number | null) => n !== null && !Number.isNaN(n) && n > 0;
  if (!valido(campos.cantidad)) return { ok: false, error: "Falta la cantidad de ampollas." };
  if (!valido(campos.contenidoPorAmpolla)) return { ok: false, error: "Falta cuánto trae cada ampolla." };
  if (!valido(campos.volumenMl)) return { ok: false, error: "Falta en cuánto la diluiste (mL)." };
  const dilucion: Dilucion = {
    ampollas: campos.cantidad!,
    contenidoPorAmpolla: campos.contenidoPorAmpolla!,
    unidadContenido: unidadesContenidoPara(droga)[0],
    volumenFinalMl: campos.volumenMl!,
  };
  const c = concentracion(droga, dilucion);
  if (!c.ok) return { ok: false, error: c.error };
  return { ok: true, dilucion, concentracion: c.valor, unidad: c.unidad };
}

// ---------------------------------------------------------------------
// Bombas de cada hora (tabla mantenimiento_bombas_hora)
// ---------------------------------------------------------------------
// Cada fila horaria lleva la velocidad (mL/h) de cada bomba: ese valor es
// el ingreso de esa hora (velocidad × 1 h). Una hora sin fila es "sin
// dato": no se asume que la bomba siguió igual.
export type BombaHora = {
  id: string;
  registro_id: string;
  droga: DrogaInfusion;
  velocidad_ml_h: number;
  dilucion_id: string | null; // fila de mantenimiento_infusiones con la dilución confirmada
  anulado: boolean;
};

// Lo que el formulario quiere dejar guardado para una droga en esa hora.
export type BombaFormulario = { droga: DrogaInfusion; velocidad_ml_h: number; dilucion_id: string | null };

export function bombasDeFila(bombas: BombaHora[], registroId: string): BombaHora[] {
  return bombas.filter((b) => !b.anulado && b.registro_id === registroId);
}

const ordenBomba = (d: DrogaInfusion) => {
  const i = BOMBAS_ENFERMERIA.indexOf(d);
  return i === -1 ? BOMBAS_ENFERMERIA.length : i;
};

// Plan para guardar las bombas de UNA fila sin duplicados: el índice único
// de la base exige una sola bomba vigente por droga y hora.
// - Droga con una vigente: se actualiza (solo si cambió).
// - Droga con más de una vigente (datos viejos): se actualiza la primera
//   y se anulan las demás.
// - Droga sin vigente: se inserta.
// - Vigente que ya no está en el formulario: se anula.
// - Droga repetida en el formulario: gana la última.
// Orden de ejecución: anular, actualizar, insertar.
export function planGuardadoBombas(
  existentes: BombaHora[],
  formulario: BombaFormulario[]
): { anular: string[]; actualizar: { id: string; velocidad_ml_h: number; dilucion_id: string | null }[]; insertar: BombaFormulario[] } {
  const deseadas = new Map<DrogaInfusion, BombaFormulario>();
  for (const f of formulario) deseadas.set(f.droga, f);
  const porDroga = new Map<DrogaInfusion, BombaHora[]>();
  for (const b of existentes) {
    if (b.anulado) continue;
    porDroga.set(b.droga, [...(porDroga.get(b.droga) ?? []), b]);
  }
  const anular: string[] = [];
  const actualizar: { id: string; velocidad_ml_h: number; dilucion_id: string | null }[] = [];
  const insertar: BombaFormulario[] = [];
  for (const [droga, filas] of porDroga) {
    const d = deseadas.get(droga);
    if (!d) {
      anular.push(...filas.map((f) => f.id));
      continue;
    }
    const [primera, ...resto] = filas;
    anular.push(...resto.map((f) => f.id));
    if (primera.velocidad_ml_h !== d.velocidad_ml_h || primera.dilucion_id !== d.dilucion_id) {
      actualizar.push({ id: primera.id, velocidad_ml_h: d.velocidad_ml_h, dilucion_id: d.dilucion_id });
    }
  }
  for (const [droga, d] of deseadas) if (!porDroga.has(droga)) insertar.push(d);
  return { anular, actualizar, insertar };
}

// Dilución confirmada vigente para una droga en un momento: la última
// fila de dilución (inicio o cambio de dilución) no anulada hasta ese
// momento. Los eventos "cambié la velocidad" no traen dilución.
export function dilucionVigenteEn(filas: InfusionFila[], droga: Droga, momentoMs: number): { id: string; dilucion: Dilucion } | null {
  const candidatas = ordenarPorHora(filas).filter(
    (f) =>
      !f.anulado &&
      f.droga === droga &&
      f.tipo === "infusion" &&
      f.motivo !== "cambio_velocidad" &&
      f.ampollas !== null &&
      f.contenido_por_ampolla !== null &&
      f.unidad_contenido !== null &&
      f.volumen_final_ml !== null &&
      new Date(f.registrado_en).getTime() <= momentoMs
  );
  const u = candidatas[candidatas.length - 1];
  if (!u) return null;
  return {
    id: u.id,
    dilucion: { ampollas: u.ampollas!, contenidoPorAmpolla: u.contenido_por_ampolla!, unidadContenido: u.unidad_contenido!, volumenFinalMl: u.volumen_final_ml! },
  };
}

export function dilucionPorId(filas: InfusionFila[], id: string | null): Dilucion | null {
  if (!id) return null;
  const f = filas.find((x) => x.id === id && !x.anulado);
  if (!f || f.ampollas === null || f.contenido_por_ampolla === null || f.unidad_contenido === null || f.volumen_final_ml === null) return null;
  return { ampollas: f.ampollas, contenidoPorAmpolla: f.contenido_por_ampolla, unidadContenido: f.unidad_contenido, volumenFinalMl: f.volumen_final_ml };
}

// Eventos "cambié la velocidad" no anulados, en orden.
function eventosVelocidad(infusiones: InfusionFila[]): InfusionFila[] {
  return ordenarPorHora(infusiones).filter((f) => !f.anulado && f.tipo === "infusion" && f.motivo === "cambio_velocidad" && f.velocidad_ml_h !== null);
}

// ---------------------------------------------------------------------
// Fila nueva precargada
// ---------------------------------------------------------------------
export type CampoLiquido = (typeof LIQUIDOS_ENFERMERIA)[number]["campo"];

export type FilaHoraria = {
  id: string;
  registrado_en: string;
  anulado: boolean;
  temperatura: number | null;
  diuresis_ml: number | null;
  egr_sng_drenajes_ml: number | null;
  perdidas_insensibles_ml: number | null;
  perdidas_insensibles_editadas: boolean;
} & Record<CampoLiquido, number | null>;

export type Precarga = {
  desdeRegistroId: string | null; // fila de la que se copió (null = no había)
  liquidos: Partial<Record<CampoLiquido, number>>;
  bombas: BombaFormulario[];
};

// La fila nueva arranca con las bombas y los líquidos de la hora anterior
// (etiqueta "copiado de la hora anterior" hasta que se toquen o se
// guarde). Signos, glucemia, diuresis, SNG y hemoderivados arrancan
// vacíos. Bombas en 0 (suspendidas) no se precargan. Un "cambié la
// velocidad" posterior a esa fila manda sobre ella.
export function filaPrecargada(registros: FilaHoraria[], bombas: BombaHora[], infusiones: InfusionFila[], inicioHoraMs: number): Precarga {
  const previas = ordenarPorHora(registros).filter((r) => !r.anulado && inicioDeHora(new Date(r.registrado_en).getTime()) < inicioHoraMs);
  const anterior = previas[previas.length - 1] ?? null;
  const liquidos: Partial<Record<CampoLiquido, number>> = {};
  if (anterior) {
    for (const l of LIQUIDOS_ENFERMERIA) {
      const v = anterior[l.campo];
      if (l.precarga && v !== null && v !== undefined) liquidos[l.campo] = v;
    }
  }
  const porDroga = new Map<DrogaInfusion, BombaFormulario>();
  if (anterior) {
    for (const b of bombasDeFila(bombas, anterior.id)) {
      porDroga.set(b.droga, { droga: b.droga, velocidad_ml_h: b.velocidad_ml_h, dilucion_id: b.dilucion_id });
    }
  }
  const desde = anterior ? new Date(anterior.registrado_en).getTime() : -Infinity;
  const finHora = inicioHoraMs + 3_600_000;
  for (const ev of eventosVelocidad(infusiones)) {
    const t = new Date(ev.registrado_en).getTime();
    if (t <= desde || t >= finHora) continue;
    const droga = ev.droga as DrogaInfusion;
    const previa = porDroga.get(droga);
    porDroga.set(droga, { droga, velocidad_ml_h: ev.velocidad_ml_h!, dilucion_id: previa?.dilucion_id ?? dilucionVigenteEn(infusiones, droga, t)?.id ?? null });
  }
  const lista = [...porDroga.values()].filter((b) => b.velocidad_ml_h > 0).sort((a, b) => ordenBomba(a.droga) - ordenBomba(b.droga));
  return { desdeRegistroId: anterior?.id ?? null, liquidos, bombas: lista };
}

// Bombas que arrancan (o se reinician) en esta fila: velocidad > 0 y no
// venían corriendo en la precarga. Vuelven a pedir el toque de dilución.
export function bombasQueArrancan(precarga: BombaFormulario[], formulario: BombaFormulario[]): DrogaInfusion[] {
  const corriendo = new Set(precarga.filter((b) => b.velocidad_ml_h > 0).map((b) => b.droga));
  return formulario.filter((b) => b.velocidad_ml_h > 0 && !corriendo.has(b.droga)).map((b) => b.droga);
}

// ---------------------------------------------------------------------
// Balance (siempre calculado, nunca guardado)
// ---------------------------------------------------------------------
export type PerdidasFila = {
  valor: number | null;
  editada: boolean;
  faltaPeso: boolean;
  temperatura: { valor: number; registrado_en: string | null; propia: boolean } | null;
};

// Pérdidas de una fila: la editada a mano (marca "editado") o la
// calculada con el peso y la temperatura de la fila (o la última).
export function perdidasDeFila(fila: FilaHoraria, registros: FilaHoraria[], pesoKg: number | null): PerdidasFila {
  if (fila.perdidas_insensibles_editadas) return { valor: fila.perdidas_insensibles_ml, editada: true, faltaPeso: false, temperatura: null };
  const temperatura = temperaturaParaPerdidas(registros, inicioDeHora(new Date(fila.registrado_en).getTime()), fila.temperatura);
  const valor = perdidasInsensiblesHora(pesoKg, temperatura?.valor ?? null);
  return { valor, editada: false, faltaPeso: valor === null, temperatura };
}

// Totales de una fila: ingresos = líquidos + hemoderivados + bombas
// (velocidad × 1 h); egresos = diuresis + SNG/drenajes + pérdidas.
export function totalesHora(
  fila: FilaHoraria,
  bombasFila: { velocidad_ml_h: number }[],
  perdidasMl: number | null
): { liquidosMl: number; bombasMl: number; ingresos: number; egresos: number; parcial: number } {
  const liquidosMl = LIQUIDOS_ENFERMERIA.reduce((s, l) => s + (fila[l.campo] ?? 0), 0);
  const bombasMl = bombasFila.reduce((s, b) => s + b.velocidad_ml_h, 0);
  const ingresos = liquidosMl + bombasMl;
  const egresos = (fila.diuresis_ml ?? 0) + (fila.egr_sng_drenajes_ml ?? 0) + (perdidasMl ?? 0);
  return { liquidosMl, bombasMl, ingresos, egresos, parcial: ingresos - egresos };
}

export type BalanceHora =
  | {
      inicio: number;
      estado: "cargada";
      registroId: string;
      registrado_en: string;
      liquidosMl: number;
      bombasMl: number;
      ingresos: number;
      egresos: number;
      perdidas: PerdidasFila;
      parcial: number;
      acumulado: number;
    }
  | { inicio: number; estado: "hueco" }; // sin cargar, entre dos horas cargadas

// Balance hora por hora, desde la PRIMERA hora cargada del caso hasta la
// ÚLTIMA cargada (lo de antes no existe para el balance; lo de después
// todavía no se cargó). Acumulado = suma de los parciales de las horas
// cargadas; una hora sin cargar en el medio es un hueco: no suma (ni
// cero) y se cuenta en `huecos`. Se recalcula al completar o anular.
export function balancePorHora(
  registros: FilaHoraria[],
  bombas: BombaHora[],
  pesoKg: number | null,
  ahora: number
): { horas: BalanceHora[]; acumulado: number; huecos: number; horasSinPerdidas: number } {
  let acumulado = 0;
  let horasSinPerdidas = 0;
  const grilla = horasDelCaso(registros, ahora);
  let ultima = -1;
  grilla.forEach((h, i) => {
    if (h.registroId) ultima = i;
  });
  const horas: BalanceHora[] = grilla.slice(0, ultima + 1).map((h): BalanceHora => {
    if (!h.registroId) return { inicio: h.inicio, estado: "hueco" };
    const fila = registros.find((r) => r.id === h.registroId)!;
    const perdidas = perdidasDeFila(fila, registros, pesoKg);
    if (perdidas.valor === null) horasSinPerdidas++;
    const t = totalesHora(fila, bombasDeFila(bombas, fila.id), perdidas.valor);
    acumulado += t.parcial;
    return { inicio: h.inicio, estado: "cargada", registroId: fila.id, registrado_en: fila.registrado_en, ...t, perdidas, acumulado };
  });
  return { horas, acumulado, huecos: horas.filter((h) => h.estado === "hueco").length, horasSinPerdidas };
}

// ---------------------------------------------------------------------
// Gammas en vivo y alarmas de dosis
// ---------------------------------------------------------------------
export type EstadoBomba = {
  droga: DrogaInfusion;
  velocidadMlH: number;
  origen: "fila" | "evento"; // fila horaria o "cambié la velocidad"
  momento: string; // hora del dato
  dilucion: Dilucion | null;
  dosis: (ResultadoDosis & { ok: true }) | null;
  estado: "ok" | "sin_dilucion" | "falta_peso";
  desactualizado: boolean; // más de MINUTOS_DOSIS_DESACTUALIZADA sin dato nuevo
};

export type EstadoBombas = {
  porDroga: Partial<Record<DrogaInfusion, EstadoBomba>>; // solo las que corren (> 0 mL/h)
  filaDato: string | null; // registrado_en de la última fila horaria
  noradrenalina: EstadoBomba | null;
  noradrenalinaGamma: number | null; // solo si la dosis es utilizable (ok y al día)
  vasopresinaActiva: boolean;
  algunVasopresorActivo: boolean; // informativo, FUERA del score y del color
  ultimoBoloDesmopresina: string | null;
};

// Las gammas salen de la última fila horaria; un "cambié la velocidad"
// posterior manda sobre ella para esa droga. Los bolos NUNCA cuentan
// como bomba activa.
export function estadoBombas(datos: {
  registros: { id: string; registrado_en: string; anulado: boolean }[];
  bombas: BombaHora[];
  infusiones: InfusionFila[];
  pesoKg: number | null;
  ahora: number;
}): EstadoBombas {
  const vigentes = ordenarPorHora(datos.registros.filter((r) => !r.anulado));
  const ultima = vigentes[vigentes.length - 1] ?? null;
  type Dato = { velocidad: number; origen: "fila" | "evento"; momento: string; dilucion: Dilucion | null };
  const porDroga = new Map<DrogaInfusion, Dato>();
  if (ultima) {
    for (const b of bombasDeFila(datos.bombas, ultima.id)) {
      porDroga.set(b.droga, { velocidad: b.velocidad_ml_h, origen: "fila", momento: ultima.registrado_en, dilucion: dilucionPorId(datos.infusiones, b.dilucion_id) });
    }
  }
  const desde = ultima ? new Date(ultima.registrado_en).getTime() : -Infinity;
  for (const ev of eventosVelocidad(datos.infusiones)) {
    const t = new Date(ev.registrado_en).getTime();
    if (t <= desde || t > datos.ahora) continue;
    const droga = ev.droga as DrogaInfusion;
    porDroga.set(droga, { velocidad: ev.velocidad_ml_h!, origen: "evento", momento: ev.registrado_en, dilucion: dilucionVigenteEn(datos.infusiones, droga, t)?.dilucion ?? null });
  }

  const salida: Partial<Record<DrogaInfusion, EstadoBomba>> = {};
  for (const [droga, d] of porDroga) {
    if (!(d.velocidad > 0)) continue;
    const desactualizado = datos.ahora - new Date(d.momento).getTime() > MINUTOS_DOSIS_DESACTUALIZADA * 60_000;
    let estado: EstadoBomba["estado"] = "sin_dilucion";
    let dosis: EstadoBomba["dosis"] = null;
    if (d.dilucion) {
      const c = concentracion(droga, d.dilucion);
      if (c.ok) {
        const r = dosisDesdeVelocidad(droga, d.velocidad, c.valor, datos.pesoKg);
        if (r.ok) {
          dosis = r;
          estado = "ok";
        } else if (r.motivo === "sin_peso") estado = "falta_peso";
      }
    }
    salida[droga] = { droga, velocidadMlH: d.velocidad, origen: d.origen, momento: d.momento, dilucion: d.dilucion, dosis, estado, desactualizado };
  }
  const nora = salida.noradrenalina ?? null;
  const bolos = ordenarPorHora(datos.infusiones).filter((f) => !f.anulado && f.tipo === "bolo" && f.droga === "desmopresina");
  return {
    porDroga: salida,
    filaDato: ultima?.registrado_en ?? null,
    noradrenalina: nora,
    noradrenalinaGamma: nora && nora.estado === "ok" && !nora.desactualizado ? nora.dosis!.dosis : null,
    vasopresinaActiva: salida.vasopresina !== undefined,
    algunVasopresorActivo: VASOPRESORES.some((d) => salida[d as DrogaInfusion] !== undefined),
    ultimoBoloDesmopresina: bolos.length ? bolos[bolos.length - 1].registrado_en : null,
  };
}

// Alarmas de dosis: si el dato está desactualizado, falta la dilución o
// falta el peso, las alarmas de dosis de esa droga quedan inactivas y se
// avisa con un cartel.
export function alarmasDosis(e: EstadoBombas): Alarma[] {
  const out: Alarma[] = [];
  const activas = Object.values(e.porDroga).filter((b): b is EstadoBomba => b !== undefined);
  const viejas = activas.filter((b) => b.desactualizado);
  if (viejas.length) {
    const ultimo = viejas.map((b) => b.momento).sort().pop()!;
    out.push({ nivel: "amarillo", texto: `Dosis de bombas: dato desactualizado (de las ${horaMinutos(ultimo)}); alarmas de dosis en pausa.` });
  }
  for (const b of activas) {
    if (b.estado === "sin_dilucion") out.push({ nivel: "amarillo", texto: `${DROGAS_INFUSION[b.droga].etiqueta} sin dilución confirmada: sin dosis y sin alarmas de dosis.` });
  }
  if (activas.some((b) => b.estado === "falta_peso")) out.push({ nivel: "amarillo", texto: "Falta peso: dosis por kg sin calcular." });
  return out;
}

// =====================================================================
// Vista del MÉDICO: respirador, PaFi, datos del médico y tendencias
// =====================================================================

// ---------------------------------------------------------------------
// Respirador: se setea una vez; cada cambio es un evento completo con su
// hora (tabla mantenimiento_respirador). Solo se agregan y se anulan.
// ---------------------------------------------------------------------
export type EventoRespirador = {
  id: string;
  registrado_en: string;
  modo: ModoRespirador | null;
  modo_otro: string | null;
  fio2: number | null;
  peep: number | null;
  volumen_corriente: number | null;
  frecuencia: number | null;
  presion_plateau: number | null;
  presion_pico: number | null;
  anulado: boolean;
};

// Último evento no anulado hasta ese momento (Infinity = el vigente hoy).
export function respiradorVigenteEn(eventos: EventoRespirador[], momentoMs: number): EventoRespirador | null {
  const previos = ordenarPorHora(eventos).filter((e) => !e.anulado && new Date(e.registrado_en).getTime() <= momentoMs);
  return previos[previos.length - 1] ?? null;
}

export type PafiCalculada = {
  valor: number;
  medido_en: string; // hora de la gasometría (PaO2)
  desactualizado: boolean; // gasometría de más de HORAS_LAB_DESACTUALIZADO
  fio2: number;
  peep: number | null;
  fio2Desde: string; // "FiO2 de las HH:MM"
  origen: "respirador" | "registro" | "toma";
  respiradorViejo: boolean; // último evento del respirador de más de HORAS_RESPIRADOR_VIEJO
};

// PaFi = PaO2 de la última gasometría / FiO2 vigente EN ESE MOMENTO, con
// la PEEP vigente. FiO2: el respirador; si no había evento antes de la
// gasometría, la de las filas horarias viejas; si tampoco, la cargada con
// esa toma. Sin ninguna, no se calcula.
export function pafiConRespirador(
  lab: ValorLab[],
  eventos: EventoRespirador[],
  registrosViejos: { registrado_en: string; anulado: boolean; fio2?: number | null; peep?: number | null }[],
  ahora: number
): PafiCalculada | null {
  const pao2 = ultimoValorLab(lab, "pao2", ahora);
  if (!pao2) return null;
  const t = new Date(pao2.medido_en).getTime();
  const ultimoEvento = respiradorVigenteEn(eventos, Infinity);
  const respiradorViejo = ultimoEvento !== null && ahora - new Date(ultimoEvento.registrado_en).getTime() > HORAS_RESPIRADOR_VIEJO * 3_600_000;
  const base = { medido_en: pao2.medido_en, desactualizado: pao2.desactualizado, respiradorViejo };

  const ev = respiradorVigenteEn(
    eventos.filter((e) => e.fio2 !== null),
    t
  );
  if (ev) {
    const valor = pafi(pao2.valor, ev.fio2);
    if (valor !== null) return { ...base, valor, fio2: ev.fio2!, peep: ev.peep, fio2Desde: ev.registrado_en, origen: "respirador" };
  }
  const viejos = ordenarPorHora(registrosViejos).filter(
    (r) => !r.anulado && r.fio2 !== null && r.fio2 !== undefined && new Date(r.registrado_en).getTime() <= t
  );
  const rv = viejos[viejos.length - 1];
  if (rv) {
    const valor = pafi(pao2.valor, rv.fio2 ?? null);
    if (valor !== null) return { ...base, valor, fio2: rv.fio2!, peep: rv.peep ?? null, fio2Desde: rv.registrado_en, origen: "registro" };
  }
  const toma = lab.find((v) => v.parametro === "fio2" && !v.anulado && v.toma_id === pao2.toma_id && v.valor !== null);
  if (toma) {
    const valor = pafi(pao2.valor, toma.valor);
    if (valor !== null) return { ...base, valor, fio2: toma.valor!, peep: null, fio2Desde: pao2.medido_en, origen: "toma" };
  }
  return null;
}

// ---------------------------------------------------------------------
// Datos del médico (tabla mantenimiento_medico): una fila por carga, solo
// con los campos completados. Último valor por campo; las columnas viejas
// de las filas horarias quedan como respaldo (menos la disfunción).
// ---------------------------------------------------------------------
export const CAMPOS_MEDICO = [
  "pvc",
  "gc",
  "ic_medido",
  "sat_venosa",
  "delta_pp",
  "delta_vs",
  "delta_co2_espirado",
  "indice_vena_cava",
  "resultado_pasivo_miembros",
] as const;
export type CampoMedico = (typeof CAMPOS_MEDICO)[number];

export type MedicionMedico = {
  id: string;
  registrado_en: string;
  disfuncion_miocardica: boolean | null;
  anulado: boolean;
} & Record<CampoMedico, number | null>;

export type DatoConHora = { valor: number; registrado_en: string; origen: "medico" | "registro" };

// Último valor de un campo: el más reciente entre las mediciones del
// médico y las filas horarias viejas (no anuladas, con dato).
export function ultimoValorMedico(
  campo: CampoMedico,
  mediciones: MedicionMedico[],
  registrosViejos: ({ registrado_en: string; anulado: boolean } & Partial<Record<CampoMedico, number | null>>)[]
): DatoConHora | null {
  const puntos = serieMedico(campo, mediciones, registrosViejos);
  const u = puntos[puntos.length - 1];
  return u ? { valor: u.valor, registrado_en: new Date(u.t).toISOString(), origen: u.origen } : null;
}

// Todos los valores de un campo, en orden (para las tendencias: puntos
// sueltos con su hora).
export function serieMedico(
  campo: CampoMedico,
  mediciones: MedicionMedico[],
  registrosViejos: ({ registrado_en: string; anulado: boolean } & Partial<Record<CampoMedico, number | null>>)[]
): (Punto & { origen: "medico" | "registro" })[] {
  const out: (Punto & { origen: "medico" | "registro" })[] = [];
  for (const m of mediciones) {
    const v = m[campo];
    if (!m.anulado && v !== null && v !== undefined) out.push({ t: new Date(m.registrado_en).getTime(), valor: v, origen: "medico" });
  }
  for (const r of registrosViejos) {
    const v = r[campo];
    if (!r.anulado && v !== null && v !== undefined) out.push({ t: new Date(r.registrado_en).getTime(), valor: v, origen: "registro" });
  }
  return out.sort((a, b) => a.t - b.t);
}

// Disfunción miocárdica: SOLO la que confirmó el médico (las filas
// horarias tienen false por defecto y no sirven de respaldo). Hasta que
// la confirme: "sin evaluar".
export function disfuncionMiocardica(
  mediciones: MedicionMedico[]
): { estado: "sin_evaluar" } | { estado: "si" | "no"; registrado_en: string } {
  const conDato = ordenarPorHora(mediciones).filter((m) => !m.anulado && m.disfuncion_miocardica !== null);
  const u = conDato[conDato.length - 1];
  if (!u) return { estado: "sin_evaluar" };
  return { estado: u.disfuncion_miocardica ? "si" : "no", registrado_en: u.registrado_en };
}

// Último valor de laboratorio con respaldo en las filas horarias viejas
// (osmolaridades y densidad de diabetes insípida).
export function ultimoLabConRespaldo(
  lab: ValorLab[],
  parametro: string,
  registrosViejos: { registrado_en: string; anulado: boolean; [campo: string]: unknown }[],
  campoViejo: string,
  ahora: number
): { valor: number; medido_en: string; desactualizado: boolean } | null {
  const l = ultimoValorLab(lab, parametro, ahora);
  const viejos = ordenarPorHora(registrosViejos).filter((r) => !r.anulado && typeof r[campoViejo] === "number");
  const rv = viejos[viejos.length - 1];
  if (rv && (!l || rv.registrado_en > l.medido_en)) {
    const horas = (ahora - new Date(rv.registrado_en).getTime()) / 3_600_000;
    return { valor: rv[campoViejo] as number, medido_en: rv.registrado_en, desactualizado: horas > HORAS_LAB_DESACTUALIZADO };
  }
  return l ? { valor: l.valor, medido_en: l.medido_en, desactualizado: l.desactualizado } : null;
}

// ---------------------------------------------------------------------
// Tendencias
// ---------------------------------------------------------------------
export type Punto = { t: number; valor: number };

// Puntos dentro de la ventana [ahora − horas, ahora].
export function recortarVentana<T extends Punto>(puntos: T[], ahora: number, horas: number): T[] {
  const desde = ahora - horas * 3_600_000;
  return puntos.filter((p) => p.t >= desde && p.t <= ahora);
}

// Dirección: solo con 3 puntos o más (si no, null). Cambio en la ventana
// = pendiente de la recta de mínimos cuadrados × tiempo entre el primer y
// el último punto. Por debajo del mínimo: "estable".
export function direccionTendencia(puntos: Punto[], cambioMinimo: number): "sube" | "baja" | "estable" | null {
  if (puntos.length < 3) return null;
  const n = puntos.length;
  const mt = puntos.reduce((s, p) => s + p.t, 0) / n;
  const mv = puntos.reduce((s, p) => s + p.valor, 0) / n;
  const num = puntos.reduce((s, p) => s + (p.t - mt) * (p.valor - mv), 0);
  const den = puntos.reduce((s, p) => s + (p.t - mt) ** 2, 0);
  if (den === 0) return "estable";
  const cambio = (num / den) * (puntos[n - 1].t - puntos[0].t);
  if (Math.abs(cambio) < cambioMinimo) return "estable";
  return cambio > 0 ? "sube" : "baja";
}

// Minutos desde el último punto (edad del dato); null sin puntos.
export function edadUltimoDato(puntos: Punto[], ahora: number): number | null {
  if (puntos.length === 0) return null;
  return (ahora - Math.max(...puntos.map((p) => p.t))) / 60_000;
}

// Noradrenalina (o la droga que sea) en su dosis, hora por hora: la
// velocidad de cada fila horaria × su seteo. Sin seteo o sin peso, esa
// hora no tiene punto.
export function dosisPorFila(
  droga: DrogaInfusion,
  registros: { id: string; registrado_en: string; anulado: boolean }[],
  bombas: BombaHora[],
  infusiones: InfusionFila[],
  pesoKg: number | null
): Punto[] {
  const out: Punto[] = [];
  for (const r of ordenarPorHora(registros)) {
    if (r.anulado) continue;
    const b = bombasDeFila(bombas, r.id).find((x) => x.droga === droga);
    if (!b) continue;
    if (b.velocidad_ml_h === 0) {
      out.push({ t: new Date(r.registrado_en).getTime(), valor: 0 });
      continue;
    }
    const dil = dilucionPorId(infusiones, b.dilucion_id);
    const c = dil ? concentracion(droga, dil) : null;
    const d = c?.ok ? dosisDesdeVelocidad(droga, b.velocidad_ml_h, c.valor, pesoKg) : null;
    if (d?.ok) out.push({ t: new Date(r.registrado_en).getTime(), valor: d.dosis });
  }
  return out;
}

// ---------------------------------------------------------------------
// Franja de estado: avisos de enfermería (uno de cada uno, nunca lista)
// ---------------------------------------------------------------------
// - La hora pendiente de enfermería pasados 15 minutos (ámbar).
// - La nota "Aviso al médico" de la ÚLTIMA hora cargada (si tiene).
export function avisosDeEnfermeria(
  registros: { registrado_en: string; anulado: boolean; aviso_medico?: string | null }[],
  ahora: number
): { pendiente: { inicio: number; texto: string } | null; nota: { texto: string; registrado_en: string } | null } {
  const p = horaPendiente(registros, ahora);
  const pendiente =
    p.estado === "pendiente" && p.alarma
      ? { inicio: p.inicio, texto: `Hora ${String(new Date(p.inicio).getHours()).padStart(2, "0")} pendiente (enfermería)` }
      : null;
  const vigentes = ordenarPorHora(registros.filter((r) => !r.anulado));
  const ultima = vigentes[vigentes.length - 1];
  const nota = ultima?.aviso_medico?.trim() ? { texto: ultima.aviso_medico.trim(), registrado_en: ultima.registrado_en } : null;
  return { pendiente, nota };
}
