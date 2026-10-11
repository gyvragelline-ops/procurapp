// Base operativa: de las filas crudas de la base a los insumos de cada
// donante (mismo criterio que la pantalla del procurador). Lógica pura,
// con tests. También define la "fuente" de datos de la Base, para poder
// la base real en la app y datos de prueba solo en los tests.

import { METODOS_CERT_AUX, type EstadoEtapa } from "./constants.ts";
import { esMarca, type MarcaEtapa } from "./marca-etapa.ts";
import type { DatosEtapas } from "./estado-etapas.ts";
import type { DonanteTablero, EquipoTablero, InsumosTablero } from "./base-tablero.ts";
import type { Solicitud, NuevaSolicitud } from "./base-solicitudes.ts";
import type { FuentesExpediente } from "./base-expediente.ts";
import type { DonanteExportacion } from "./base-exportar.ts";
import type { Cultivo } from "./cultivos-calculos.ts";
import type { HorarioQuirofano, EquipoQuirofano } from "./quirofano-calculos.ts";
import type { MensajeCaso, RolChat } from "./chat-calculos.ts";
import type { AnalisisComunicacion, Familiar, FilaCertAux } from "./base-expediente-etapas.ts";
import type { Antibiotico } from "./antibioticos-calculos.ts";
import type { MarcaJudicial, MarcaOrgano, Revision } from "./base-secciones.ts";
import type { DatosEquipo } from "./quirofano-calculos.ts";

export type FilasDonante = {
  etapas: { etapa_key: string; estado: EstadoEtapa; marcado_manual?: string | null; marcado_en?: string | null }[];
  documentacion: { categoria: string; item_key: string; estado: string | null }[];
  planillaNeuro: { campo_pdf: string; valor: string | null }[];
  muestras: { obtenida: boolean }[];
  cultivos: Pick<Cultivo, "estado" | "anulado">[];
  horariosQx: HorarioQuirofano[];
  fotosJudiciales: { tipo: string }[];
  momentosMantenimiento: string[];
  solicitudes: Solicitud[];
  equipos: EquipoTablero[];
};

export function filasVacias(): FilasDonante {
  return { etapas: [], documentacion: [], planillaNeuro: [], muestras: [], cultivos: [], horariosQx: [], fotosJudiciales: [], momentosMantenimiento: [], solicitudes: [], equipos: [] };
}

const si = (f: FilasDonante, categoria: string, item: string) => f.documentacion.some((d) => d.categoria === categoria && d.item_key === item && d.estado === "si");

export function armarDatosEtapas(
  donante: Pick<DonanteTablero, "tipo_procuracion" | "pd_numero"> & { servicio: string | null; fecha_ingreso: string | null },
  f: FilasDonante
): DatosEtapas {
  const etapasGuardadas: Record<string, EstadoEtapa> = {};
  const marcas: Record<string, MarcaEtapa> = {};
  for (const e of f.etapas) {
    etapasGuardadas[e.etapa_key] = e.estado;
    if (esMarca(e.marcado_manual)) marcas[e.etapa_key] = { marca: e.marcado_manual, en: e.marcado_en ?? null };
  }
  const certAuxCampos: Record<string, string | null> = {};
  for (const m of METODOS_CERT_AUX) certAuxCampos[m.key] = f.documentacion.find((d) => d.categoria === "certificacion" && d.item_key === m.key)?.estado ?? null;
  const meCampos: Record<string, string | null> = {};
  for (const r of f.planillaNeuro) meCampos[r.campo_pdf] = r.valor;
  return {
    donante: { servicio: donante.servicio, pd_numero: donante.pd_numero, fecha_ingreso: donante.fecha_ingreso, tipo_procuracion: donante.tipo_procuracion },
    judicialAplica: si(f, "judicial", "aplica"),
    meCampos,
    certAuxCampos,
    comMuerteRealizada: si(f, "comMuerte", "realizada"),
    comDonacionRealizada: si(f, "comDonacion", "realizada"),
    labImagenesCompleto: si(f, "labImagenes", "completo"),
    medidasCompleto: si(f, "medidas", "completo"),
    mantenimientoCompleto: si(f, "mantenimiento", "completo"),
    muestras: f.muestras,
    cultivos: f.cultivos,
    horariosQx: f.horariosQx,
    // f.fotosJudiciales trae los 4 tipos de documentacion_fotos.
    fotosJudiciales: f.fotosJudiciales.filter((x) => x.tipo === "precario" || x.tipo === "autorizacion_juez"),
    fotosDocumentacion: f.fotosJudiciales.filter((x) => x.tipo === "dni" || x.tipo === "grupo_factor"),
    etapasGuardadas,
    marcas,
  };
}

export function armarInsumos(donante: DonanteTablero & { servicio: string | null; fecha_ingreso: string | null }, f: FilasDonante): InsumosTablero {
  return {
    donante,
    etapas: armarDatosEtapas(donante, f),
    momentosMantenimiento: f.momentosMantenimiento,
    solicitudes: f.solicitudes,
    equipos: f.equipos,
  };
}

// ------------------------------------------------------- fuente de datos
export type RegistroComunicacion = { estado: string | null; updated_at: string | null; meta?: unknown };
export type EstudioExpediente = { id: string; tipo_estudio: string; descripcion: string | null; archivo_url: string | null; archivo_tipo?: "image" | "video" | null; created_at: string };
export type FotoJudicial = { tipo: string; created_at: string; cargado_por_rol: string | null; archivo_url?: string | null };
export type EventoLinea = { id: string; ocurrido_en: string; texto: string };

export type ExpedienteDatos = {
  insumos: InsumosTablero;
  donante: DonanteExportacion & { servicio: string | null };
  fuentes: FuentesExpediente;
  cultivos: Cultivo[];
  estudios: EstudioExpediente[];
  fotosJudiciales: FotoJudicial[];
  equipos: EquipoQuirofano[];
  muestras: { paquete_key: string; nombre: string; obtenida: boolean; retirada: boolean }[];
  corazonCandidato: "si" | "no" | "sin_definir" | null;
  linea: EventoLinea[];
  mensajes: MensajeCaso[];
  // Lo que cargó el procurador en cada etapa (se muestra en crudo).
  planillas: { neuro: Record<string, string | null>; certificado: Record<string, string | null>; doppler: Record<string, string | null>; medidas: Record<string, string | null> };
  certAux: FilaCertAux[];
  familiar: Familiar | null;
  analisisComunicacion: AnalisisComunicacion[];
  fotosDocumentacion: { tipo: string; created_at: string; cargado_por_rol: string | null; archivo_url: string | null }[];
  antibioticos: Antibiotico[] | null; // null: la tabla todavía no existe (SQL sin aplicar)
  // Registro real de "Realizada" de las comunicaciones (con la hora en que se registró)
  comunicaciones: { comMuerte: RegistroComunicacion | null; comDonacion: RegistroComunicacion | null };
  // Marcas de la Base (null: la tabla todavía no existe)
  revisiones: Revision[] | null;
  autorizacionJudicial: MarcaJudicial[] | null;
  organosAceptados: MarcaOrgano[] | null;
};

export type CambiosSolicitud = Partial<Pick<Solicitud, "estado" | "respuesta" | "respondida_por" | "respondida_en" | "completed_at" | "anulado">>;

// Lo que la Base lee y escribe (implementación: base-datos.ts, la base real).
export interface FuenteBase {
  cargarTablero(): Promise<{ insumos: InsumosTablero[]; avisos: string[] }>;
  cargarExpediente(donanteId: string): Promise<ExpedienteDatos>;
  // Nombre y DNI: solo para exportar "con nombre y DNI (uso interno)".
  cargarIdentidad(donanteId: string): Promise<{ nombre_completo: string | null; dni: string | null }>;
  crearSolicitud(donanteId: string, datos: NuevaSolicitud): Promise<Solicitud>;
  cambiarSolicitud(id: string, cambios: CambiosSolicitud): Promise<void>;
  enviarMensaje(donanteId: string, datos: { rol: RolChat; autor: string | null; texto: string }): Promise<MensajeCaso>;
  registrarEnLinea(donanteId: string, texto: string): Promise<void>;
  cambiarEstadoProtocolo(donanteId: string, estado: "activo" | "cerrado", textoLinea: string): Promise<void>;
  // Acciones de la Base en el Expediente (todas sin borrado: se anula)
  marcarRevision(donanteId: string, seccion: string, quien: string | null): Promise<void>;
  anularRevision(id: string): Promise<void>;
  marcarAutorizacion(donanteId: string, autorizado: boolean, quien: string | null, vigenteId: string | null): Promise<void>;
  marcarOrgano(donanteId: string, organo: string, aceptado: boolean, equipoId: string | null, quien: string | null, vigenteId: string | null): Promise<void>;
  crearEquipo(donanteId: string, datos: DatosEquipo): Promise<void>;
  guardarHoraQuirofano(donanteId: string, horaIso: string): Promise<void>;
  subirFotoJudicial(donanteId: string, archivo: File): Promise<void>;
}
