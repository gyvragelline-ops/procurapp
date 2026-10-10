import type { SupabaseClient } from "@supabase/supabase-js";
import { guardarConReintento } from "./guardar";
import { ME_CAMPO_KEYS } from "./constants";
import { armarInsumos, filasVacias, type CambiosSolicitud, type ExpedienteDatos, type FilasDonante, type FuenteBase } from "./base-armado";
import type { DonanteTablero, InsumosTablero } from "./base-tablero";
import type { Solicitud } from "./base-solicitudes";
import type { DonanteExportacion } from "./base-exportar";
import { cargarMantenimiento } from "./mantenimiento";
import { cargarLaboratorioValores } from "./laboratorio-valores";
import { cargarCultivos } from "./cultivos";
import { cargarEquipos } from "./quirofano";
import { cargarEstudiosImagenes } from "./estudios-imagenes";
import { cargarMensajes, enviarMensaje } from "./chat";

// Base operativa: acceso a datos. Lee las MISMAS tablas que el resto de la
// app (no duplica datos). Escrituras con guardarConReintento: si fallan,
// tiran con el mensaje para mostrar. Sin borrado: se anula.
//
// ATENCIÓN: sin login ni RLS todavía. NO usar con donantes reales.

const COLS_DONANTE =
  "id, pd_numero, folio_numero, nombre_completo, dni, edad, sexo, peso, talla, grupo_sanguineo, institucion, localidad, servicio, fecha_ingreso, me_hora, causa_muerte, estado_general, tipo_procuracion, created_at";
const CATEGORIAS_ESTADO = ["judicial", "certificacion", "comMuerte", "comDonacion", "labImagenes", "medidas", "mantenimiento"];
const AVISO_SQL = "Falta aplicar el SQL de la Base operativa (handoff/base_operativa.sql): se muestra lo que hay.";

type DonanteFila = DonanteExportacion & { servicio: string | null };

const grupo = <T extends { donante_id: string }>(rows: T[] | null | undefined) => {
  const m = new Map<string, T[]>();
  for (const r of rows ?? []) m.set(r.donante_id, [...(m.get(r.donante_id) ?? []), r]);
  return m;
};

function falla(res: { error: { message: string } | null }[], que: string) {
  const e = res.find((r) => r.error)?.error;
  if (e) throw new Error(`No se pudo cargar ${que}: ${e.message}`);
}

// Solicitud con las columnas nuevas aunque el SQL todavía no esté aplicado.
function normalizarSolicitud(r: Record<string, unknown>): Solicitud {
  return {
    detalle: null,
    prioridad: "normal",
    pedido_por: null,
    respuesta: null,
    respondida_por: null,
    respondida_en: null,
    anulado: false,
    ...(r as Partial<Solicitud>),
  } as Solicitud;
}

async function cargarDonantes(supabase: SupabaseClient, filtro: { activos: true } | { id: string }): Promise<{ donantes: DonanteFila[]; sinColumnas: boolean }> {
  const consulta = (cols: string) => {
    const q = supabase.from("donantes").select(cols);
    return "id" in filtro ? q.eq("id", filtro.id) : q.or("estado_general.is.null,estado_general.neq.cerrado").order("created_at");
  };
  const con = await consulta(`${COLS_DONANTE}, procurador_nombre`);
  if (!con.error) return { donantes: (con.data as unknown as DonanteFila[]) ?? [], sinColumnas: false };
  const sin = await consulta(COLS_DONANTE);
  if (sin.error) throw new Error(`No se pudieron cargar los donantes: ${sin.error.message}`);
  return { donantes: ((sin.data as unknown as DonanteFila[]) ?? []).map((d) => ({ ...d, procurador_nombre: null })), sinColumnas: true };
}

async function cargarFilas(supabase: SupabaseClient, ids: string[]): Promise<{ filas: Map<string, FilasDonante>; sinColumnas: boolean }> {
  const filas = new Map(ids.map((id) => [id, filasVacias()]));
  if (!ids.length) return { filas, sinColumnas: false };
  let sinColumnas = false;

  let etapas = await supabase.from("etapas_estado").select("donante_id, etapa_key, estado, marcado_manual, marcado_en").in("donante_id", ids);
  if (etapas.error) {
    sinColumnas = true;
    etapas = (await supabase.from("etapas_estado").select("donante_id, etapa_key, estado").in("donante_id", ids)) as typeof etapas;
  }
  const sondaSolicitudes = await supabase.from("solicitudes").select("prioridad, respuesta, anulado").limit(1);
  if (sondaSolicitudes.error) sinColumnas = true;

  const [doc, neuro, mue, cul, hor, fot, reg, med, resp, sol, eqs] = await Promise.all([
    supabase.from("documentacion_estado").select("donante_id, categoria, item_key, estado").in("donante_id", ids).in("categoria", CATEGORIAS_ESTADO),
    supabase.from("planilla_valores").select("donante_id, campo_pdf, valor").in("donante_id", ids).eq("planilla_key", "neuro").in("campo_pdf", ME_CAMPO_KEYS),
    supabase.from("muestras").select("donante_id, obtenida").in("donante_id", ids),
    supabase.from("cultivos").select("donante_id, estado, anulado").in("donante_id", ids),
    supabase.from("quirofano_horarios").select("donante_id, id, hora, registrado_en, anulado").in("donante_id", ids),
    supabase.from("documentacion_fotos").select("donante_id, tipo").in("donante_id", ids).in("tipo", ["precario", "autorizacion_juez"]),
    supabase.from("mantenimiento_registros").select("donante_id, registrado_en").in("donante_id", ids).eq("anulado", false),
    supabase.from("mantenimiento_medico").select("donante_id, registrado_en").in("donante_id", ids).eq("anulado", false),
    supabase.from("mantenimiento_respirador").select("donante_id, registrado_en").in("donante_id", ids).eq("anulado", false),
    supabase.from("solicitudes").select("*").in("donante_id", ids).order("created_at"),
    supabase.from("quirofano_equipos").select("donante_id, equipo, organos, organo_otro, anulado").in("donante_id", ids),
  ]);
  falla([etapas, doc, neuro, mue, cul, hor, fot, reg, med, resp, sol, eqs], "el estado de los protocolos");

  const g = {
    etapas: grupo(etapas.data as never),
    doc: grupo(doc.data as never),
    neuro: grupo(neuro.data as never),
    mue: grupo(mue.data as never),
    cul: grupo(cul.data as never),
    hor: grupo(hor.data as never),
    fot: grupo(fot.data as never),
    mom: grupo([...(reg.data ?? []), ...(med.data ?? []), ...(resp.data ?? [])] as { donante_id: string; registrado_en: string }[]),
    sol: grupo(sol.data as never),
    eqs: grupo(eqs.data as never),
  };
  for (const id of ids) {
    filas.set(id, {
      etapas: (g.etapas.get(id) ?? []) as unknown as FilasDonante["etapas"],
      documentacion: (g.doc.get(id) ?? []) as unknown as FilasDonante["documentacion"],
      planillaNeuro: (g.neuro.get(id) ?? []) as unknown as FilasDonante["planillaNeuro"],
      muestras: (g.mue.get(id) ?? []) as unknown as FilasDonante["muestras"],
      cultivos: (g.cul.get(id) ?? []) as unknown as FilasDonante["cultivos"],
      horariosQx: (g.hor.get(id) ?? []) as unknown as FilasDonante["horariosQx"],
      fotosJudiciales: (g.fot.get(id) ?? []) as unknown as FilasDonante["fotosJudiciales"],
      momentosMantenimiento: (g.mom.get(id) ?? []).map((r) => r.registrado_en),
      solicitudes: ((g.sol.get(id) ?? []) as unknown as Record<string, unknown>[]).map(normalizarSolicitud),
      equipos: (g.eqs.get(id) ?? []) as unknown as FilasDonante["equipos"],
    });
  }
  return { filas, sinColumnas };
}

export function fuenteSupabase(supabase: SupabaseClient): FuenteBase {
  return {
    demo: false,

    async cargarTablero() {
      const { donantes, sinColumnas: a } = await cargarDonantes(supabase, { activos: true });
      const { filas, sinColumnas: b } = await cargarFilas(supabase, donantes.map((d) => d.id));
      const insumos: InsumosTablero[] = donantes.map((d) => armarInsumos(d as DonanteTablero & DonanteFila, filas.get(d.id)!));
      return { insumos, avisos: a || b ? [AVISO_SQL] : [] };
    },

    async cargarExpediente(donanteId) {
      const { donantes } = await cargarDonantes(supabase, { id: donanteId });
      const donante = donantes[0];
      if (!donante) throw new Error("No se encontró el donante.");
      const [{ filas }, mant, lab, cultivos, equipos, estudios, fotos, linea, mensajes, muestras] = await Promise.all([
        cargarFilas(supabase, [donanteId]),
        cargarMantenimiento(supabase, donanteId),
        cargarLaboratorioValores(supabase, donanteId),
        cargarCultivos(supabase, donanteId),
        cargarEquipos(supabase, donanteId),
        cargarEstudiosImagenes(supabase, donanteId),
        supabase.from("documentacion_fotos").select("tipo, created_at, cargado_por_rol").eq("donante_id", donanteId).in("tipo", ["precario", "autorizacion_juez"]),
        supabase.from("timeline_eventos").select("id, ocurrido_en, texto").eq("donante_id", donanteId).order("ocurrido_en", { ascending: false }).limit(200),
        cargarMensajes(supabase, donanteId),
        supabase.from("muestras").select("paquete_key, nombre, obtenida, retirada").eq("donante_id", donanteId),
      ]);
      falla([fotos, linea, muestras], "el expediente");
      const insumos = armarInsumos(donante as DonanteTablero & DonanteFila, filas.get(donanteId)!);
      const datos: ExpedienteDatos = {
        insumos,
        donante,
        fuentes: { registros: mant.registros as never, mediciones: mant.mediciones, respirador: mant.respirador, lab: lab as never, bombas: mant.bombas, infusiones: mant.infusiones, pesoKg: donante.peso },
        cultivos,
        estudios,
        fotosJudiciales: (fotos.data as ExpedienteDatos["fotosJudiciales"]) ?? [],
        equipos,
        muestras: (muestras.data as ExpedienteDatos["muestras"]) ?? [],
        corazonCandidato: mant.config?.corazon_candidato ?? null,
        linea: (linea.data as ExpedienteDatos["linea"]) ?? [],
        mensajes,
      };
      return datos;
    },

    async crearSolicitud(donanteId, datos) {
      const r = await guardarConReintento(() => supabase.from("solicitudes").insert({ ...datos, donante_id: donanteId }).select("*").single());
      if (!r.ok) throw new Error(r.mensaje);
      return normalizarSolicitud(r.resultado.data as Record<string, unknown>);
    },

    async cambiarSolicitud(id, cambios: CambiosSolicitud) {
      const r = await guardarConReintento(() => supabase.from("solicitudes").update(cambios).eq("id", id));
      if (!r.ok) throw new Error(r.mensaje);
    },

    enviarMensaje: (donanteId, datos) => enviarMensaje(supabase, donanteId, datos),

    async registrarEnLinea(donanteId, texto) {
      const r = await guardarConReintento(() => supabase.from("timeline_eventos").insert({ donante_id: donanteId, texto }));
      if (!r.ok) throw new Error(r.mensaje);
    },

    async cambiarEstadoProtocolo(donanteId, estado, textoLinea) {
      const r = await guardarConReintento(() =>
        supabase.from("donantes").update({ estado_general: estado, updated_at: new Date().toISOString() }).eq("id", donanteId)
      );
      if (!r.ok) throw new Error(r.mensaje);
      const t = await guardarConReintento(() => supabase.from("timeline_eventos").insert({ donante_id: donanteId, texto: textoLinea }));
      if (!t.ok) throw new Error(`El protocolo cambió de estado, pero no se pudo registrar en la línea de tiempo: ${t.mensaje}`);
    },
  };
}
