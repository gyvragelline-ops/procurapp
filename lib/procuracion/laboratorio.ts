import type { SupabaseClient } from "@supabase/supabase-js";

// Los 25 parámetros reales de la grilla de Laboratorio del OP2 (ver
// handoff/build_op2_p3.py, LAB_ROWS) -- cada uno tiene 5 columnas de
// extracción (lab_{param}_extraccion1..5), no un solo valor.
export const LAB_PARAMS_OP2 = [
  "Hematocrito",
  "Leucocitos",
  "Hemoglobina",
  "Neutrofilos",
  "Plaquetas",
  "Urea",
  "Creatinina",
  "Glucemia",
  "Na",
  "K",
  "Cl",
  "Bilirrubina_T",
  "Bilirrubina_D",
  "TGO",
  "TGP",
  "FA",
  "LDH",
  "Gama_GT",
  "Amilasa",
  "CPK",
  "CPK_MB",
  "KPTT",
  "Protombina",
  "Proteinuria",
  "Sedimento",
] as const;

export type LabParamOP2 = (typeof LAB_PARAMS_OP2)[number];

export const EXTRACCION_COLS = ["extraccion1", "extraccion2", "extraccion3", "extraccion4", "extraccion5"] as const;

// Sinónimos/abreviaturas comunes que puede devolver la IA al leer una foto
// de laboratorio real -- se comparan ya normalizados (ver normalizar()).
const SINONIMOS: Record<LabParamOP2, string[]> = {
  Hematocrito: ["hto", "hcto", "hematocrito"],
  Leucocitos: ["leuco", "leucocitos", "gb", "globulos blancos", "wbc"],
  Hemoglobina: ["hb", "hgb", "hemoglobina"],
  Neutrofilos: ["neutrofilos", "neutro", "neut", "segmentados"],
  Plaquetas: ["plaquetas", "plt", "plaq"],
  Urea: ["urea", "uremia"],
  Creatinina: ["creatinina", "crea", "cr"],
  Glucemia: ["glucemia", "glucosa", "gluc"],
  Na: ["na", "sodio", "natremia"],
  K: ["k", "potasio", "kalemia"],
  Cl: ["cl", "cloro", "cloremia"],
  Bilirrubina_T: ["bilirrubina total", "bt", "bili t", "bilirrubina t"],
  Bilirrubina_D: ["bilirrubina directa", "bd", "bili d", "bilirrubina d"],
  TGO: ["tgo", "ast", "got"],
  TGP: ["tgp", "alt", "gpt"],
  FA: ["fa", "fosfatasa alcalina", "falc"],
  LDH: ["ldh", "lactato deshidrogenasa"],
  Gama_GT: ["ggt", "gamma gt", "gama gt", "yggt"],
  Amilasa: ["amilasa", "amil"],
  CPK: ["cpk", "ck", "creatinfosfoquinasa", "creatinquinasa"],
  CPK_MB: ["cpk mb", "ck mb", "cpkmb", "ckmb"],
  KPTT: ["kptt", "ttpa", "aptt", "ptt"],
  Protombina: ["protrombina", "tp", "protombina", "quick", "tiempo de protrombina"],
  Proteinuria: ["proteinuria"],
  Sedimento: ["sedimento", "sedimento urinario"],
};

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const VARIANTES: { canonico: LabParamOP2; normal: string }[] = LAB_PARAMS_OP2.flatMap((canonico) => {
  const variantes = [canonico.replace(/_/g, " "), ...SINONIMOS[canonico]];
  return variantes.map((v) => ({ canonico, normal: normalizar(v) }));
}).sort((a, b) => b.normal.length - a.normal.length); // más largas primero, evita falsos positivos cortos ("k", "na")

export function matchParametroOP2(nombreIA: string): LabParamOP2 | null {
  const n = normalizar(nombreIA);
  if (!n) return null;
  const exacto = VARIANTES.find((v) => v.normal === n);
  if (exacto) return exacto.canonico;
  const parcial = VARIANTES.find((v) => {
    const re = new RegExp(`\\b${v.normal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    return re.test(n);
  });
  return parcial ? parcial.canonico : null;
}

export type ValorExtraido = { parametro: string; valor: string; unidad: string | null };

export type ResultadoGuardado =
  | { tipo: "op2"; parametroCanonico: LabParamOP2; columna: string }
  | { tipo: "biblioteca" }
  | { tipo: "bloqueado"; parametroCanonico: LabParamOP2 };

function fechaHoraActual() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    dia: pad(d.getDate()),
    mes: pad(d.getMonth() + 1),
    anio: String(d.getFullYear()),
    hora: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function formatValor(valor: string, unidad: string | null): string {
  return unidad ? `${valor} ${unidad}` : valor;
}

/**
 * Guarda un valor extraído de una foto: si matchea uno de los 25 campos
 * del OP2, lo escribe en planilla_valores (op2_p3) usando la primera
 * columna de extracción libre; si las 5 ya están ocupadas, no guarda nada
 * y devuelve "bloqueado" para que el panel avise. Si no matchea, va a la
 * biblioteca abierta.
 */
export async function guardarValorLaboratorio(
  supabase: SupabaseClient,
  donanteId: string,
  extraido: ValorExtraido,
  imagenUrl: string | null
): Promise<ResultadoGuardado> {
  const match = matchParametroOP2(extraido.parametro);

  if (!match) {
    await supabase.from("laboratorio_biblioteca").insert({
      donante_id: donanteId,
      parametro: extraido.parametro,
      valor: extraido.valor,
      unidad: extraido.unidad,
      imagen_url: imagenUrl,
    });
    return { tipo: "biblioteca" };
  }

  const campos = EXTRACCION_COLS.map((col) => `lab_${match}_${col}`);
  const { data: existentes } = await supabase
    .from("planilla_valores")
    .select("campo_pdf, valor")
    .eq("donante_id", donanteId)
    .eq("planilla_key", "op2_p3")
    .in("campo_pdf", campos);

  const ocupadas = new Set(
    ((existentes as { campo_pdf: string; valor: string | null }[]) ?? [])
      .filter((r) => r.valor != null && r.valor !== "")
      .map((r) => r.campo_pdf)
  );

  const columnaLibre = EXTRACCION_COLS.find((col) => !ocupadas.has(`lab_${match}_${col}`));
  if (!columnaLibre) {
    return { tipo: "bloqueado", parametroCanonico: match };
  }

  await supabase.from("planilla_valores").upsert(
    {
      donante_id: donanteId,
      planilla_key: "op2_p3",
      campo_pdf: `lab_${match}_${columnaLibre}`,
      valor: formatValor(extraido.valor, extraido.unidad),
    },
    { onConflict: "donante_id,planilla_key,campo_pdf" }
  );

  // La fecha/hora de una columna de extracción es compartida por los 25
  // parámetros de esa extracción -- se estampa una sola vez, con el
  // primer valor que la ocupa.
  const { data: fechaExistente } = await supabase
    .from("planilla_valores")
    .select("valor")
    .eq("donante_id", donanteId)
    .eq("planilla_key", "op2_p3")
    .eq("campo_pdf", `lab_${columnaLibre}_fecha_dia`)
    .maybeSingle();

  if (!fechaExistente?.valor) {
    const { dia, mes, anio, hora } = fechaHoraActual();
    const filas = [
      { sub: "dia", valor: dia },
      { sub: "mes", valor: mes },
      { sub: "anio", valor: anio },
      { sub: "hora", valor: hora },
    ].map((f) => ({
      donante_id: donanteId,
      planilla_key: "op2_p3",
      campo_pdf: `lab_${columnaLibre}_fecha_${f.sub}`,
      valor: f.valor,
    }));
    await supabase.from("planilla_valores").upsert(filas, { onConflict: "donante_id,planilla_key,campo_pdf" });
  }

  return { tipo: "op2", parametroCanonico: match, columna: columnaLibre };
}

export type BibliotecaRow = {
  id: string;
  parametro: string;
  valor: string | null;
  unidad: string | null;
  imagen_url: string | null;
  created_at: string;
};

export async function cargarBibliotecaAbierta(supabase: SupabaseClient, donanteId: string): Promise<BibliotecaRow[]> {
  const { data } = await supabase
    .from("laboratorio_biblioteca")
    .select("id, parametro, valor, unidad, imagen_url, created_at")
    .eq("donante_id", donanteId)
    .order("created_at", { ascending: false });
  return (data as BibliotecaRow[]) ?? [];
}

export type CampoOP2Detectado = { parametro: LabParamOP2; columna: string; valor: string };

export async function cargarCamposOP2Detectados(supabase: SupabaseClient, donanteId: string): Promise<CampoOP2Detectado[]> {
  const campos = LAB_PARAMS_OP2.flatMap((p) => EXTRACCION_COLS.map((c) => `lab_${p}_${c}`));
  const { data } = await supabase
    .from("planilla_valores")
    .select("campo_pdf, valor")
    .eq("donante_id", donanteId)
    .eq("planilla_key", "op2_p3")
    .in("campo_pdf", campos);

  const rows = (data as { campo_pdf: string; valor: string | null }[]) ?? [];
  const resultado: CampoOP2Detectado[] = [];
  for (const r of rows) {
    if (!r.valor) continue;
    const m = r.campo_pdf.match(/^lab_(.+)_(extraccion\d)$/);
    if (!m) continue;
    const [, parametro, columna] = m;
    if (!(LAB_PARAMS_OP2 as readonly string[]).includes(parametro)) continue;
    resultado.push({ parametro: parametro as LabParamOP2, columna, valor: r.valor });
  }
  resultado.sort((a, b) => a.parametro.localeCompare(b.parametro) || a.columna.localeCompare(b.columna));
  return resultado;
}
