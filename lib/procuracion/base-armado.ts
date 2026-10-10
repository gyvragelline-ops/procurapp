// Base operativa: de las filas crudas de la base a los insumos de cada
// donante (mismo criterio que la pantalla del procurador). Lógica pura,
// con tests. También define la "fuente" de datos de la Base, para poder
// usar la base real o los datos simulados del modo demo sin cambiar la UI.

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
    fotosJudiciales: f.fotosJudiciales,
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
export type EstudioExpediente = { id: string; tipo_estudio: string; descripcion: string | null; archivo_url: string | null; created_at: string };
export type FotoJudicial = { tipo: string; created_at: string; cargado_por_rol: string | null };
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
};

export type CambiosSolicitud = Partial<Pick<Solicitud, "estado" | "respuesta" | "respondida_por" | "respondida_en" | "completed_at" | "anulado">>;

// Lo que la Base lee y escribe. La base real (base-datos.ts) o el modo
// demo en memoria (base-demo.ts): la pantalla no distingue.
export interface FuenteBase {
  demo: boolean;
  cargarTablero(): Promise<{ insumos: InsumosTablero[]; avisos: string[] }>;
  cargarExpediente(donanteId: string): Promise<ExpedienteDatos>;
  crearSolicitud(donanteId: string, datos: NuevaSolicitud): Promise<Solicitud>;
  cambiarSolicitud(id: string, cambios: CambiosSolicitud): Promise<void>;
  enviarMensaje(donanteId: string, datos: { rol: RolChat; autor: string | null; texto: string }): Promise<MensajeCaso>;
  registrarEnLinea(donanteId: string, texto: string): Promise<void>;
  cambiarEstadoProtocolo(donanteId: string, estado: "activo" | "cerrado", textoLinea: string): Promise<void>;
}
