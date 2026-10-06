import type { SupabaseClient } from "@supabase/supabase-js";
import { guardarConReintento } from "./guardar";
import type { Donante } from "./types";
import type { InfusionFila } from "./mantenimiento-calculos";

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
  anulado: boolean;
};

export type CampoNumericoRegistro = Exclude<
  keyof RegistroMantenimiento,
  "id" | "registrado_en" | "diuresis_es_ultima_hora" | "disfuncion_miocardica" | "anulado"
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
  { campo: "ingresos_ml", etiqueta: "Ingresos", unidad: "mL" },
  { campo: "egresos_ml", etiqueta: "Otros egresos (sin diuresis)", unidad: "mL" },
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
  nutricion_previa: "si" | "no" | null;
  monitoreo_avanzado_activo: boolean;
  corazon_candidato: "si" | "no" | "sin_definir";
};

export type DatosRegistro = Partial<Omit<RegistroMantenimiento, "id" | "anulado">> & { registrado_en: string };

const COLS_REGISTRO =
  "id, registrado_en, fc, pam, temperatura, sat_o2, fio2, peep, volumen_corriente, diuresis_ml, diuresis_es_ultima_hora, ingresos_ml, egresos_ml, osm_urinaria, osm_serica, densidad_urinaria, pvc, gc, ic_medido, sat_venosa, delta_pp, delta_vs, delta_co2_espirado, indice_vena_cava, resultado_pasivo_miembros, disfuncion_miocardica, anulado";
const COLS_INFUSION =
  "id, registrado_en, droga, tipo, ampollas, contenido_por_ampolla, unidad_contenido, volumen_final_ml, velocidad_ml_h, dosis_calculada, unidad_dosis, anulado";
const COLS_CONFIG = "donante_id, nutricion_previa, monitoreo_avanzado_activo, corazon_candidato";

export async function cargarMantenimiento(
  supabase: SupabaseClient,
  donanteId: string
): Promise<{ registros: RegistroMantenimiento[]; infusiones: InfusionFila[]; config: ConfigMantenimiento | null }> {
  const [reg, inf, cfg] = await Promise.all([
    supabase.from("mantenimiento_registros").select(COLS_REGISTRO).eq("donante_id", donanteId).order("registrado_en"),
    supabase.from("mantenimiento_infusiones").select(COLS_INFUSION).eq("donante_id", donanteId).order("registrado_en"),
    supabase.from("mantenimiento_config").select(COLS_CONFIG).eq("donante_id", donanteId).maybeSingle(),
  ]);
  const error = reg.error ?? inf.error ?? cfg.error;
  if (error) throw new Error(`No se pudieron cargar los datos de Mantenimiento: ${error.message}`);
  return {
    registros: (reg.data as RegistroMantenimiento[]) ?? [],
    infusiones: (inf.data as InfusionFila[]) ?? [],
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

// Una fila por inicio / cambio de velocidad / suspensión (0 mL/h) / bolo.
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
