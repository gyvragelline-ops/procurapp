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
import { PLANILLA_MEDIDAS } from "./medidas-campos";
import { crearEquipo, guardarHoraQuirofano } from "./quirofano";
import { subirFotoDocumentacion } from "./subir-foto-doc";
import type { Iniciales } from "./base-iniciales";
import type { Familiar } from "./base-expediente-etapas";

// Base operativa: acceso a datos. Lee las MISMAS tablas que el resto de la
// app (no duplica datos). Escrituras con guardarConReintento: si fallan,
// tiran con el mensaje para mostrar. Sin borrado: se anula.
//
// ATENCIÓN: sin login ni RLS todavía. NO usar con donantes reales.

// Sin nombre_completo ni dni: la Base muestra iniciales (las calcula el
// servidor, /api/base/iniciales). Nombre y DNI se piden solo al exportar
// "con nombre y DNI (uso interno)" (cargarIdentidad).
const COLS_DONANTE =
  "id, pd_numero, folio_numero, edad, sexo, peso, talla, grupo_sanguineo, institucion, localidad, servicio, cama, fecha_nacimiento, fecha_ingreso, me_hora, causa_muerte, estado_general, tipo_procuracion, created_at";
// Columnas de SQL recientes: si alguna todavía no existe, se carga sin ella.
const COLS_OPCIONALES = ["procurador_nombre", "antecedentes", "es_prueba"] as const;
const SQL_DE_COLUMNA: Record<string, string> = { procurador_nombre: "handoff/base_operativa.sql", antecedentes: "handoff/antecedentes.sql", es_prueba: "handoff/es_prueba.sql" };
const avisoColumnas = (faltan: string[]) => `Falta aplicar SQL: ${faltan.map((c) => `donantes.${c} (${SQL_DE_COLUMNA[c]})`).join(", ")}. Se muestra lo que hay.`;
const AVISO_INICIALES = "No se pudieron cargar las iniciales: se muestra «—».";
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

// Columna que falta, según el error de PostgREST ("column donantes.x does
// not exist"); null si el error es otro.
export function columnaFaltante(mensaje: string): string | null {
  return /column \w+\.(\w+) does not exist/.exec(mensaje)?.[1] ?? null;
}

async function cargarDonantes(supabase: SupabaseClient, filtro: { activos: true } | { id: string }): Promise<{ donantes: DonanteFila[]; faltan: string[] }> {
  const consulta = (cols: string) => {
    const q = supabase.from("donantes").select(cols);
    return "id" in filtro ? q.eq("id", filtro.id) : q.or("estado_general.is.null,estado_general.neq.cerrado").order("created_at");
  };
  const opcionales: string[] = [...COLS_OPCIONALES];
  for (;;) {
    const r = await consulta([COLS_DONANTE, ...opcionales].join(", "));
    if (!r.error) {
      const donantes = ((r.data as unknown as DonanteFila[]) ?? []).map((d) => ({ procurador_nombre: null, antecedentes: null, es_prueba: false, ...d, nombre_completo: null, dni: null }));
      return { donantes, faltan: COLS_OPCIONALES.filter((c) => !opcionales.includes(c)) };
    }
    const falta = columnaFaltante(r.error.message);
    if (!falta || !opcionales.includes(falta)) throw new Error(`No se pudieron cargar los donantes: ${r.error.message}`);
    opcionales.splice(opcionales.indexOf(falta), 1);
  }
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
    supabase.from("documentacion_fotos").select("donante_id, tipo").in("donante_id", ids).in("tipo", ["precario", "autorizacion_juez", "dni", "grupo_factor"]),
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

// iniciales: lo inyecta la pantalla (pedirIniciales, al servidor); sin él
// las iniciales quedan "—".
export function fuenteSupabase(supabase: SupabaseClient, opciones: { iniciales?: (ids: string[]) => Promise<Iniciales> } = {}): FuenteBase {
  async function conIniciales(ids: string[]): Promise<{ ini: Iniciales; aviso: string | null }> {
    try {
      return { ini: opciones.iniciales ? await opciones.iniciales(ids) : { donantes: {}, familiares: {} }, aviso: null };
    } catch {
      return { ini: { donantes: {}, familiares: {} }, aviso: AVISO_INICIALES };
    }
  }
  return {

    async cargarTablero() {
      const { donantes, faltan } = await cargarDonantes(supabase, { activos: true });
      const ids = donantes.map((d) => d.id);
      const [{ filas, sinColumnas: b }, { ini, aviso }] = await Promise.all([cargarFilas(supabase, ids), conIniciales(ids)]);
      const insumos: InsumosTablero[] = donantes.map((d) => armarInsumos({ ...d, iniciales: ini.donantes[d.id] ?? null } as DonanteTablero & DonanteFila, filas.get(d.id)!));
      return { insumos, avisos: [...(faltan.length ? [avisoColumnas(faltan)] : []), ...(b ? [AVISO_SQL] : []), ...(aviso ? [aviso] : [])] };
    },

    async cargarExpediente(donanteId) {
      const { donantes } = await cargarDonantes(supabase, { id: donanteId });
      const encontrado = donantes[0];
      if (!encontrado) throw new Error("No se encontró el donante.");
      const { ini } = await conIniciales([donanteId]);
      const donante = { ...encontrado, iniciales: ini.donantes[donanteId] ?? null };
      const [{ filas }, mant, lab, cultivos, equipos, estudios, fotos, linea, mensajes, muestras, planillas, certAux, familiar, analisis, config, antibioticos, revisiones, autorizacion, organosAcept, comunicaciones] = await Promise.all([
        cargarFilas(supabase, [donanteId]),
        cargarMantenimiento(supabase, donanteId),
        cargarLaboratorioValores(supabase, donanteId),
        cargarCultivos(supabase, donanteId),
        cargarEquipos(supabase, donanteId),
        cargarEstudiosImagenes(supabase, donanteId),
        supabase.from("documentacion_fotos").select("tipo, created_at, cargado_por_rol, archivo_url").eq("donante_id", donanteId),
        supabase.from("timeline_eventos").select("id, ocurrido_en, texto").eq("donante_id", donanteId).order("ocurrido_en", { ascending: false }).limit(200),
        cargarMensajes(supabase, donanteId),
        supabase.from("muestras").select("paquete_key, nombre, obtenida, retirada").eq("donante_id", donanteId),
        supabase.from("planilla_valores").select("planilla_key, campo_pdf, valor").eq("donante_id", donanteId).in("planilla_key", ["neuro", "certificado", "doppler", PLANILLA_MEDIDAS]),
        supabase.from("documentacion_estado").select("item_key, estado, meta").eq("donante_id", donanteId).eq("categoria", "certificacion"),
        supabase.from("familiares").select("parentesco, direccion, telefono").eq("donante_id", donanteId).limit(1).maybeSingle(),
        supabase.from("comunicacion_donacion_analisis").select("id, texto, etapa_detectada, created_at").eq("donante_id", donanteId).order("created_at", { ascending: false }),
        supabase.from("mantenimiento_config").select("corazon_candidato, pulmon_candidato, monitoreo_avanzado_activo, updated_at").eq("donante_id", donanteId).maybeSingle(),
        // tabla nueva: si el SQL no se aplicó, la Base sigue (sin antibióticos)
        supabase.from("antibioticos").select("id, antibiotico, desde, foco, creado_en, anulado").eq("donante_id", donanteId).order("desde", { ascending: false }),
        // marcas de la Base (tablas de handoff/base_acciones.sql)
        supabase.from("base_revisiones").select("id, seccion, revisado_por, revisado_en, anulado").eq("donante_id", donanteId),
        supabase.from("autorizacion_judicial").select("id, autorizado, marcado_por, marcado_en, anulado").eq("donante_id", donanteId),
        supabase.from("organos_aceptados").select("id, organo, aceptado, equipo_id, marcado_por, marcado_en, anulado").eq("donante_id", donanteId),
        supabase.from("documentacion_estado").select("categoria, estado, updated_at, meta").eq("donante_id", donanteId).in("categoria", ["comMuerte", "comDonacion"]).eq("item_key", "realizada"),
      ]);
      falla([fotos, linea, muestras, planillas, certAux, familiar, analisis, config, comunicaciones], "el expediente");
      const regCom = (c: string) => (((comunicaciones.data as { categoria: string; estado: string | null; updated_at: string | null; meta: unknown }[]) ?? []).find((r) => r.categoria === c) ?? null);
      const porPlanilla = (k: string) =>
        Object.fromEntries(((planillas.data as { planilla_key: string; campo_pdf: string; valor: string | null }[]) ?? []).filter((r) => r.planilla_key === k).map((r) => [r.campo_pdf, r.valor]));
      const todasLasFotos = (fotos.data as (ExpedienteDatos["fotosDocumentacion"][number])[]) ?? [];
      const insumos = armarInsumos(donante as DonanteTablero & DonanteFila, filas.get(donanteId)!);
      const datos: ExpedienteDatos = {
        insumos,
        donante,
        fuentes: {
          registros: mant.registros as never,
          mediciones: mant.mediciones,
          respirador: mant.respirador,
          lab: lab as never,
          bombas: mant.bombas,
          infusiones: mant.infusiones,
          pesoKg: donante.peso,
          config: (config.data as ExpedienteDatos["fuentes"]["config"]) ?? null,
        },
        cultivos,
        estudios,
        fotosJudiciales: todasLasFotos.filter((f) => f.tipo === "precario" || f.tipo === "autorizacion_juez"),
        equipos,
        muestras: (muestras.data as ExpedienteDatos["muestras"]) ?? [],
        corazonCandidato: mant.config?.corazon_candidato ?? null,
        linea: (linea.data as ExpedienteDatos["linea"]) ?? [],
        mensajes,
        planillas: { neuro: porPlanilla("neuro"), certificado: porPlanilla("certificado"), doppler: porPlanilla("doppler"), medidas: porPlanilla(PLANILLA_MEDIDAS) },
        certAux: (certAux.data as ExpedienteDatos["certAux"]) ?? [],
        familiar:
          familiar.data || ini.familiares[donanteId]
            ? { iniciales: ini.familiares[donanteId] ?? null, parentesco: null, direccion: null, telefono: null, ...((familiar.data as Omit<Familiar, "iniciales"> | null) ?? {}) }
            : null,
        analisisComunicacion: (analisis.data as ExpedienteDatos["analisisComunicacion"]) ?? [],
        fotosDocumentacion: todasLasFotos.filter((f) => f.tipo === "dni" || f.tipo === "grupo_factor"),
        antibioticos: antibioticos.error ? null : ((antibioticos.data as ExpedienteDatos["antibioticos"]) ?? []),
        revisiones: revisiones.error ? null : ((revisiones.data as ExpedienteDatos["revisiones"]) ?? []),
        autorizacionJudicial: autorizacion.error ? null : ((autorizacion.data as ExpedienteDatos["autorizacionJudicial"]) ?? []),
        organosAceptados: organosAcept.error ? null : ((organosAcept.data as ExpedienteDatos["organosAceptados"]) ?? []),
        comunicaciones: { comMuerte: regCom("comMuerte"), comDonacion: regCom("comDonacion") },
      };
      return datos;
    },

    // Solo para exportar "con nombre y DNI (uso interno)": lo pide la
    // pantalla cuando se tilda esa opción.
    async cargarIdentidad(donanteId) {
      const r = await supabase.from("donantes").select("nombre_completo, dni").eq("id", donanteId).maybeSingle();
      if (r.error) throw new Error(`No se pudo cargar nombre y DNI: ${r.error.message}`);
      return { nombre_completo: r.data?.nombre_completo ?? null, dni: r.data?.dni ?? null };
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

    async marcarRevision(donanteId, seccion, quien) {
      const r = await guardarConReintento(() => supabase.from("base_revisiones").insert({ donante_id: donanteId, seccion, revisado_por: quien }));
      if (!r.ok) throw new Error(r.mensaje);
    },

    async anularRevision(id) {
      const r = await guardarConReintento(() => supabase.from("base_revisiones").update({ anulado: true, anulado_en: new Date().toISOString() }).eq("id", id));
      if (!r.ok) throw new Error(r.mensaje);
    },

    // Cambiar la marca = anular la vigente y crear la nueva (queda el historial).
    async marcarAutorizacion(donanteId, autorizado, quien, vigenteId) {
      if (vigenteId) {
        const a = await guardarConReintento(() => supabase.from("autorizacion_judicial").update({ anulado: true, anulado_en: new Date().toISOString() }).eq("id", vigenteId));
        if (!a.ok) throw new Error(a.mensaje);
      }
      const r = await guardarConReintento(() => supabase.from("autorizacion_judicial").insert({ donante_id: donanteId, autorizado, marcado_por: quien }));
      if (!r.ok) throw new Error(r.mensaje);
    },

    async marcarOrgano(donanteId, organo, aceptado, equipoId, quien, vigenteId) {
      if (vigenteId) {
        const a = await guardarConReintento(() => supabase.from("organos_aceptados").update({ anulado: true, anulado_en: new Date().toISOString() }).eq("id", vigenteId));
        if (!a.ok) throw new Error(a.mensaje);
      }
      const r = await guardarConReintento(() => supabase.from("organos_aceptados").insert({ donante_id: donanteId, organo, aceptado, equipo_id: equipoId, marcado_por: quien }));
      if (!r.ok) throw new Error(r.mensaje);
    },

    async crearEquipo(donanteId, datos) {
      await crearEquipo(supabase, donanteId, datos);
    },

    async guardarHoraQuirofano(donanteId, horaIso) {
      await guardarHoraQuirofano(supabase, donanteId, horaIso);
    },

    async subirFotoJudicial(donanteId, archivo) {
      await subirFotoDocumentacion(supabase, donanteId, "autorizacion_juez", archivo, "base");
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
