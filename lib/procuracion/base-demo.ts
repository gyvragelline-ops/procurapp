// DATOS SIMULADOS — SOLO PARA TESTS Y PARA EL MODO DEMO LOCAL DE /base.
// Nada de esto se escribe en la base de datos. Todos los momentos son
// relativos a `ahora`, para que los escenarios no venzan.

import type { DatosEtapas } from "./estado-etapas.ts";
import type { InsumosTablero, DonanteTablero, EquipoTablero } from "./base-tablero.ts";
import type { Solicitud } from "./base-solicitudes.ts";
import type { FuentesExpediente } from "./base-expediente.ts";
import type { DatosExportacion, DonanteExportacion } from "./base-exportar.ts";

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

export type DonanteSimulado = InsumosTablero & { donante: DonanteExportacion & DonanteTablero; fuentes: FuentesExpediente; exportacion: DatosExportacion };

function armar(
  donante: DonanteExportacion,
  etapas: Partial<DatosEtapas>,
  fuentes: FuentesExpediente,
  solicitudes: Solicitud[],
  equipos: (EquipoTablero & { creado_en: string })[]
): DonanteSimulado {
  const e: DatosEtapas = {
    ...datosEtapasVacios(donante.tipo_procuracion ?? "multiorganico"),
    ...etapas,
    donante: { servicio: "UTI", pd_numero: donante.pd_numero, fecha_ingreso: donante.fecha_ingreso, tipo_procuracion: donante.tipo_procuracion },
  };
  const momentosMantenimiento = [
    ...fuentes.registros.filter((r) => !r.anulado).map((r) => r.registrado_en),
    ...fuentes.mediciones.filter((r) => !r.anulado).map((r) => r.registrado_en),
    ...fuentes.respirador.filter((r) => !r.anulado).map((r) => r.registrado_en),
  ];
  return {
    donante,
    etapas: e,
    momentosMantenimiento,
    solicitudes,
    equipos,
    fuentes,
    exportacion: {
      donante,
      fuentes,
      cultivos: [],
      estudios: [],
      horariosQx: e.horariosQx,
      equipos,
      muestras: [],
      corazonCandidato: null,
    },
  };
}

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
      institucion: "Hospital Simulado",
      localidad: "La Plata",
      created_at: iso(ahora, minutosProtocolo),
      fecha_ingreso: iso(ahora, minutosProtocolo + 600),
      procurador_nombre: "Procurador simulado",
      ...extra,
    });

  // 1) Pedido URGENTE sin respuesta hace 45 min (bloquea). Mantenimiento al día.
  const a = armar(
    base("sim-a", "000101", 300),
    { muestras: [{ obtenida: true }, { obtenida: false }] },
    { ...fuentesVacias(), registros: [registroDemo("a-r1", iso(ahora, 20), { fc: 90, pam: 72, temperatura: 36.4 })] as never },
    [solicitudDemo("a-s1", "sim-a", ahora, { titulo: "Ecocardiograma", prioridad: "urgente", created_at: iso(ahora, 45) })],
    []
  );
  // 2) Mantenimiento sin datos hace 2 h 10 min (bloquea).
  const b = armar(
    base("sim-b", "000102", 900),
    {},
    { ...fuentesVacias(), registros: [registroDemo("b-r1", iso(ahora, 130), { fc: 110, pam: 61 })] as never },
    [],
    []
  );
  // 3) Quirófano en 5 h, equipos avisados, todo al día.
  const c = armar(
    base("sim-c", "000103", 1500),
    { horariosQx: [{ id: "c-q1", hora: iso(ahora, -300), registrado_en: iso(ahora, 60), anulado: false }] },
    { ...fuentesVacias(), registros: [registroDemo("c-r1", iso(ahora, 30), { fc: 80, pam: 75 })] as never },
    [],
    [
      { equipo: "Hígado Hospital Simulado", organos: ["higado"], organo_otro: null, anulado: false, creado_en: iso(ahora, 50) },
      { equipo: "Riñón Simulado", organos: ["rinones"], organo_otro: null, anulado: false, creado_en: iso(ahora, 40) },
    ]
  );
  // 4) Pedido normal abierto sin respuesta; 10 h en protocolo.
  const d = armar(
    base("sim-d", "000104", 600),
    {},
    { ...fuentesVacias(), registros: [registroDemo("d-r1", iso(ahora, 15), { fc: 85, pam: 70 })] as never },
    [solicitudDemo("d-s1", "sim-d", ahora, { titulo: "Foto del DNI", created_at: iso(ahora, 90) })],
    []
  );
  // 5) 3 h en protocolo y Mantenimiento nunca iniciado (aviso ámbar, no rojo).
  const e = armar(base("sim-e", "000105", 180), {}, fuentesVacias(), [], []);
  // Cerrado: no cuenta como activo.
  const f = armar(base("sim-f", "000106", 3000, { estado_general: "cerrado" }), {}, fuentesVacias(), [], []);
  return [a, b, c, d, e, f];
}
