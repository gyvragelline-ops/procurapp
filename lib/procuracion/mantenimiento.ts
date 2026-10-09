import type { SupabaseClient } from "@supabase/supabase-js";
import { guardarConReintento } from "./guardar";
import type { Donante } from "./types";
import {
  columnasSolucion,
  planGuardadoBombas,
  type BombaFormulario,
  type BombaHora,
  type EventoRespirador,
  type InfusionFila,
  type MedicionMedico,
  type Solucion,
} from "./mantenimiento-calculos";

// Acceso a datos del panel de Mantenimiento (tablas de
// handoff/mantenimiento.sql). Escrituras con guardarConReintento: si
// fallan TIRAN con el mensaje para mostrar -- nunca queda como guardado
// algo que no llegó a la base. Sin borrado: se anula.

export type RegistroMantenimiento = {
  id: string;
  registrado_en: string;
  fc: number | null;
  pam: number | null;
  temperatura: number | null;
  sat_o2: number | null;
  fio2: number | null;
  peep: number | null;
  volumen_corriente: number | null;
  diuresis_ml: number | null;
  diuresis_es_ultima_hora: boolean;
  ingresos_ml: number | null;
  egresos_ml: number | null;
  osm_urinaria: number | null;
  osm_serica: number | null;
  densidad_urinaria: number | null;
  pvc: number | null;
  gc: number | null;
  ic_medido: number | null;
  sat_venosa: number | null;
  delta_pp: number | null;
  delta_vs: number | null;
  delta_co2_espirado: number | null;
  indice_vena_cava: number | null;
  resultado_pasivo_miembros: number | null;
  disfuncion_miocardica: boolean;
  // Planilla de enfermería (handoff/mantenimiento_enfermeria.sql)
  ing_sol_medio_ml: number | null;
  ing_sol_09_ml: number | null;
  ing_ringer_ml: number | null;
  ing_dextrosa_ml: number | null;
  ing_hemoderivados_ml: number | null;
  egr_sng_drenajes_ml: number | null;
  perdidas_insensibles_ml: number | null;
  perdidas_insensibles_editadas: boolean;
  egresos_incluye_diuresis: boolean;
  cargado_por: string | null;
  aviso_medico: string | null;
  anulado: boolean;
};

export type CampoNumericoRegistro = Exclude<
  keyof RegistroMantenimiento,
  | "id"
  | "registrado_en"
  | "diuresis_es_ultima_hora"
  | "disfuncion_miocardica"
  | "anulado"
  | "perdidas_insensibles_editadas"
  | "egresos_incluye_diuresis"
  | "cargado_por"
  | "aviso_medico"
  // Totales: ya no se guardan (el balance se calcula siempre); quedan
  // en la base por las filas viejas. El formulario nunca los pide.
  | "ingresos_ml"
  | "egresos_ml"
  | "perdidas_insensibles_ml"
>;

// Campos del formulario de registro, en orden. `avanzado`: solo con el
// interruptor "Monitoreo avanzado".
export const CAMPOS_REGISTRO: { campo: CampoNumericoRegistro; etiqueta: string; unidad: string; avanzado?: boolean }[] = [
  { campo: "fc", etiqueta: "FC", unidad: "lpm" },
  { campo: "pam", etiqueta: "PAM", unidad: "mmHg" },
  { campo: "temperatura", etiqueta: "Temperatura", unidad: "°C" },
  { campo: "sat_o2", etiqueta: "Sat O2", unidad: "%" },
  { campo: "fio2", etiqueta: "FiO2", unidad: "%" },
  { campo: "peep", etiqueta: "PEEP", unidad: "cmH2O" },
  { campo: "volumen_corriente", etiqueta: "Volumen corriente", unidad: "mL" },
  { campo: "diuresis_ml", etiqueta: "Diuresis", unidad: "mL" },
  { campo: "ing_sol_09_ml", etiqueta: "Solución 0,9 %", unidad: "mL" },
  { campo: "ing_ringer_ml", etiqueta: "Ringer lactato", unidad: "mL" },
  { campo: "ing_sol_medio_ml", etiqueta: "Solución al medio (0,45 %)", unidad: "mL" },
  { campo: "ing_dextrosa_ml", etiqueta: "Dextrosa", unidad: "mL" },
  { campo: "ing_hemoderivados_ml", etiqueta: "Hemoderivados", unidad: "mL" },
  { campo: "egr_sng_drenajes_ml", etiqueta: "SNG / drenajes", unidad: "mL" },
  { campo: "osm_urinaria", etiqueta: "Osmolaridad urinaria", unidad: "mOsm/kg" },
  { campo: "osm_serica", etiqueta: "Osmolaridad sérica", unidad: "mOsm/kg" },
  { campo: "densidad_urinaria", etiqueta: "Densidad urinaria", unidad: "" },
  { campo: "pvc", etiqueta: "PVC", unidad: "cmH2O", avanzado: true },
  { campo: "gc", etiqueta: "Gasto cardíaco", unidad: "L/min", avanzado: true },
  { campo: "ic_medido", etiqueta: "IC medido (si se mide directo)", unidad: "L/min/m²", avanzado: true },
  { campo: "sat_venosa", etiqueta: "Sat venosa", unidad: "%", avanzado: true },
  { campo: "delta_pp", etiqueta: "Δ variabilidad de pulso", unidad: "%", avanzado: true },
  { campo: "delta_vs", etiqueta: "Δ volumen sistólico", unidad: "%", avanzado: true },
  { campo: "delta_co2_espirado", etiqueta: "Δ CO2 espirado", unidad: "%", avanzado: true },
  { campo: "indice_vena_cava", etiqueta: "Índice de vena cava", unidad: "%", avanzado: true },
  { campo: "resultado_pasivo_miembros", etiqueta: "Elevación pasiva de miembros", unidad: "% del VS o GC", avanzado: true },
];

export type ConfigMantenimiento = {
  donante_id: string;
  monitoreo_avanzado_activo: boolean;
  corazon_candidato: "si" | "no" | "sin_definir";
  pulmon_candidato: "si" | "no" | "sin_definir";
};

export type DatosRegistro = Partial<Omit<RegistroMantenimiento, "id" | "anulado">> & { registrado_en: string };

const COLS_REGISTRO =
  "id, registrado_en, fc, pam, temperatura, sat_o2, fio2, peep, volumen_corriente, diuresis_ml, diuresis_es_ultima_hora, ingresos_ml, egresos_ml, osm_urinaria, osm_serica, densidad_urinaria, pvc, gc, ic_medido, sat_venosa, delta_pp, delta_vs, delta_co2_espirado, indice_vena_cava, resultado_pasivo_miembros, disfuncion_miocardica, ing_sol_medio_ml, ing_sol_09_ml, ing_ringer_ml, ing_dextrosa_ml, ing_hemoderivados_ml, egr_sng_drenajes_ml, perdidas_insensibles_ml, perdidas_insensibles_editadas, egresos_incluye_diuresis, cargado_por, aviso_medico, anulado";
const COLS_INFUSION =
  "id, registrado_en, droga, tipo, ampollas, contenido_por_ampolla, unidad_contenido, volumen_final_ml, velocidad_ml_h, dosis_calculada, unidad_dosis, motivo, cargado_por, solucion_dilucion, solucion_dilucion_otra, anulado";
const COLS_BOMBA = "id, registro_id, droga, velocidad_ml_h, dilucion_id, anulado";
const COLS_CONFIG = "donante_id, monitoreo_avanzado_activo, corazon_candidato, pulmon_candidato";
const COLS_RESPIRADOR =
  "id, registrado_en, modo, modo_otro, fio2, peep, volumen_corriente, frecuencia, presion_plateau, presion_pico, anulado";
const COLS_MEDICO =
  "id, registrado_en, disfuncion_miocardica, pvc, gc, ic_medido, sat_venosa, delta_pp, delta_vs, delta_co2_espirado, indice_vena_cava, resultado_pasivo_miembros, anulado";

export async function cargarMantenimiento(
  supabase: SupabaseClient,
  donanteId: string
): Promise<{
  registros: RegistroMantenimiento[];
  infusiones: InfusionFila[];
  bombas: BombaHora[];
  respirador: EventoRespirador[];
  mediciones: MedicionMedico[];
  config: ConfigMantenimiento | null;
}> {
  const [reg, inf, bom, resp, med, cfg] = await Promise.all([
    supabase.from("mantenimiento_registros").select(COLS_REGISTRO).eq("donante_id", donanteId).order("registrado_en"),
    supabase.from("mantenimiento_infusiones").select(COLS_INFUSION).eq("donante_id", donanteId).order("registrado_en"),
    supabase.from("mantenimiento_bombas_hora").select(COLS_BOMBA).eq("donante_id", donanteId),
    supabase.from("mantenimiento_respirador").select(COLS_RESPIRADOR).eq("donante_id", donanteId).order("registrado_en"),
    supabase.from("mantenimiento_medico").select(COLS_MEDICO).eq("donante_id", donanteId).order("registrado_en"),
    supabase.from("mantenimiento_config").select(COLS_CONFIG).eq("donante_id", donanteId).maybeSingle(),
  ]);
  const error = reg.error ?? inf.error ?? bom.error ?? resp.error ?? med.error ?? cfg.error;
  if (error) throw new Error(`No se pudieron cargar los datos de Mantenimiento: ${error.message}`);
  return {
    registros: (reg.data as RegistroMantenimiento[]) ?? [],
    infusiones: (inf.data as InfusionFila[]) ?? [],
    bombas: (bom.data as BombaHora[]) ?? [],
    respirador: (resp.data as EventoRespirador[]) ?? [],
    mediciones: (med.data as MedicionMedico[]) ?? [],
    config: (cfg.data as ConfigMantenimiento | null) ?? null,
  };
}

// Nuevo registro (sin id) o edición de uno existente (con id).
export async function guardarRegistro(
  supabase: SupabaseClient,
  donanteId: string,
  datos: DatosRegistro,
  id: string | null
): Promise<RegistroMantenimiento> {
  const r = await guardarConReintento(() =>
    id
      ? supabase.from("mantenimiento_registros").update(datos).eq("id", id).select(COLS_REGISTRO).single()
      : supabase.from("mantenimiento_registros").insert({ ...datos, donante_id: donanteId }).select(COLS_REGISTRO).single()
  );
  if (!r.ok) throw new Error(r.mensaje);
  return r.resultado.data as RegistroMantenimiento;
}

export async function anularRegistro(supabase: SupabaseClient, id: string): Promise<void> {
  const r = await guardarConReintento(() => supabase.from("mantenimiento_registros").update({ anulado: true }).eq("id", id));
  if (!r.ok) throw new Error(r.mensaje);
}

export type NuevaInfusion = Omit<InfusionFila, "id" | "anulado"> & {
  concentracion_calculada: number | null;
  unidad_concentracion: string | null;
  peso_usado_kg: number | null;
};

// Una fila por dilución confirmada (inicio o cambio de dilución), por
// "cambié la velocidad" o por bolo. La velocidad de cada hora NO va acá:
// va en la fila horaria (guardarBombasHora).
export async function guardarInfusion(supabase: SupabaseClient, donanteId: string, fila: NuevaInfusion): Promise<InfusionFila> {
  const r = await guardarConReintento(() =>
    supabase.from("mantenimiento_infusiones").insert({ ...fila, donante_id: donanteId }).select(COLS_INFUSION).single()
  );
  if (!r.ok) throw new Error(r.mensaje);
  return r.resultado.data as InfusionFila;
}

// Única edición permitida (por permisos de la base): marcar anulada.
export async function anularInfusion(supabase: SupabaseClient, id: string): Promise<void> {
  const r = await guardarConReintento(() => supabase.from("mantenimiento_infusiones").update({ anulado: true }).eq("id", id));
  if (!r.ok) throw new Error(r.mensaje);
}

// Bombas de UNA fila horaria: deja exactamente lo del formulario, con una
// sola bomba vigente por droga (lo exige el índice único de la base).
// Siempre relee de la base antes de planear (no confía en la pantalla);
// si otro equipo insertó la misma droga en el medio, relee y reintenta
// una vez (esa segunda vez ya actualiza en lugar de insertar).
export async function guardarBombasHora(
  supabase: SupabaseClient,
  donanteId: string,
  registroId: string,
  formulario: BombaFormulario[]
): Promise<BombaHora[]> {
  const leer = async (): Promise<BombaHora[]> => {
    const { data, error } = await supabase.from("mantenimiento_bombas_hora").select(COLS_BOMBA).eq("registro_id", registroId);
    if (error) throw new Error(`No se pudieron leer las bombas de esa hora: ${error.message}`);
    return (data as BombaHora[]) ?? [];
  };
  const aplicar = async (existentes: BombaHora[]): Promise<string | null> => {
    const plan = planGuardadoBombas(existentes, formulario);
    if (plan.anular.length) {
      const r = await guardarConReintento(() => supabase.from("mantenimiento_bombas_hora").update({ anulado: true }).in("id", plan.anular));
      if (!r.ok) throw new Error(r.mensaje);
    }
    for (const u of plan.actualizar) {
      const r = await guardarConReintento(() =>
        supabase.from("mantenimiento_bombas_hora").update({ velocidad_ml_h: u.velocidad_ml_h, dilucion_id: u.dilucion_id }).eq("id", u.id)
      );
      if (!r.ok) throw new Error(r.mensaje);
    }
    if (plan.insertar.length) {
      const filas = plan.insertar.map((b) => ({ ...b, registro_id: registroId, donante_id: donanteId }));
      const r = await guardarConReintento(() => supabase.from("mantenimiento_bombas_hora").insert(filas));
      if (!r.ok) return r.mensaje;
    }
    return null;
  };
  let fallo = await aplicar(await leer());
  if (fallo) {
    fallo = await aplicar(await leer());
    if (fallo) throw new Error(fallo);
  }
  return leer();
}

// Bomba de la fila tal como sale del formulario: si se confirmó una
// dilución nueva con el toque (arranque, reinicio o cambio de dilución),
// primero se guarda esa dilución y su id queda en la bomba.
export type BombaParaGuardar = {
  droga: BombaFormulario["droga"];
  velocidad_ml_h: number;
  dilucion_id: string | null;
  dilucionNueva: {
    dilucion: { ampollas: number; contenidoPorAmpolla: number; unidadContenido: "mg" | "mcg" | "U" | "mEq"; volumenFinalMl: number };
    concentracion: number;
    unidad: string;
    motivo: "inicio" | "cambio_dilucion";
    solucion: Solucion;
  } | null;
};

export async function guardarBombasDeFila(
  supabase: SupabaseClient,
  donanteId: string,
  registroId: string,
  filas: BombaParaGuardar[],
  instanteIso: string,
  cargadoPor: string | null
): Promise<{ nuevasInfusiones: InfusionFila[]; bombas: BombaHora[] }> {
  const nuevasInfusiones: InfusionFila[] = [];
  const formulario: BombaFormulario[] = [];
  for (const f of filas) {
    let dilucionId = f.dilucion_id;
    if (f.dilucionNueva) {
      const d = f.dilucionNueva;
      const nueva = await guardarInfusion(supabase, donanteId, {
        registrado_en: instanteIso,
        droga: f.droga,
        tipo: "infusion",
        motivo: d.motivo,
        cargado_por: cargadoPor,
        ampollas: d.dilucion.ampollas,
        contenido_por_ampolla: d.dilucion.contenidoPorAmpolla,
        unidad_contenido: d.dilucion.unidadContenido,
        volumen_final_ml: d.dilucion.volumenFinalMl,
        concentracion_calculada: d.concentracion,
        unidad_concentracion: d.unidad,
        velocidad_ml_h: null,
        dosis_calculada: null,
        unidad_dosis: null,
        peso_usado_kg: null,
        ...columnasSolucion(d.solucion),
      });
      nuevasInfusiones.push(nueva);
      dilucionId = nueva.id;
    }
    formulario.push({ droga: f.droga, velocidad_ml_h: f.velocidad_ml_h, dilucion_id: dilucionId });
  }
  const bombas = await guardarBombasHora(supabase, donanteId, registroId, formulario);
  return { nuevasInfusiones, bombas };
}

// Respirador: cada cambio es un evento completo con su hora (solo se
// agregan; un error se anula y se carga el correcto).
export type NuevoEventoRespirador = Omit<EventoRespirador, "id" | "anulado">;

export async function guardarEventoRespirador(supabase: SupabaseClient, donanteId: string, datos: NuevoEventoRespirador): Promise<EventoRespirador> {
  const r = await guardarConReintento(() =>
    supabase.from("mantenimiento_respirador").insert({ ...datos, donante_id: donanteId }).select(COLS_RESPIRADOR).single()
  );
  if (!r.ok) throw new Error(r.mensaje);
  return r.resultado.data as EventoRespirador;
}

export async function anularEventoRespirador(supabase: SupabaseClient, id: string): Promise<void> {
  const r = await guardarConReintento(() => supabase.from("mantenimiento_respirador").update({ anulado: true }).eq("id", id));
  if (!r.ok) throw new Error(r.mensaje);
}

// Mediciones del médico (disfunción miocárdica, monitoreo avanzado,
// variables de volemia): una fila por carga, solo con lo completado.
export type NuevaMedicion = Partial<Omit<MedicionMedico, "id" | "anulado">> & { registrado_en: string };

export async function guardarMedicionMedico(supabase: SupabaseClient, donanteId: string, datos: NuevaMedicion): Promise<MedicionMedico> {
  const r = await guardarConReintento(() =>
    supabase.from("mantenimiento_medico").insert({ ...datos, donante_id: donanteId }).select(COLS_MEDICO).single()
  );
  if (!r.ok) throw new Error(r.mensaje);
  return r.resultado.data as MedicionMedico;
}

export async function anularMedicionMedico(supabase: SupabaseClient, id: string): Promise<void> {
  const r = await guardarConReintento(() => supabase.from("mantenimiento_medico").update({ anulado: true }).eq("id", id));
  if (!r.ok) throw new Error(r.mensaje);
}

export async function guardarConfig(
  supabase: SupabaseClient,
  donanteId: string,
  cambios: Partial<Omit<ConfigMantenimiento, "donante_id">>
): Promise<ConfigMantenimiento> {
  const r = await guardarConReintento(() =>
    supabase
      .from("mantenimiento_config")
      .upsert({ donante_id: donanteId, ...cambios, updated_at: new Date().toISOString() }, { onConflict: "donante_id" })
      .select(COLS_CONFIG)
      .single()
  );
  if (!r.ok) throw new Error(r.mensaje);
  return r.resultado.data as ConfigMantenimiento;
}

// Peso único por caso: el mismo donantes.peso que edita Medidas
// antropométricas (se pide acá cuando falta para calcular gammas).
export async function guardarPesoDonante(supabase: SupabaseClient, donanteId: string, pesoKg: number): Promise<Donante> {
  const r = await guardarConReintento(() => supabase.from("donantes").update({ peso: pesoKg }).eq("id", donanteId).select("*").single());
  if (!r.ok) throw new Error(r.mensaje);
  return r.resultado.data as Donante;
}

// "Marcar como completo": mismo criterio que Medidas y Laboratorio.
export async function marcarMantenimientoCompleto(supabase: SupabaseClient, donanteId: string, completo: boolean): Promise<void> {
  const r = await guardarConReintento(() =>
    supabase
      .from("documentacion_estado")
      .upsert(
        {
          donante_id: donanteId,
          categoria: "mantenimiento",
          item_key: "completo",
          estado: completo ? "si" : "no",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "donante_id,categoria,item_key" }
      )
  );
  if (!r.ok) throw new Error(r.mensaje);
}
