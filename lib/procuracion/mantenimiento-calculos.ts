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
  HORAS_LAB_DESACTUALIZADO,
  METAS,
  MINUTOS_ALARMA_SIN_REGISTRO,
  MINUTOS_INTERVALO_CORTO,
  MINUTOS_INTERVALO_LARGO,
  MINUTOS_PRIMER_REGISTRO,
  RANGOS_PLAUSIBLES,
  SCORE_GLUCEMIA_MENOR_A,
  SCORE_PAFI_MAYOR_A,
  SCORE_PH_DESDE,
  SCORE_PH_HASTA,
  SCORE_SODIO_MENOR_A,
  UMBRALES_VOLEMIA,
  VASOPRESORES,
  type ClaveMeta,
  type Droga,
  type Intervalo,
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
  unidadContenido: "mg" | "mcg" | "U";
  volumenFinalMl: number;
};

export type UnidadConcentracion = "mcg/mL" | "mg/mL" | "U/mL";

// Unidad de concentración que necesita cada unidad de dosis.
function unidadConcentracionPara(unidadDosis: UnidadDosis): UnidadConcentracion {
  if (unidadDosis === "U/min") return "U/mL";
  if (unidadDosis === "mg/min") return "mg/mL";
  return "mcg/mL"; // mcg/kg/min y mcg/min
}

export type ResultadoConcentracion =
  | { ok: true; valor: number; unidad: UnidadConcentracion; totalDroga: number; unidadTotal: "mg" | "mcg" | "U" }
  | { ok: false; error: string };

export function concentracion(droga: Exclude<Droga, "desmopresina">, d: Dilucion): ResultadoConcentracion {
  if (!(d.ampollas > 0) || !(d.contenidoPorAmpolla > 0) || !(d.volumenFinalMl > 0)) {
    return { ok: false, error: "Faltan datos de la dilución (ampollas, contenido por ampolla y volumen final)." };
  }
  const unidad = unidadConcentracionPara(DROGAS_INFUSION[droga].unidadDosis);
  const total = d.ampollas * d.contenidoPorAmpolla;
  if (unidad === "U/mL") {
    if (d.unidadContenido !== "U") return { ok: false, error: "Para vasopresina el contenido va en U por ampolla." };
    return { ok: true, valor: total / d.volumenFinalMl, unidad, totalDroga: total, unidadTotal: "U" };
  }
  if (d.unidadContenido === "U") return { ok: false, error: "Esta droga no se dosifica en U: cargá mg o mcg por ampolla." };
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

export type ResultadoDosis =
  | { ok: true; dosis: number; unidad: UnidadDosis; uPorHora?: number; cuenta: string }
  | { ok: false; error: string; motivo: "sin_peso" | "datos" };

const usaPeso = (u: UnidadDosis) => u === "mcg/kg/min";

// mL/h -> dosis.
//   mcg/kg/min = (mL/h × mcg/mL) / (peso_kg × 60)
//   mcg/min    = (mL/h × mcg/mL) / 60
//   mg/min     = (mL/h × mg/mL) / 60
//   U/min      = (mL/h × U/mL) / 60   (y U/h = mL/h × U/mL)
export function dosisDesdeVelocidad(
  droga: Exclude<Droga, "desmopresina">,
  velocidadMlH: number,
  concentracionPorMl: number,
  pesoKg: number | null
): ResultadoDosis {
  const unidad = DROGAS_INFUSION[droga].unidadDosis;
  const uc = unidadConcentracionPara(unidad);
  if (!(velocidadMlH >= 0) || !(concentracionPorMl > 0)) return { ok: false, motivo: "datos", error: "Faltan velocidad o concentración." };
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
export function velocidadDesdeDosis(
  droga: Exclude<Droga, "desmopresina">,
  dosis: number,
  concentracionPorMl: number,
  pesoKg: number | null
): ResultadoVelocidad {
  const unidad = DROGAS_INFUSION[droga].unidadDosis;
  const uc = unidadConcentracionPara(unidad);
  if (!(dosis >= 0) || !(concentracionPorMl > 0)) return { ok: false, motivo: "datos", error: "Faltan dosis o concentración." };
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
  ingresos_ml: number | null;
  egresos_ml: number | null;
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

export type BalanceFila = { id: string; registrado_en: string; parcial: number; acumulado: number };

// Balance = ingresos − (egresos + diuresis), parcial por registro y
// acumulado. Sin dato = 0. Lo anulado no cuenta.
export function calcularBalance(registros: RegistroBase[]): BalanceFila[] {
  let acumulado = 0;
  return ordenarPorHora(registros)
    .filter((r) => !r.anulado)
    .map((r) => {
      const parcial = (r.ingresos_ml ?? 0) - ((r.egresos_ml ?? 0) + (r.diuresis_ml ?? 0));
      acumulado += parcial;
      return { id: r.id, registrado_en: r.registrado_en, parcial, acumulado };
    });
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
export type ValorLab = { parametro: string; valor: number; medido_en: string; anulado: boolean; toma_id: string };

export function ultimoValorLab(
  valores: ValorLab[],
  parametro: string,
  ahora: number
): { valor: number; medido_en: string; desactualizado: boolean; toma_id: string } | null {
  const candidatos = valores.filter((v) => v.parametro === parametro && !v.anulado);
  if (candidatos.length === 0) return null;
  const ultimo = candidatos.reduce((a, b) => (b.medido_en > a.medido_en ? b : a));
  const horas = (ahora - new Date(ultimo.medido_en).getTime()) / 3_600_000;
  return { valor: ultimo.valor, medido_en: ultimo.medido_en, desactualizado: horas > HORAS_LAB_DESACTUALIZADO, toma_id: ultimo.toma_id };
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
    { clave: "glucemia", etiqueta: `Glucemia <${SCORE_GLUCEMIA_MENOR_A}`, cumple: datos.glucemia === null ? null : datos.glucemia < SCORE_GLUCEMIA_MENOR_A },
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
  unidad_contenido: "mg" | "mcg" | "U" | null;
  volumen_final_ml: number | null;
  velocidad_ml_h: number | null;
  dosis_calculada: number | null;
  unidad_dosis: string | null;
  anulado: boolean;
};

// Última infusión no anulada de cada droga. "Activa" = velocidad > 0.
export function estadoInfusiones(filas: InfusionFila[]): {
  porDroga: Partial<Record<Droga, InfusionFila & { activa: boolean }>>;
  vasopresinaActiva: boolean;
  noradrenalinaGamma: number | null;
  algunVasopresorActivo: boolean;
  ultimoBoloDesmopresina: string | null;
} {
  const porDroga: Partial<Record<Droga, InfusionFila & { activa: boolean }>> = {};
  for (const f of ordenarPorHora(filas)) {
    if (f.anulado || f.tipo !== "infusion") continue;
    porDroga[f.droga] = { ...f, activa: (f.velocidad_ml_h ?? 0) > 0 };
  }
  const nora = porDroga.noradrenalina;
  const bolos = ordenarPorHora(filas).filter((f) => !f.anulado && f.tipo === "bolo" && f.droga === "desmopresina");
  return {
    porDroga,
    vasopresinaActiva: porDroga.vasopresina?.activa ?? false,
    noradrenalinaGamma: nora?.activa && nora.dosis_calculada !== null ? nora.dosis_calculada : null,
    // Informativo, FUERA del score y del color.
    algunVasopresorActivo: VASOPRESORES.some((d) => porDroga[d]?.activa),
    ultimoBoloDesmopresina: bolos.length ? bolos[bolos.length - 1].registrado_en : null,
  };
}

// Última dilución usada para una droga en el caso (no anulada): se
// propone de nuevo al cambiar la velocidad, pero se vuelve a confirmar.
export function ultimaDilucion(filas: InfusionFila[], droga: Droga): Dilucion | null {
  const conDilucion = ordenarPorHora(filas).filter(
    (f) =>
      !f.anulado &&
      f.droga === droga &&
      f.tipo === "infusion" &&
      f.ampollas !== null &&
      f.contenido_por_ampolla !== null &&
      f.unidad_contenido !== null &&
      f.volumen_final_ml !== null
  );
  const u = conDilucion[conDilucion.length - 1];
  if (!u) return null;
  return {
    ampollas: u.ampollas!,
    contenidoPorAmpolla: u.contenido_por_ampolla!,
    unidadContenido: u.unidad_contenido!,
    volumenFinalMl: u.volumen_final_ml!,
  };
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
    if (p.color === "rojo" || p.color === "amarillo")
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
