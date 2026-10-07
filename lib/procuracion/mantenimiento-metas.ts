// =====================================================================
// MANTENIMIENTO -- metas, umbrales, referencias y dosis.
//
// A VALIDAR CON PROTOCOLO CUCAIBA/INCUCAI.
//
// TODOS los números clínicos del panel viven en este archivo, para poder
// revisarlos sin buscar en el código. Lo que viene del spec de la usuaria
// está tal cual; lo que no venía en el spec y hubo que definir para que
// el cálculo funcione está marcado "PROPUESTO, A VALIDAR".
//
// Es apoyo a la decisión, no indicación: cada sugerencia se muestra con
// LEYENDA_VERIFICACION.
//
// Lógica pura, sin imports: lo usan mantenimiento-calculos.ts,
// mantenimiento-sugerencias.ts y sus tests (node --test).
// =====================================================================

export const LEYENDA_VERIFICACION = "Referencia general, verificar con protocolo.";

// ---------------------------------------------------------------------
// Semáforo verde / amarillo / rojo
// ---------------------------------------------------------------------
// Cada meta define los intervalos VERDES y AMARILLOS; todo lo que no cae
// en ninguno es ROJO. Los cortes se escriben sin huecos para que un valor
// con decimales siempre tenga color: el spec dice "FC 50-59 o 121-130"
// (enteros) y acá queda [50, 60) y (120, 130] -- 59,5 es amarillo.
export type Intervalo = {
  desde?: number; // sin `desde` = -infinito
  hasta?: number; // sin `hasta` = +infinito
  desdeExcluido?: boolean; // por defecto el borde se incluye
  hastaExcluido?: boolean;
};

export type Meta = {
  etiqueta: string;
  unidad: string;
  verde: Intervalo[];
  amarillo: Intervalo[];
};

export type ClaveMeta =
  | "fc"
  | "pam"
  | "noradrenalina"
  | "diuresis"
  | "pafi"
  | "ph"
  | "glucemia"
  | "sodio"
  | "potasio"
  | "temperatura"
  | "sat_o2"
  | "pvc"
  | "ic"
  | "rvs";

export const METAS: Record<ClaveMeta, Meta> = {
  // FC: 60-120 / 50-59 o 121-130 / <50 o >130
  fc: {
    etiqueta: "FC",
    unidad: "lpm",
    verde: [{ desde: 60, hasta: 120 }],
    amarillo: [
      { desde: 50, hasta: 60, hastaExcluido: true },
      { desde: 120, hasta: 130, desdeExcluido: true },
    ],
  },
  // PAM: 60-80 / 55-59 o 81-90 / <55 o >90
  pam: {
    etiqueta: "PAM",
    unidad: "mmHg",
    verde: [{ desde: 60, hasta: 80 }],
    amarillo: [
      { desde: 55, hasta: 60, hastaExcluido: true },
      { desde: 80, hasta: 90, desdeExcluido: true },
    ],
  },
  // Noradrenalina: ≤0,3 γ / 0,31-0,5 γ (sugiere vasopresina) / >0,5 γ
  noradrenalina: {
    etiqueta: "Noradrenalina",
    unidad: "γ",
    verde: [{ hasta: 0.3 }],
    amarillo: [{ desde: 0.3, hasta: 0.5, desdeExcluido: true }],
  },
  // Diuresis: >1 mL/kg/h / 0,5-1 / <0,5
  diuresis: {
    etiqueta: "Diuresis",
    unidad: "mL/kg/h",
    verde: [{ desde: 1, desdeExcluido: true }],
    amarillo: [{ desde: 0.5, hasta: 1 }],
  },
  // PaFi: >330 / 300-330 / <300
  pafi: {
    etiqueta: "PaFi",
    unidad: "",
    verde: [{ desde: 330, desdeExcluido: true }],
    amarillo: [{ desde: 300, hasta: 330 }],
  },
  // pH: 7,35-7,50 / 7,30-7,34 o 7,51-7,55 / fuera de eso
  ph: {
    etiqueta: "pH",
    unidad: "",
    verde: [{ desde: 7.35, hasta: 7.5 }],
    amarillo: [
      { desde: 7.3, hasta: 7.35, hastaExcluido: true },
      { desde: 7.5, hasta: 7.55, desdeExcluido: true },
    ],
  },
  // Glucemia: 110-180 / 70-109 o 181-200 / <70 o >200
  glucemia: {
    etiqueta: "Glucemia",
    unidad: "mg/dL",
    verde: [{ desde: 110, hasta: 180 }],
    amarillo: [
      { desde: 70, hasta: 110, hastaExcluido: true },
      { desde: 180, hasta: 200, desdeExcluido: true },
    ],
  },
  // Sodio: 135-150 / 151-155 / >155 o <135
  sodio: {
    etiqueta: "Sodio",
    unidad: "mEq/L",
    verde: [{ desde: 135, hasta: 150 }],
    amarillo: [{ desde: 150, hasta: 155, desdeExcluido: true }],
  },
  // Potasio: 3,5-5,0 / 3,0-3,4 o 5,1-5,5 / fuera de eso
  potasio: {
    etiqueta: "Potasio",
    unidad: "mEq/L",
    verde: [{ desde: 3.5, hasta: 5.0 }],
    amarillo: [
      { desde: 3.0, hasta: 3.5, hastaExcluido: true },
      { desde: 5.0, hasta: 5.5, desdeExcluido: true },
    ],
  },
  // Temperatura: 36-37,5 / 35-35,9 o 37,6-38 / fuera de eso
  temperatura: {
    etiqueta: "Temperatura",
    unidad: "°C",
    verde: [{ desde: 36, hasta: 37.5 }],
    amarillo: [
      { desde: 35, hasta: 36, hastaExcluido: true },
      { desde: 37.5, hasta: 38, desdeExcluido: true },
    ],
  },
  // Saturación: >94 / 90-94 / <90 -- A VALIDAR
  sat_o2: {
    etiqueta: "Saturación",
    unidad: "%",
    verde: [{ desde: 94, desdeExcluido: true }],
    amarillo: [{ desde: 90, hasta: 94 }],
  },
  // Opcionales (monitoreo avanzado, solo si hay dato)
  // PVC 5-8 / 3-4 o 9-12 / fuera
  pvc: {
    etiqueta: "PVC",
    unidad: "cmH2O",
    verde: [{ desde: 5, hasta: 8 }],
    amarillo: [
      { desde: 3, hasta: 5, hastaExcluido: true },
      { desde: 8, hasta: 12, desdeExcluido: true },
    ],
  },
  // IC >2,4 / 2,0-2,4 / <2,0
  ic: {
    etiqueta: "IC",
    unidad: "L/min/m²",
    verde: [{ desde: 2.4, desdeExcluido: true }],
    amarillo: [{ desde: 2.0, hasta: 2.4 }],
  },
  // RVS 800-1200 / 700-799 o 1201-1400 / fuera
  rvs: {
    etiqueta: "RVS",
    unidad: "dyn·s/cm⁵",
    verde: [{ desde: 800, hasta: 1200 }],
    amarillo: [
      { desde: 700, hasta: 800, hastaExcluido: true },
      { desde: 1200, hasta: 1400, desdeExcluido: true },
    ],
  },
};

// Parámetros de monitoreo avanzado: si no hay dato, no se muestran, no
// cuentan como "fuera de meta" y no disparan alarmas.
export const METAS_AVANZADAS: ClaveMeta[] = ["pvc", "ic", "rvs"];

// ---------------------------------------------------------------------
// Score de calidad del órgano (X/4)
// ---------------------------------------------------------------------
// glucemia 110-180, Na <155, pH 7,35-7,50, PaFi >330 (todo desde
// laboratorio). "Al menos un vasopresor" se muestra APARTE, solo
// informativo, fuera del cálculo y del color (no debe empujar a iniciar
// un vasopresor innecesario); sale de la fila horaria de bombas.
export const SCORE_GLUCEMIA_DESDE = 110;
export const SCORE_GLUCEMIA_HASTA = 180;
// Alarma de hipoglucemia (roja).
export const HIPOGLUCEMIA_MENOR_A = 70;
export const SCORE_SODIO_MENOR_A = 155;
export const SCORE_PH_DESDE = 7.35;
export const SCORE_PH_HASTA = 7.5;
export const SCORE_PAFI_MAYOR_A = 330;

// ---------------------------------------------------------------------
// Frescura de datos y registros
// ---------------------------------------------------------------------
// Laboratorio con más de 6 h: gris "desactualizado".
export const HORAS_LAB_DESACTUALIZADO = 6;
// Sin registro de Mantenimiento hace más de 1 h: alarma visual.
export const MINUTOS_ALARMA_SIN_REGISTRO = 60;
// Diuresis: intervalo <30 min -> no se calcula velocidad ("intervalo corto").
export const MINUTOS_INTERVALO_CORTO = 30;
// Diuresis: si entre dos registros quedó uno anulado y el intervalo supera
// 2 h -> "intervalo largo, velocidad subestimada" en vez del número.
export const MINUTOS_INTERVALO_LARGO = 120;
// Primer registro: el procurador carga "mL de la última hora".
export const MINUTOS_PRIMER_REGISTRO = 60;
// Dosis de las bombas: salen de la última fila horaria (o del último
// "cambié la velocidad"); pasados estos minutos sin dato nuevo, las
// alarmas de dosis se marcan "dato desactualizado".
export const MINUTOS_DOSIS_DESACTUALIZADA = 70;
// Mini tendencia: últimos N registros por parámetro.
export const REGISTROS_TENDENCIA = 6;

// ---------------------------------------------------------------------
// Evaluación de volemia ("¿Responde a volumen?")
// ---------------------------------------------------------------------
// Variables dinámicas (pesan más en la sugerencia). Una variable es
// "positiva" (sugiere respuesta a volumen) si supera su umbral.
// El spec da rangos (ΔVS >10-15%, vena cava >12-18%): se toma el borde
// inferior como umbral -- PROPUESTO, A VALIDAR; editable acá.
export const UMBRALES_VOLEMIA = {
  delta_pp: { etiqueta: "Δ variabilidad de pulso (ΔPP)", umbralMayorA: 13, unidad: "%" },
  delta_vs: { etiqueta: "Δ volumen sistólico (ΔVS)", umbralMayorA: 10, unidad: "%" },
  resultado_pasivo_miembros: { etiqueta: "Elevación pasiva de miembros", umbralMayorOIgualA: 10, unidad: "% del VS o GC" },
  indice_vena_cava: { etiqueta: "Índice de vena cava", umbralMayorA: 12, unidad: "%" },
  // El spec la lista como variable dinámica pero no da referencia: se
  // muestra si se cargó, pero NO cuenta como positiva hasta definirla.
  delta_co2_espirado: { etiqueta: "Δ CO2 espirado", umbralMayorA: null, unidad: "%" },
} as const;

// ---------------------------------------------------------------------
// Hemodinamia derivada
// ---------------------------------------------------------------------
// RVS = 80 × (PAM − PVC) / GC
export const FACTOR_RVS = 80;
// IC = GC / superficie corporal; superficie corporal por Mosteller
// (√(peso kg × talla cm / 3600)) -- PROPUESTO, A VALIDAR (el spec no
// nombra la fórmula).

// ---------------------------------------------------------------------
// Diabetes insípida
// ---------------------------------------------------------------------
// Sospecha (amarillo): diuresis >3 mL/kg/h durante 2 h seguidas (2
// registros consecutivos que entre los dos cubren ≥2 h) con sodio >145 o
// hipotensión.
export const DI_SOSPECHA_DIURESIS_ML_KG_H = 3;
export const DI_SOSPECHA_MINUTOS_SEGUIDOS = 120;
// Probable (rojo): diuresis >4 mL/kg/h (o >300 mL/h) y osm urinaria <300
// o densidad ≤1005, y sodio >145 u osm sérica >300.
export const DI_PROBABLE_DIURESIS_ML_KG_H = 4;
export const DI_PROBABLE_DIURESIS_ML_H = 300;
export const DI_OSM_URINARIA_MENOR_A = 300;
export const DI_DENSIDAD_MENOR_O_IGUAL_A = 1005;
export const DI_SODIO_MAYOR_A = 145;
export const DI_OSM_SERICA_MAYOR_A = 300;

// "Hipotensión" para las reglas (DI e hipotensión): PAM por debajo del
// verde (<60). "Inestabilidad hemodinámica" (DI): mismo criterio.
// PROPUESTO, A VALIDAR (el spec no define el número).
export const HIPOTENSION_PAM_MENOR_A = 60;

// ---------------------------------------------------------------------
// Disparadores de las sugerencias -- PROPUESTO, A VALIDAR
// ---------------------------------------------------------------------
// El spec nombra las situaciones (HTA + taquicardia, bradicardia...) pero
// no los números que las disparan. Se usan los bordes del verde:
export const HTA_PAM_MAYOR_A = 80; // PAM sobre el verde
export const TAQUICARDIA_FC_MAYOR_A = 120; // FC sobre el verde
export const BRADICARDIA_FC_MENOR_A = 60; // FC bajo el verde
export const HIPERNATREMIA_SODIO_MAYOR_A = 150; // sodio sobre el verde
// IC (medido o calculado) bajo el cual NO se sugiere tratar la tormenta
// adrenérgica: se muestra "ecocardiograma antes de tratar".
export const IC_NO_BETABLOQUEAR_MENOR_A = 2.4;
// Noradrenalina sobre la cual se sugiere asociar vasopresina (spec).
export const NORADRENALINA_ASOCIAR_VASOPRESINA_MAYOR_A = 0.3;

// ---------------------------------------------------------------------
// Dosis de referencia (texto de las sugerencias, tal cual el spec)
// ---------------------------------------------------------------------
export const DOSIS = {
  esmolol: "esmolol 50-300 mcg/kg/min",
  noradrenalina: "noradrenalina 0,05-0,3 γ",
  vasopresinaHemodinamia: "vasopresina 0,01-0,04 U/min",
  isoproterenol: "isoproterenol 2-10 mcg/min",
  dopaminaBradicardia: "dopamina 3-10 γ",
  amiodarona: "amiodarona (150 mg en 10 min, luego 1 mg/min x 6 h y 0,5 mg/min)",
  dobutamina: "dobutamina 5-10 γ (hasta 20)",
  desmopresinaDI: "desmopresina 1-4 mcg IV cada 6-8 h",
  vasopresinaDI: "vasopresina 0,5-2,4 U/h",
} as const;

// ---------------------------------------------------------------------
// Drogas titulables: unidad de dosis y de concentración
// ---------------------------------------------------------------------
export type Droga =
  | "noradrenalina"
  | "adrenalina"
  | "dopamina"
  | "dobutamina"
  | "isoproterenol"
  | "esmolol"
  | "amiodarona"
  | "vasopresina"
  | "desmopresina"
  | "furosemida"
  | "insulina"
  | "potasio"
  | "bicarbonato"
  | "hidrocortisona"
  | "dexametasona";

// Por minuto (gammas y similares) o por hora (furosemida, insulina,
// potasio, bicarbonato: dosis = mL/h × concentración, sin /60).
export type UnidadDosis = "mcg/kg/min" | "mcg/min" | "mg/min" | "U/min" | "mg/h" | "U/h" | "mEq/h";

export const DROGAS_INFUSION: Record<Exclude<Droga, "desmopresina">, { etiqueta: string; unidadDosis: UnidadDosis }> = {
  noradrenalina: { etiqueta: "Noradrenalina", unidadDosis: "mcg/kg/min" },
  adrenalina: { etiqueta: "Adrenalina", unidadDosis: "mcg/kg/min" },
  dopamina: { etiqueta: "Dopamina", unidadDosis: "mcg/kg/min" },
  dobutamina: { etiqueta: "Dobutamina", unidadDosis: "mcg/kg/min" },
  esmolol: { etiqueta: "Esmolol", unidadDosis: "mcg/kg/min" },
  isoproterenol: { etiqueta: "Isoproterenol", unidadDosis: "mcg/min" },
  amiodarona: { etiqueta: "Amiodarona", unidadDosis: "mg/min" },
  // Vasopresina NO va en gammas: U/min (y se muestra también U/h).
  vasopresina: { etiqueta: "Vasopresina", unidadDosis: "U/min" },
  // Bombas de la planilla de enfermería (OP2): dosis por hora.
  furosemida: { etiqueta: "Furosemida", unidadDosis: "mg/h" },
  insulina: { etiqueta: "Insulina", unidadDosis: "U/h" },
  potasio: { etiqueta: "Potasio", unidadDosis: "mEq/h" },
  bicarbonato: { etiqueta: "Bicarbonato", unidadDosis: "mEq/h" },
  // Corticoides en bomba: mg/h -- A VALIDAR.
  hidrocortisona: { etiqueta: "Hidrocortisona", unidadDosis: "mg/h" },
  dexametasona: { etiqueta: "Dexametasona", unidadDosis: "mg/h" },
};

export type DrogaInfusion = Exclude<Droga, "desmopresina">;

// Drogas que cuentan para el ítem informativo "al menos un vasopresor"
// (FUERA del score y del color). Ni dopamina ni dobutamina: la dopamina
// de 3-10 γ que se sugiere para bradicardia no actúa como vasopresor y
// marcaría "tiene vasopresor" sin tenerlo.
export const VASOPRESORES: Droga[] = ["noradrenalina", "adrenalina", "vasopresina"];

// Bolos: solapa aparte, con hora y dosis, FUERA del balance.
// Unidades -- A VALIDAR.
export const BOLOS = {
  furosemida: { etiqueta: "Furosemida", unidad: "mg" },
  desmopresina: { etiqueta: "Desmopresina", unidad: "mcg" },
  esmolol: { etiqueta: "Esmolol", unidad: "mg" },
  vasopresina: { etiqueta: "Vasopresina", unidad: "U" },
} as const;
export type DrogaBolo = keyof typeof BOLOS;

// Modo por defecto de cada droga al agregarla: estas van como bolo; el
// resto, como bomba. Cada administración se puede marcar en el otro modo
// si la droga lo admite (bolo: solo las de BOLOS).
export const MODO_POR_DEFECTO_BOLO: Droga[] = ["furosemida", "desmopresina", "esmolol"];

// Preset rápido de noradrenalina: "2 ampollas en 100 mL". El mg por
// ampolla viene precargado pero se PIDE y se confirma siempre (depende
// de la presentación).
export const PRESET_NORADRENALINA = {
  ampollas: 2,
  contenidoPorAmpolla: 4,
  unidadContenido: "mg" as const,
  volumenFinalMl: 100,
  aviso: "Verificá el mg por ampolla de tu presentación.",
};

// ---------------------------------------------------------------------
// Rangos de plausibilidad (NO bloqueantes: fuera de rango se pide
// "¿seguro?" antes de guardar). Los marcados del spec son los ejemplos de
// la usuaria; el resto es PROPUESTO, A VALIDAR.
// ---------------------------------------------------------------------
export const RANGOS_PLAUSIBLES: Record<string, { min: number; max: number }> = {
  // del spec
  na: { min: 100, max: 200 },
  pam: { min: 20, max: 250 },
  fc: { min: 20, max: 250 },
  temperatura: { min: 30, max: 42 },
  glucemia: { min: 20, max: 1000 },
  ph: { min: 6.8, max: 7.8 },
  // PROPUESTO, A VALIDAR
  k: { min: 1, max: 10 },
  pao2: { min: 20, max: 700 },
  hb: { min: 2, max: 25 },
  fio2: { min: 21, max: 100 },
  sat_o2: { min: 40, max: 100 },
  peep: { min: 0, max: 30 },
  volumen_corriente: { min: 50, max: 1500 },
  diuresis_ml: { min: 0, max: 3000 },
  ingresos_ml: { min: 0, max: 10000 },
  egresos_ml: { min: 0, max: 10000 },
  osm_urinaria: { min: 30, max: 1500 },
  osm_serica: { min: 200, max: 450 },
  densidad_urinaria: { min: 1000, max: 1050 },
  pvc: { min: -5, max: 40 },
  gc: { min: 0.5, max: 20 },
  ic_medido: { min: 0.3, max: 10 },
  sat_venosa: { min: 10, max: 100 },
  // Planilla de enfermería -- PROPUESTO, A VALIDAR
  ing_sol_medio_ml: { min: 0, max: 3000 },
  ing_sol_09_ml: { min: 0, max: 3000 },
  ing_ringer_ml: { min: 0, max: 3000 },
  ing_dextrosa_ml: { min: 0, max: 3000 },
  ing_hemoderivados_ml: { min: 0, max: 3000 },
  egr_sng_drenajes_ml: { min: 0, max: 3000 },
  perdidas_insensibles_ml: { min: 0, max: 300 },
};

// ---------------------------------------------------------------------
// Planilla de enfermería (OP2, grilla horaria) -- vista de Enfermería
// ---------------------------------------------------------------------
// Pérdidas insensibles por hora, por peso:
//   peso_kg × 10 / 24 × (1 + 0,10 × max(0, T − 37))   (mL/h)
// Sin descuento por hipotermia. Sin peso no se calcula.
// REFERENCIA GENERAL, A VALIDAR.
export const PERDIDAS_INSENSIBLES = { mlPorKgPorDia: 10, aumentoPorGrado: 0.1, temperaturaBase: 37 } as const;

// Líquidos de la fila horaria: se carga la cantidad en mL. Hemoderivados
// NO se precargan de la hora anterior (una transfusión no se repite).
export const LIQUIDOS_ENFERMERIA = [
  { campo: "ing_sol_09_ml", etiqueta: "Solución 0,9 %", precarga: true },
  { campo: "ing_ringer_ml", etiqueta: "Ringer lactato", precarga: true },
  { campo: "ing_sol_medio_ml", etiqueta: "Solución al medio (0,45 %)", precarga: true },
  { campo: "ing_dextrosa_ml", etiqueta: "Dextrosa", precarga: true },
  { campo: "ing_hemoderivados_ml", etiqueta: "Hemoderivados", precarga: false },
] as const;

// Botones rápidos de volumen (mL).
export const BOTONES_RAPIDOS_ML = [100, 250, 500] as const;

// Bombas de la fila horaria (médico y enfermería ven y cargan las
// mismas). Bicarbonato queda afuera de la interfaz (la base lo conserva).
export const BOMBAS_ENFERMERIA: DrogaInfusion[] = [
  "noradrenalina",
  "vasopresina",
  "dobutamina",
  "dopamina",
  "potasio",
  "insulina",
  "hidrocortisona",
  "dexametasona",
  "adrenalina",
  "isoproterenol",
  "amiodarona",
  "esmolol",
  "furosemida",
];

// Paso de los botones +/− de las bombas (mL/h) -- PROPUESTO, A VALIDAR.
export const PASO_BOMBA_ML_H = 1;

// Solución de la dilución (botones del seteo de cada bomba).
export const SOLUCIONES_DILUCION = [
  { valor: "dextrosa_5", etiqueta: "Dextrosa 5 %" },
  { valor: "sf_09", etiqueta: "Suero 0,9 %" },
  { valor: "otra", etiqueta: "Otra" },
] as const;
export type SolucionDilucion = (typeof SOLUCIONES_DILUCION)[number]["valor"];

// Rangos plausibles del seteo de cada bomba y de la dosis resultante --
// A VALIDAR. NO bloquean: fuera de rango se pide "¿seguro?". Con valores
// dentro de rango no se muestra nada extra.
//   ampolla: contenido por ampolla, en la unidad del seteo (mg; U para
//            vasopresina e insulina; mEq para potasio y bicarbonato)
//   dosis:   en la unidad de dosis de la droga (γ = mcg/kg/min)
// Cantidad de ampollas y volumen de dilución: iguales para todas.
export const RANGO_CANTIDAD_AMPOLLAS = { min: 0.5, max: 20 };
export const RANGO_VOLUMEN_DILUCION_ML = { min: 10, max: 1000 };
export const RANGOS_SETEO_BOMBA: Record<DrogaInfusion, { ampolla: { min: number; max: number }; dosis: { min: number; max: number } }> = {
  noradrenalina: { ampolla: { min: 1, max: 8 }, dosis: { min: 0.01, max: 1 } },
  adrenalina: { ampolla: { min: 0.5, max: 5 }, dosis: { min: 0.01, max: 1 } },
  dopamina: { ampolla: { min: 50, max: 400 }, dosis: { min: 1, max: 20 } },
  dobutamina: { ampolla: { min: 100, max: 500 }, dosis: { min: 1, max: 20 } },
  isoproterenol: { ampolla: { min: 0.1, max: 1 }, dosis: { min: 0.5, max: 20 } },
  esmolol: { ampolla: { min: 10, max: 2500 }, dosis: { min: 10, max: 300 } },
  amiodarona: { ampolla: { min: 50, max: 300 }, dosis: { min: 0.1, max: 2 } },
  vasopresina: { ampolla: { min: 10, max: 40 }, dosis: { min: 0.005, max: 0.1 } },
  furosemida: { ampolla: { min: 10, max: 250 }, dosis: { min: 1, max: 40 } },
  insulina: { ampolla: { min: 10, max: 1000 }, dosis: { min: 0.5, max: 20 } },
  potasio: { ampolla: { min: 5, max: 40 }, dosis: { min: 1, max: 20 } },
  bicarbonato: { ampolla: { min: 10, max: 100 }, dosis: { min: 1, max: 50 } },
  hidrocortisona: { ampolla: { min: 50, max: 500 }, dosis: { min: 1, max: 20 } },
  dexametasona: { ampolla: { min: 2, max: 20 }, dosis: { min: 0.1, max: 5 } },
};

// Alarma "hora sin cargar": una hora sin fila pasados estos minutos de su
// inicio (la hora en curso cuenta desde hh:15).
export const MINUTOS_HORA_SIN_CARGAR = 15;
