import type { SupabaseClient } from "@supabase/supabase-js";
import type { Donante, Familiar } from "./types";
import { humanizeCampo, type EstadoEtapa } from "./constants";

export type ChipTone = "green" | "amber" | "red" | "gray";
export type PanelRow = {
  label: string;
  value?: string | null;
  chip?: { text: string; tone: ChipTone };
};
export type PanelContent = {
  rows: PanelRow[];
  note?: string;
};

export const ORGANO_EMOJI: Record<string, string> = {
  corazon: "❤️",
  pulmones: "🫁",
  higado: "🫀",
  rinones: "🫘",
};

function resolveCanonico(fuente: string, donante: Donante, familiar: Familiar | null): string | null {
  const [tabla, columna] = fuente.split(".");
  const source =
    tabla === "donantes"
      ? (donante as unknown as Record<string, unknown>)
      : tabla === "familiares" && familiar
        ? (familiar as unknown as Record<string, unknown>)
        : null;
  if (!source) return null;
  const val = source[columna];
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "boolean") return val ? "Sí" : "No";
  return String(val);
}

function chipFromEstado(estado: string | null | undefined, fallback: { text: string; tone: ChipTone }) {
  if (!estado) return fallback;
  if (estado === "green" || estado === "si") return { text: "Completo", tone: "green" as const };
  if (estado === "amber" || estado === "pendiente") return { text: "Pendiente", tone: "amber" as const };
  if (estado === "red" || estado === "no") return { text: "Crítico", tone: "red" as const };
  return { text: humanizeCampo(estado), tone: "gray" as const };
}

export function gammaOf(concMg: number | null, concMl: number | null, rateMlHr: number | null, pesoKg: number | null) {
  if (!concMg || !concMl || !rateMlHr || !pesoKg) return null;
  return ((concMg / concMl) * 1000 * rateMlHr) / (pesoKg * 60);
}
export function fmtGamma(g: number | null) {
  return g == null ? null : g.toFixed(2).replace(".", ",");
}

function fmtFecha(v: string | null) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

async function getDocEstado(supabase: SupabaseClient, donanteId: string, categoria: string) {
  const { data } = await supabase
    .from("documentacion_estado")
    .select("item_key, estado, meta")
    .eq("donante_id", donanteId)
    .eq("categoria", categoria);
  return (data as { item_key: string; estado: string | null; meta: Record<string, unknown> | null }[]) ?? [];
}

async function getCampos(
  supabase: SupabaseClient,
  donanteId: string,
  planillaKey: string,
  campos: string[],
  donante: Donante,
  familiar: Familiar | null
) {
  const [{ data: mapeo }, { data: valores }] = await Promise.all([
    supabase
      .from("campo_mapeo")
      .select("campo_pdf, fuente_canonica")
      .eq("planilla_key", planillaKey)
      .in("campo_pdf", campos),
    supabase
      .from("planilla_valores")
      .select("campo_pdf, valor")
      .eq("donante_id", donanteId)
      .eq("planilla_key", planillaKey)
      .in("campo_pdf", campos),
  ]);
  const valMap = new Map(((valores as { campo_pdf: string; valor: string | null }[]) ?? []).map((v) => [v.campo_pdf, v.valor]));
  const result: Record<string, string | null> = {};
  ((mapeo as { campo_pdf: string; fuente_canonica: string | null }[]) ?? []).forEach((m) => {
    result[m.campo_pdf] = m.fuente_canonica
      ? resolveCanonico(m.fuente_canonica, donante, familiar)
      : (valMap.get(m.campo_pdf) ?? null);
  });
  return result;
}

export async function loadPanel(
  supabase: SupabaseClient,
  key: string,
  donante: Donante,
  familiar: Familiar | null,
  etapas: Record<string, EstadoEtapa>
): Promise<PanelContent> {
  const donanteId = donante.id;

  if (key === "potencial") {
    const judicial = await getDocEstado(supabase, donanteId, "judicial");
    const aplica = judicial.find((r) => r.item_key === "aplica");
    return {
      rows: [
        { label: "Servicio", value: donante.servicio },
        { label: "PD Nº", value: donante.pd_numero },
        { label: "Fecha de ingreso", value: fmtFecha(donante.fecha_ingreso) },
        {
          label: "Intervención judicial",
          chip: aplica
            ? { text: aplica.estado === "si" ? "Corresponde" : "No corresponde", tone: aplica.estado === "si" ? "amber" : "gray" }
            : { text: "Sin definir", tone: "gray" },
        },
      ],
    };
  }

  if (key === "judicial") {
    const items = await getDocEstado(supabase, donanteId, "judicial");
    const foto = items.find((r) => r.item_key === "foto_precario");
    const auth = items.find((r) => r.item_key === "autorizacion");
    return {
      rows: [
        { label: "Foto del precario", chip: chipFromEstado(foto?.estado, { text: "Pendiente", tone: "amber" }) },
        { label: "Autorización del juez", chip: chipFromEstado(auth?.estado, { text: "Pendiente", tone: "amber" }) },
      ],
      note: "La autorización del juez la gestiona y registra Base Operativa.",
    };
  }

  if (key === "mantenimiento") {
    const { data: logs } = await supabase
      .from("mantenimiento_log")
      .select("hora, diuresis, drogas, created_at")
      .eq("donante_id", donanteId)
      .order("created_at", { ascending: false })
      .limit(1);
    const last = (logs as { hora: string; diuresis: string; drogas: { nombre: string; tipo: string; ml: number; concMg: number | null; concMl: number | null }[] }[])?.[0];
    if (!last) {
      return { rows: [], note: "Sin registros de mantenimiento cargados todavía." };
    }
    const drogaRows: PanelRow[] = (last.drogas ?? []).map((g) => {
      const gamma = gammaOf(g.concMg, g.concMl, g.ml, donante.peso);
      return {
        label: `${g.nombre} (${g.tipo})`,
        value: `${g.ml} ml/h${gamma != null ? ` · ${fmtGamma(gamma)} γ` : " · definir dilución para γ"}`,
      };
    });
    return {
      rows: [{ label: "Última actualización", value: last.hora }, ...drogaRows, { label: "Diuresis", value: `${last.diuresis} ml/h` }],
    };
  }

  if (key === "documentacion") {
    const items = await getDocEstado(supabase, donanteId, "documentacion");
    const fotoDni = items.find((r) => r.item_key === "foto_dni");
    const fotoGF = items.find((r) => r.item_key === "foto_grupo_factor");
    const dopplerEeg = items.find((r) => r.item_key === "doppler_o_eeg");
    const otros = items.filter((r) => !["foto_dni", "foto_grupo_factor", "doppler_o_eeg"].includes(r.item_key));
    const tipoEstudio = (dopplerEeg?.meta?.tipo as string | undefined) === "eeg" ? "EEG" : "Doppler transcraneal";
    return {
      rows: [
        { label: "Foto de DNI del potencial donante", chip: chipFromEstado(fotoDni?.estado, { text: "Pendiente", tone: "amber" }) },
        { label: "Foto de grupo y factor", chip: chipFromEstado(fotoGF?.estado, { text: "Pendiente", tone: "amber" }) },
        ...otros.map((o) => ({ label: humanizeCampo(o.item_key), chip: chipFromEstado(o.estado, { text: "Pendiente", tone: "amber" as const }) })),
        { label: tipoEstudio, chip: chipFromEstado(dopplerEeg?.estado, { text: "Pendiente", tone: "amber" }) },
      ],
    };
  }

  if (key === "entregaCorneas") {
    return {
      rows: [],
      note: "Panel de Entrega de córneas -- contenido a definir en una próxima iteración.",
    };
  }

  if (key === "quirofano") {
    const campos = await getCampos(supabase, donanteId, "op2_p5", ["indicaciones_medicas"], donante, familiar);
    return {
      rows: [
        { label: "Horario informado por Base", value: null },
        { label: "Indicaciones médicas (OP2)", value: campos.indicaciones_medicas },
      ],
      note: "Coordinación de horario con Base Operativa: sin integración todavía.",
    };
  }

  return { rows: [] };
}
