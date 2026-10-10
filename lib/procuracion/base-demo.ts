// DATOS SIMULADOS — SOLO PARA TESTS Y PARA EL MODO DEMO LOCAL DE /base.
// Nada de esto se escribe en la base de datos. Todos los momentos son
// relativos a `ahora`, para que los escenarios no venzan.

import type { DatosEtapas } from "./estado-etapas.ts";
import type { InsumosTablero, DonanteTablero } from "./base-tablero.ts";
import type { Solicitud } from "./base-solicitudes.ts";
import type { FuentesExpediente } from "./base-expediente.ts";
import type { DatosExportacion, DonanteExportacion } from "./base-exportar.ts";
import type { ExpedienteDatos, FuenteBase } from "./base-armado.ts";
import type { MarcaEtapa } from "./marca-etapa.ts";
import type { Cultivo } from "./cultivos-calculos.ts";
import type { EquipoQuirofano } from "./quirofano-calculos.ts";
import type { MensajeCaso } from "./chat-calculos.ts";

const MIN = 60_000;
const iso = (ahora: number, minutosAtras: number) => new Date(ahora - minutosAtras * MIN).toISOString();

export function datosEtapasVacios(tipo: "multiorganico" | "corneas" = "multiorganico"): DatosEtapas {
  return {
    donante: { servicio: null, pd_numero: null, fecha_ingreso: null, tipo_procuracion: tipo },
    judicialAplica: false,
    meCampos: {},
    certAuxCampos: {},
    comMuerteRealizada: false,
    comDonacionRealizada: false,
    labImagenesCompleto: false,
    medidasCompleto: false,
    mantenimientoCompleto: false,
    muestras: [],
    cultivos: [],
    horariosQx: [],
    fotosJudiciales: [],
    etapasGuardadas: {},
    marcas: {},
  };
}

export function donanteDemo(id: string, ahora: number, extra: Partial<DonanteExportacion> = {}): DonanteExportacion {
  return {
    id,
    pd_numero: null,
    folio_numero: null,
    nombre_completo: null,
    dni: null,
    edad: null,
    sexo: null,
    peso: null,
    talla: null,
    grupo_sanguineo: null,
    institucion: null,
    localidad: null,
    estado_general: "activo",
    tipo_procuracion: "multiorganico",
    created_at: iso(ahora, 60),
    fecha_ingreso: null,
    me_hora: null,
    causa_muerte: null,
    antecedentes: null,
    procurador_nombre: null,
    ...extra,
  };
}

export function solicitudDemo(id: string, donanteId: string, ahora: number, extra: Partial<Solicitud> = {}): Solicitud {
  return {
    id,
    donante_id: donanteId,
    titulo: "Pedido",
    detalle: null,
    origen: "base",
    destino: "procurador",
    organo_key: null,
    estado: "pendiente",
    prioridad: "normal",
    pedido_por: null,
    respuesta: null,
    respondida_por: null,
    respondida_en: null,
    created_at: iso(ahora, 10),
    completed_at: null,
    anulado: false,
    ...extra,
  };
}

// Fila horaria de enfermería con todas las columnas (null las no dadas).
export function registroDemo(id: string, en: string, campos: Record<string, number | null> = {}) {
  return {
    id,
    registrado_en: en,
    anulado: false,
    temperatura: null,
    diuresis_ml: null,
    egr_sng_drenajes_ml: null,
    perdidas_insensibles_ml: null,
    perdidas_insensibles_editadas: false,
    ing_sol_09_ml: null,
    ing_ringer_ml: null,
    ing_sol_medio_ml: null,
    ing_dextrosa_ml: null,
    ing_hemoderivados_ml: null,
    ...campos,
  };
}

export function fuentesVacias(): FuentesExpediente {
  return { registros: [], mediciones: [], respirador: [], lab: [], bombas: [], infusiones: [], pesoKg: null };
}

export type DonanteSimulado = InsumosTablero & {
  donante: DonanteExportacion & DonanteTablero & { servicio: string | null };
  fuentes: FuentesExpediente;
  exportacion: DatosExportacion;
  expediente: ExpedienteDatos;
};

type Extras = Partial<Omit<ExpedienteDatos, "insumos" | "donante" | "fuentes">>;

function armar(
  donante: DonanteExportacion,
  etapas: Partial<DatosEtapas>,
  fuentes: FuentesExpediente,
  solicitudes: Solicitud[],
  extras: Extras = {}
): DonanteSimulado {
  const d = { ...donante, servicio: "UTI" };
  const e: DatosEtapas = {
    ...datosEtapasVacios(donante.tipo_procuracion ?? "multiorganico"),
    ...etapas,
    donante: { servicio: d.servicio, pd_numero: donante.pd_numero, fecha_ingreso: donante.fecha_ingreso, tipo_procuracion: donante.tipo_procuracion },
  };
  const momentosMantenimiento = [
    ...fuentes.registros.filter((r) => !r.anulado).map((r) => r.registrado_en),
    ...fuentes.mediciones.filter((r) => !r.anulado).map((r) => r.registrado_en),
    ...fuentes.respirador.filter((r) => !r.anulado).map((r) => r.registrado_en),
  ];
  const equipos = extras.equipos ?? [];
  const insumos: InsumosTablero = { donante: d, etapas: e, momentosMantenimiento, solicitudes, equipos };
  const expediente: ExpedienteDatos = {
    insumos,
    donante: d,
    fuentes,
    cultivos: extras.cultivos ?? [],
    estudios: extras.estudios ?? [],
    fotosJudiciales: extras.fotosJudiciales ?? [],
    equipos,
    muestras: extras.muestras ?? [],
    corazonCandidato: extras.corazonCandidato ?? null,
    linea: extras.linea ?? [],
    mensajes: extras.mensajes ?? [],
    planillas: extras.planillas ?? { neuro: {}, certificado: {}, doppler: {}, medidas: {} },
    certAux: extras.certAux ?? [],
    familiar: extras.familiar ?? null,
    analisisComunicacion: extras.analisisComunicacion ?? [],
    fotosDocumentacion: extras.fotosDocumentacion ?? [],
  };
  return {
    ...insumos,
    donante: d,
    fuentes,
    expediente,
    exportacion: {
      donante: d,
      fuentes,
      cultivos: expediente.cultivos,
      estudios: expediente.estudios,
      horariosQx: e.horariosQx,
      equipos,
      muestras: expediente.muestras,
      corazonCandidato: expediente.corazonCandidato,
    },
  };
}

// ------------------------------------------------- generadores de series
const redondeo = (n: number, dec = 0) => Number(n.toFixed(dec));

// Filas de enfermería cada hora, desde `desdeMin` hasta `hastaMin` atrás.
function serieEnfermeria(pref: string, ahora: number, desdeMin: number, hastaMin: number, v: (i: number) => Record<string, number | null>) {
  const filas = [];
  for (let m = hastaMin, k = 0; m <= desdeMin; m += 60, k++) filas.push({ m, k });
  return filas.reverse().map(({ m }, i) => registroDemo(`${pref}-r${i}`, iso(ahora, m), v(i)));
}

function tomaLab(pref: string, ahora: number, minutos: number, valores: Record<string, number>) {
  return Object.entries(valores).map(([parametro, valor], i) => ({
    id: `${pref}-l${minutos}-${i}`,
    toma_id: `${pref}-t${minutos}`,
    parametro,
    valor,
    valor_texto: null,
    unidad: null,
    medido_en: iso(ahora, minutos),
    anulado: false,
    origen: "laboratorio" as const,
  }));
}

const respiradorDemo = (pref: string, ahora: number, minutos: number) => ({
  id: `${pref}-v1`,
  registrado_en: iso(ahora, minutos),
  modo: "VCV" as const,
  modo_otro: null,
  fio2: 40,
  peep: 8,
  volumen_corriente: 450,
  frecuencia: 14,
  presion_plateau: 22,
  presion_pico: 28,
  anulado: false,
});

function noradrenalina(pref: string, ahora: number, registros: { id: string }[], desdeMin: number, velocidad: (i: number) => number) {
  const infusion = {
    id: `${pref}-i1`,
    registrado_en: iso(ahora, desdeMin + 5),
    droga: "noradrenalina" as const,
    tipo: "infusion" as const,
    ampollas: 4,
    contenido_por_ampolla: 4,
    unidad_contenido: "mg" as const,
    volumen_final_ml: 250,
    velocidad_ml_h: velocidad(0),
    dosis_calculada: null,
    unidad_dosis: null,
    motivo: "inicio" as const,
    anulado: false,
  };
  const bombas = registros.map((r, i) => ({ id: `${pref}-b${i}`, registro_id: r.id, droga: "noradrenalina" as const, velocidad_ml_h: velocidad(i), dilucion_id: infusion.id, anulado: false }));
  return { infusiones: [infusion], bombas };
}

function boloDemo(id: string, ahora: number, droga: "furosemida" | "desmopresina" | "esmolol" | "vasopresina", dosis: number, min: number) {
  return { id, registrado_en: iso(ahora, min), droga, tipo: "bolo" as const, ampollas: null, contenido_por_ampolla: null, unidad_contenido: null, volumen_final_ml: null, velocidad_ml_h: null, dosis_calculada: dosis, unidad_dosis: null, anulado: false };
}

// Examen neurológico simulado completo (todos los reflejos ausentes, apnea).
function neuroDemo(): Record<string, string | null> {
  const c: Record<string, string | null> = {
    fecha_examen: "10/10/2026",
    hora_1a: "08:00",
    hora_2a: "14:00",
    ta_tam_1a: "75",
    ta_tam_2a: "72",
    t_central_1a: "36,5",
    t_central_2a: "36,4",
    diabetes_insipida_1a_no: "si",
    diabetes_insipida_2a_si: "si",
    pupilas_1a: "midriáticas arreactivas",
    pupilas_2a: "midriáticas arreactivas",
    tipo_test_confirmacion: "apnea",
    apneica1_pco2_inicial: "40",
    apneica1_pco2_final: "65",
    apneica1_duracion: "8 min",
    apneica1_resultado: "positiva",
    causa_coma: "ACV hemorrágico (simulado)",
    arm_fecha_hs: "09/10/2026 22:00",
    estudios_complementarios: "TAC de cerebro (simulado)",
    cumple_me_si: "si",
    eeg1_fecha: "10/10/2026",
    eeg1_hora: "10:00",
    eeg1_informe: "Silencio eléctrico cerebral (simulado)",
  };
  for (const k of ["fotomotor", "corneano", "oculocefalico", "oculovestibular", "nauseoso", "deglutorio", "maseterino", "dolor", "osteotendinosos", "plantar", "cremasteriano", "cutaneoabdominal"])
    for (const m of ["1a", "2a"]) c[`reflejo_${k}_${m}`] = "ausente";
  return c;
}

const MARCABLES = ["potencial", "me", "certificacion", "comMuerte", "comDonacion", "muestras", "medidas", "labImagenes", "cultivos", "documentacion", "mantenimiento", "judicial", "quirofano"];
const completas = (n: number): Record<string, MarcaEtapa> => Object.fromEntries(MARCABLES.slice(0, n).map((k) => [k, { marca: "completo" as const, en: null }]));

const MUESTRAS = [
  ["hla", "HLA"],
  ["lab", "Laboratorio"],
  ["hemocultivo", "Hemocultivo"],
  ["urocultivo", "Urocultivo"],
  ["serologia", "Serología"],
  ["preablacion", "Laboratorio pre-ablación"],
  ["grupors", "Grupo sanguíneo y factor RH"],
  ["covid", "Hisopado COVID"],
] as const;
const muestrasDemo = (obtenidas: number) => MUESTRAS.map(([paquete_key, nombre], i) => ({ paquete_key, nombre, obtenida: i < obtenidas, retirada: false }));

function cultivo(id: string, ahora: number, tipo: Cultivo["tipo"], tomadoMin: number, estado: Cultivo["estado"], extra: Partial<Cultivo> = {}): Cultivo {
  return { id, tipo, tipo_otro: null, tomado_en: iso(ahora, tomadoMin), estado, germen: null, sensibilidad: null, resultado_en: null, modificado_en: null, anulado: false, ...extra };
}

function equipo(id: string, ahora: number, nombre: string, organos: EquipoQuirofano["organos"], anestesista: EquipoQuirofano["anestesista"], min: number): EquipoQuirofano {
  return { id, equipo: nombre, organos, organo_otro: null, anestesista, informado_por: "Base", medio: "telefono", creado_en: iso(ahora, min), modificado_en: null, anulado: false };
}

const mensaje = (id: string, ahora: number, rol: MensajeCaso["rol"], autor: string | null, texto: string, min: number): MensajeCaso => ({ id, rol, autor, texto, creado_en: iso(ahora, min), anulado: false });
const evento = (id: string, ahora: number, texto: string, min: number) => ({ id, ocurrido_en: iso(ahora, min), texto });

// 5 protocolos activos en simultáneo + 1 cerrado.
export function donantesSimulados(ahora: number): DonanteSimulado[] {
  const base = (id: string, pd: string, minutosProtocolo: number, extra: Partial<DonanteExportacion> = {}) =>
    donanteDemo(id, ahora, {
      pd_numero: pd,
      folio_numero: `F-${pd}`,
      nombre_completo: "Nombre Simulado",
      dni: `DNI-${pd}`,
      edad: 40,
      sexo: "masculino",
      peso: 75,
      talla: 175,
      grupo_sanguineo: "0+",
      institucion: "Hospital Simulado A",
      localidad: "La Plata",
      created_at: iso(ahora, minutosProtocolo),
      fecha_ingreso: iso(ahora, minutosProtocolo + 600),
      causa_muerte: "ACV hemorrágico (simulado)",
      procurador_nombre: "Procurador simulado",
      ...extra,
    });

  // 1) Pedido URGENTE sin respuesta hace 45 min (bloquea). Mantenimiento al día.
  const regA = serieEnfermeria("a", ahora, 12 * 60 + 20, 20, (i) => ({
    fc: 112 - i * 2,
    pam: redondeo(70 - 4 * Math.sin(i / 2)),
    temperatura: redondeo(36.8 - i * 0.05, 1),
    sat_o2: 96 - (i % 3),
    diuresis_ml: 120 - i * 6,
    ing_sol_09_ml: 100,
  }));
  const a = armar(
    base("sim-a", "000101", 14 * 60, { nombre_completo: "Sofía Alvarez", sexo: "femenino", edad: 29, peso: 62, procurador_nombre: "Dra. Ruiz (simulado)", antecedentes: "Hipertensión arterial en tratamiento.\nTabaquista 10 paquetes/año (simulado)." }),
    { marcas: completas(8), muestras: [{ obtenida: true }, { obtenida: false }], cultivos: [{ estado: "pendiente", anulado: false }, { estado: "pendiente", anulado: false }] },
    {
      ...fuentesVacias(),
      pesoKg: 62,
      registros: regA as never,
      respirador: [respiradorDemo("a", ahora, 8 * 60)],
      lab: [
        ...tomaLab("a", ahora, 7 * 60, { na: 148, k: 3.9, glucemia: 170, hb: 10.4, plaquetas: 172000, creatinina: 1.1, urea: 38, tgo: 45, tgp: 38, ph: 7.38, pao2: 150, fio2: 40 }),
        ...tomaLab("a", ahora, 60, { na: 152, k: 3.6, glucemia: 128, hb: 10.2, ph: 7.41, pao2: 140, fio2: 40 }),
        // troponina: el procurador eligió ng/L (la unidad tiene que verse siempre)
        { ...tomaLab("a", ahora, 3 * 60, { troponina: 45 })[0], unidad: "ng/L" },
        { ...tomaLab("a", ahora, 6 * 60, { cpk_mb: 3.1 })[0], unidad: "ng/mL" },
      ] as never,
      ...(() => {
        const n = noradrenalina("a", ahora, regA, 12 * 60 + 20, (i) => (i < 6 ? 6 : 15));
        return { ...n, infusiones: [...n.infusiones, boloDemo("a-bo1", ahora, "furosemida", 20, 4 * 60), boloDemo("a-bo2", ahora, "desmopresina", 1, 2 * 60)] };
      })(),
      config: { corazon_candidato: "sin_definir", pulmon_candidato: "si", monitoreo_avanzado_activo: false, updated_at: iso(ahora, 9 * 60) },
    },
    [solicitudDemo("a-s1", "sim-a", ahora, { titulo: "Ecocardiograma", prioridad: "urgente", created_at: iso(ahora, 45), destino: "procurador", pedido_por: "Base (simulado)" })],
    {
      planillas: { neuro: neuroDemo(), certificado: { medico1_nombre: "Dr. Simulado Uno", medico2_nombre: "Dra. Simulada Dos", archivo_lugar: "Archivo UTI (simulado)" }, doppler: { fecha_dia: "10", fecha_mes: "10", fecha_anio: "2026", fecha_hora_top: "09:30", interpretacion_resto: "Patrón de reverberación (simulado)" }, medidas: { l_esternal: "18", p_axilar: "92", p_xif: "85", p_umbilic: "80", biliaco: "27", xifopubiano: "38", d_ventral: "21", femur: "44" } },
      certAux: [
        { item_key: "eeg", estado: "completo", meta: {} },
        { item_key: "doppler_transcraneano", estado: "completo", meta: {} },
        { item_key: "potenciales_evocados", estado: "no_corresponde", meta: {} },
        { item_key: "angiografia_cerebral", estado: "pendiente", meta: {} },
      ],
      familiar: { nombre: "Familiar Simulado", dni: "DNI-FAM-0001", parentesco: "Hermana", direccion: "Calle Simulada 123", telefono: "000-000-0000" },
      analisisComunicacion: [{ id: "a-ca1", texto: "La familia pregunta si puede despedirse antes del quirófano (simulado).", etapa_detectada: 2, created_at: iso(ahora, 5 * 60) }],
      fotosDocumentacion: [
        { tipo: "dni", created_at: iso(ahora, 11 * 60), cargado_por_rol: "procurador", archivo_url: null },
        { tipo: "grupo_factor", created_at: iso(ahora, 10 * 60), cargado_por_rol: "procurador", archivo_url: null },
      ],
      cultivos: [
        cultivo("a-c1", ahora, "aspirado_traqueal", 8 * 60, "pendiente"),
        cultivo("a-c2", ahora, "hemocultivo", 8 * 60 - 5, "pendiente"),
        cultivo("a-c3", ahora, "urocultivo", 16 * 60, "negativo", { resultado_en: iso(ahora, 3 * 60) }),
      ],
      estudios: [
        { id: "a-e1", tipo_estudio: "ECG", descripcion: "Ritmo sinusal (simulado)", archivo_url: null, created_at: iso(ahora, 7 * 60) },
        { id: "a-e2", tipo_estudio: "Rx_torax", descripcion: null, archivo_url: null, created_at: iso(ahora, 6 * 60 + 50) },
      ],
      muestras: muestrasDemo(5),
      corazonCandidato: "sin_definir",
      linea: [
        evento("a-t1", ahora, "Solicitud urgente: Ecocardiograma", 45),
        evento("a-t2", ahora, "Registro de enfermería cargado", 20),
        evento("a-t3", ahora, "ECG cargado", 7 * 60),
      ],
      mensajes: [
        mensaje("a-m1", ahora, "base", "Base (simulado)", "¿Se puede pedir el ecocardiograma?", 44),
        mensaje("a-m2", ahora, "procurador", "Dra. Ruiz (simulado)", "Lo pido al cardiólogo de guardia.", 30),
      ],
    }
  );

  // 2) Mantenimiento sin datos hace 2 h 10 min (bloquea).
  const regB = serieEnfermeria("b", ahora, 14 * 60 + 10, 130, (i) => ({ fc: 98 + i, pam: 74 - i, temperatura: 36.1, sat_o2: 95, diuresis_ml: 90 - i * 5, ing_sol_09_ml: 120 }));
  const b = armar(
    base("sim-b", "000102", 58 * 60, { nombre_completo: "Mario Ríos", edad: 54, peso: 70, institucion: "Hospital Simulado C", procurador_nombre: "Dr. García (simulado)" }),
    { marcas: completas(10), muestras: [{ obtenida: true }] },
    { ...fuentesVacias(), pesoKg: 70, registros: regB as never, lab: tomaLab("b", ahora, 7 * 60, { na: 155, k: 4.1, glucemia: 160, creatinina: 1.2 }) as never },
    [],
    { muestras: muestrasDemo(8), linea: [evento("b-t1", ahora, "Registro de enfermería cargado", 130)] }
  );

  // 3) Quirófano en 5 h, equipos avisados, intervención judicial en curso.
  const regC = serieEnfermeria("c", ahora, 12 * 60 + 30, 30, (i) => ({ fc: 80 + (i % 4), pam: 75, temperatura: 36.5, sat_o2: 97, diuresis_ml: 100, ing_sol_09_ml: 80 }));
  const c = armar(
    base("sim-c", "000103", 25 * 60, { nombre_completo: "Nora Sosa", sexo: "femenino", edad: 38, peso: 64, institucion: "Hospital Simulado B" }),
    {
      marcas: completas(11),
      judicialAplica: true,
      fotosJudiciales: [{ tipo: "precario" }],
      horariosQx: [{ id: "c-q1", hora: iso(ahora, -300), registrado_en: iso(ahora, 60), anulado: false }],
    },
    {
      ...fuentesVacias(),
      pesoKg: 64,
      registros: regC as never,
      mediciones: [
        { id: "c-m1", registrado_en: iso(ahora, 3 * 60), disfuncion_miocardica: false, anulado: false, pvc: 8, gc: 5.2, ic_medido: 3.1, sat_venosa: 72, delta_pp: 9, delta_vs: 8, delta_co2_espirado: 4, indice_vena_cava: 10, resultado_pasivo_miembros: 6 },
      ],
      respirador: [respiradorDemo("c", ahora, 10 * 60)],
      lab: tomaLab("c", ahora, 2 * 60, { na: 144, k: 4.0, glucemia: 140, troponina: 0.04, cpk_mb: 3.2, tgo: 30, tgp: 28, bili_total: 0.8, rin: 1.1 }) as never,
    },
    [],
    {
      equipos: [
        equipo("c-q1", ahora, "Hígado Hospital Simulado", ["higado"], "sin_confirmar", 50),
        equipo("c-q2", ahora, "Riñón Simulado", ["rinones"], "si", 40),
      ],
      fotosJudiciales: [{ tipo: "precario", created_at: iso(ahora, 70), cargado_por_rol: "procurador" }],
      estudios: [{ id: "c-e1", tipo_estudio: "Ecocardiograma", descripcion: "FEVI conservada (simulado)", archivo_url: null, created_at: iso(ahora, 5 * 60) }],
      muestras: muestrasDemo(8),
      corazonCandidato: "si",
      linea: [evento("c-t1", ahora, "Hora de quirófano cargada", 60), evento("c-t2", ahora, "Foto del precario cargada", 70)],
    }
  );

  // 4) Pedido normal abierto sin respuesta; 10 h en protocolo.
  const regD = serieEnfermeria("d", ahora, 8 * 60 + 15, 15, (i) => ({ fc: 85, pam: 70 + (i % 2), temperatura: 36.3, sat_o2: 98, diuresis_ml: 110, ing_sol_09_ml: 100 }));
  const d = armar(
    base("sim-d", "000104", 10 * 60, { nombre_completo: "Juan Cruz", edad: 67, peso: 78, procurador_nombre: "Dr. Pérez (simulado)" }),
    { marcas: completas(5), muestras: [{ obtenida: true }, { obtenida: false }, { obtenida: false }] },
    {
      ...fuentesVacias(),
      pesoKg: 78,
      registros: regD as never,
      // bomba de insulina cargada sin dilución: se ven los mL/h, sin dosis
      bombas: [{ id: "d-b1", registro_id: regD[regD.length - 1].id, droga: "insulina", velocidad_ml_h: 3, dilucion_id: null, anulado: false }],
    },
    [solicitudDemo("d-s1", "sim-d", ahora, { titulo: "Foto del DNI", created_at: iso(ahora, 90), pedido_por: "Base (simulado)" })],
    { muestras: muestrasDemo(1) }
  );

  // 5) 3 h en protocolo y Mantenimiento nunca iniciado (aviso ámbar, no rojo).
  const e = armar(base("sim-e", "000105", 180, { nombre_completo: "Rita Gómez", sexo: "femenino", edad: 71, peso: 60, institucion: "Hospital Simulado B" }), { marcas: completas(2) }, fuentesVacias(), []);
  // Cerrado: no cuenta como activo.
  const f = armar(base("sim-f", "000106", 3000, { nombre_completo: "Pedro Luna", estado_general: "cerrado" }), {}, fuentesVacias(), []);
  return [a, b, c, d, e, f];
}

// ------------------------------------------------------------ modo demo
// Fuente en memoria para /base?demo=1 (solo en desarrollo): lo que se
// "guarda" vive en esta pestaña y se pierde al recargar. Nunca toca la base.
export function crearFuenteDemo(ahora: number): FuenteBase {
  const sims = donantesSimulados(ahora);
  const porId = new Map(sims.map((s) => [s.donante.id, s]));
  let n = 0;
  const nuevoId = (p: string) => `${p}-demo-${++n}`;
  const ahoraIso = () => new Date().toISOString();
  const sim = (id: string) => {
    const s = porId.get(id);
    if (!s) throw new Error("No se encontró el donante (demo).");
    return s;
  };
  const anotar = (id: string, texto: string) => sim(id).expediente.linea.unshift({ id: nuevoId("t"), ocurrido_en: ahoraIso(), texto });
  return {
    demo: true,
    async cargarTablero() {
      return { insumos: sims.filter((s) => s.donante.estado_general !== "cerrado").map((s) => ({ ...s, solicitudes: [...s.solicitudes] })), avisos: [] };
    },
    async cargarExpediente(id) {
      const s = sim(id);
      return { ...s.expediente, insumos: { ...s.expediente.insumos, solicitudes: [...s.solicitudes] }, linea: [...s.expediente.linea], mensajes: [...s.expediente.mensajes] };
    },
    async crearSolicitud(id, datos) {
      const nueva = solicitudDemo(nuevoId("s"), id, Date.now(), { ...datos, created_at: ahoraIso() });
      sim(id).solicitudes.push(nueva);
      anotar(id, `Solicitud: ${datos.titulo}`);
      return nueva;
    },
    async cambiarSolicitud(solId, cambios) {
      for (const s of sims) {
        const i = s.solicitudes.findIndex((x) => x.id === solId);
        if (i >= 0) s.solicitudes[i] = { ...s.solicitudes[i], ...cambios };
      }
    },
    async enviarMensaje(id, datos) {
      const m = { id: nuevoId("m"), ...datos, creado_en: ahoraIso(), anulado: false };
      sim(id).expediente.mensajes.push(m);
      return m;
    },
    async registrarEnLinea(id, texto) {
      anotar(id, texto);
    },
    async cambiarEstadoProtocolo(id, estado, texto) {
      sim(id).donante.estado_general = estado;
      anotar(id, texto);
    },
  };
}
