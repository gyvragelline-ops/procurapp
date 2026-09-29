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

// 6 perfiles fijos para agrupar la vista de Laboratorio. Los 25 de
// LAB_PARAMS_OP2 quedan repartidos entre renal/hepatico/cardiaco/
// hematologico (los 25 caen ahí, ninguno sobra); gasometrico y pulmonar
// no tienen parámetros en la grilla real del OP2 (build_op2_p3.py) --
// sus valores van a laboratorio_biblioteca igual que cualquier parámetro
// no reconocido, pero agrupados bajo su perfil (ver matchParametroExtendido).
export type PerfilLab = "renal" | "hepatico" | "gasometrico" | "cardiaco" | "pulmonar" | "hematologico";

export const PERFILES_LAB: { key: PerfilLab; label: string; paramsOP2: LabParamOP2[] }[] = [
  { key: "renal", label: "Perfil renal", paramsOP2: ["Urea", "Creatinina", "Na", "K", "Cl", "Sedimento", "Proteinuria"] },
  {
    key: "hepatico",
    label: "Perfil hepático",
    paramsOP2: ["Bilirrubina_T", "Bilirrubina_D", "TGO", "TGP", "FA", "LDH", "Gama_GT", "Amilasa", "Glucemia"],
  },
  { key: "gasometrico", label: "Perfil gasométrico", paramsOP2: [] },
  { key: "cardiaco", label: "Perfil cardíaco", paramsOP2: ["CPK", "CPK_MB"] },
  { key: "pulmonar", label: "Perfil pulmonar", paramsOP2: [] },
  {
    key: "hematologico",
    label: "Perfil hematológico",
    paramsOP2: ["Hematocrito", "Leucocitos", "Hemoglobina", "Neutrofilos", "Plaquetas", "KPTT", "Protombina"],
  },
];

export function perfilDeParametroOP2(param: LabParamOP2): PerfilLab {
  return PERFILES_LAB.find((p) => (p.paramsOP2 as string[]).includes(param))!.key;
}

// Parámetros de gasometría/pulmón -- NO forman parte de la grilla del
// OP2 (no hay campo_pdf real para ellos), así que van a
// laboratorio_biblioteca como cualquier parámetro no reconocido, pero
// con su perfil ya identificado por nombre (mismo mecanismo de sinónimos
// que matchParametroOP2, no depende de la IA para esto).
const PARAMS_EXTENDIDOS: { nombre: string; perfil: PerfilLab; sinonimos: string[] }[] = [
  { nombre: "pH", perfil: "gasometrico", sinonimos: ["ph"] },
  { nombre: "PCO2", perfil: "gasometrico", sinonimos: ["pco2", "paco2", "co2"] },
  { nombre: "PO2", perfil: "gasometrico", sinonimos: ["po2", "pao2"] },
  { nombre: "CO3H", perfil: "gasometrico", sinonimos: ["co3h", "hco3", "bicarbonato"] },
  { nombre: "EB", perfil: "gasometrico", sinonimos: ["eb", "exceso de base", "be"] },
  { nombre: "SatO2", perfil: "pulmonar", sinonimos: ["sato2", "saturacion", "saturacion de oxigeno", "spo2"] },
  { nombre: "FiO2", perfil: "pulmonar", sinonimos: ["fio2"] },
];

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

const VARIANTES_EXTENDIDAS: { nombre: string; perfil: PerfilLab; normal: string }[] = PARAMS_EXTENDIDOS.flatMap(
  (p) => [p.nombre, ...p.sinonimos].map((v) => ({ nombre: p.nombre, perfil: p.perfil, normal: normalizar(v) }))
).sort((a, b) => b.normal.length - a.normal.length);

// Mismo mecanismo que matchParametroOP2, para los 7 parámetros de
// gasometría/pulmón que no están en la grilla del OP2.
export function matchParametroExtendido(nombreIA: string): { nombre: string; perfil: PerfilLab } | null {
  const n = normalizar(nombreIA);
  if (!n) return null;
  const exacto = VARIANTES_EXTENDIDAS.find((v) => v.normal === n);
  if (exacto) return { nombre: exacto.nombre, perfil: exacto.perfil };
  const parcial = VARIANTES_EXTENDIDAS.find((v) => {
    const re = new RegExp(`\\b${v.normal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    return re.test(n);
  });
  return parcial ? { nombre: parcial.nombre, perfil: parcial.perfil } : null;
}

export type ValorExtraido = {
  parametro: string;
  valor: string;
  unidad: string | null;
  // Sugerencia de la IA (solo tiene sentido cuando el parámetro no matchea
  // ni el OP2 ni los extendidos -- ver guardarValorLaboratorio) para
  // parámetros no enumerados a mano (troponinas, hormonas, etc.).
  grupoSugerido?: PerfilLab | null;
};

export type ResultadoGuardado =
  | { tipo: "op2"; parametroCanonico: LabParamOP2; columna: string }
  | { tipo: "biblioteca"; id: string }
  | { tipo: "bloqueado"; parametroCanonico: LabParamOP2 };

// Antes se estampaba con new Date() del lado del cliente en el momento
// de guardar; ahora la carga el médico a mano en el panel (con esta
// misma forma, default "ahora" editable) -- ver LaboratorioPanel.
export type FechaHoraManual = { dia: string; mes: string; anio: string; hora: string };

function formatValor(valor: string, unidad: string | null): string {
  return unidad ? `${valor} ${unidad}` : valor;
}

/**
 * Guarda un valor extraído de una foto: si matchea uno de los 25 campos
 * del OP2, lo escribe en planilla_valores (op2_p3) usando la primera
 * columna de extracción libre (con la fecha/hora que cargó el médico a
 * mano); si las 5 ya están ocupadas, no guarda nada y devuelve
 * "bloqueado" para que el panel avise. Si no matchea, va a la biblioteca
 * abierta, agrupada por perfil si matchea uno de los 7 parámetros
 * extendidos (gasometría/pulmón) o si la IA sugirió un grupo.
 */
export async function guardarValorLaboratorio(
  supabase: SupabaseClient,
  donanteId: string,
  extraido: ValorExtraido,
  imagenUrl: string | null,
  fechaHora: FechaHoraManual
): Promise<ResultadoGuardado> {
  const match = matchParametroOP2(extraido.parametro);

  if (!match) {
    const extendido = matchParametroExtendido(extraido.parametro);
    const grupo = extendido?.perfil ?? extraido.grupoSugerido ?? null;
    const { data } = await supabase
      .from("laboratorio_biblioteca")
      .insert({
        donante_id: donanteId,
        parametro: extraido.parametro,
        valor: extraido.valor,
        unidad: extraido.unidad,
        imagen_url: imagenUrl,
        grupo_sugerido: grupo,
      })
      .select("id")
      .single();
    return { tipo: "biblioteca", id: (data as { id: string }).id };
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
    const { dia, mes, anio, hora } = fechaHora;
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
  grupo_sugerido: PerfilLab | null;
  created_at: string;
};

export async function cargarBibliotecaAbierta(supabase: SupabaseClient, donanteId: string): Promise<BibliotecaRow[]> {
  const { data } = await supabase
    .from("laboratorio_biblioteca")
    .select("id, parametro, valor, unidad, imagen_url, grupo_sugerido, created_at")
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

// Agrupa lo ya cargado (OP2 + biblioteca) por perfil, para el render de
// LaboratorioPanel -- un solo lugar con la lógica de "a qué perfil
// pertenece esto", tanto para lo estructurado (25 del OP2) como para lo
// que cayó en biblioteca con grupo_sugerido (gasometría/pulmón, o lo que
// la IA haya sugerido para un parámetro no enumerado).
export type PerfilAgrupado = {
  key: PerfilLab;
  label: string;
  totalParams: number; // cuántos parámetros DISTINTOS puede tener este perfil (solo cuenta los del OP2 -- gasometrico/pulmonar no tienen un total fijo)
  paramsConValor: number;
  camposOP2: CampoOP2Detectado[];
  filasBiblioteca: BibliotecaRow[];
};

export function agruparPorPerfil(camposOP2: CampoOP2Detectado[], biblioteca: BibliotecaRow[]): PerfilAgrupado[] {
  return PERFILES_LAB.map((perfil) => {
    const camposDelPerfil = camposOP2.filter((c) => perfil.paramsOP2.includes(c.parametro));
    const filasDelPerfil = biblioteca.filter((b) => b.grupo_sugerido === perfil.key);
    const paramsConValor = new Set(camposDelPerfil.map((c) => c.parametro)).size;
    return {
      key: perfil.key,
      label: perfil.label,
      totalParams: perfil.paramsOP2.length,
      paramsConValor,
      camposOP2: camposDelPerfil,
      filasBiblioteca: filasDelPerfil,
    };
  });
}

// Lo que no matchea NINGÚN perfil (ni por OP2 ni por grupo_sugerido) --
// esto sigue siendo "Biblioteca abierta", sin cambios de comportamiento.
export function bibliotecaSinPerfil(biblioteca: BibliotecaRow[]): BibliotecaRow[] {
  return biblioteca.filter((b) => !b.grupo_sugerido);
}

// Registro por-foto (laboratorio_cargas): una fila por cada foto subida,
// con la lista de valores que salieron de ESA foto y dónde quedó guardado
// cada uno (para poder editarlo después sin duplicar filas en
// planilla_valores/laboratorio_biblioteca). Ver LaboratorioPanel: el
// carrusel y el detalle tocable se arman a partir de esto.
export type DestinoItem =
  | { tipo: "op2"; parametroCanonico: LabParamOP2; columna: string }
  | { tipo: "biblioteca"; bibliotecaId: string }
  | { tipo: "bloqueado" };

export type CargaItemGuardado = {
  parametro: string;
  valor: string;
  unidad: string | null;
  destino: DestinoItem;
};

export type CargaLab = {
  id: string;
  donante_id: string;
  imagen_url: string | null;
  fecha_hora_estudio: string;
  etiqueta: string;
  items: CargaItemGuardado[];
  created_at: string;
};

export async function registrarCargaLaboratorio(
  supabase: SupabaseClient,
  donanteId: string,
  imagenUrl: string | null,
  fechaHora: FechaHoraManual,
  items: CargaItemGuardado[]
): Promise<CargaLab | null> {
  const fechaHoraISO = new Date(
    `${fechaHora.anio}-${fechaHora.mes}-${fechaHora.dia}T${fechaHora.hora}:00`
  ).toISOString();
  const etiqueta = `Laboratorio ${fechaHora.hora}`;
  const { data } = await supabase
    .from("laboratorio_cargas")
    .insert({
      donante_id: donanteId,
      imagen_url: imagenUrl,
      fecha_hora_estudio: fechaHoraISO,
      etiqueta,
      items,
    })
    .select()
    .single();
  return (data as CargaLab) ?? null;
}

export async function cargarCargasLaboratorio(supabase: SupabaseClient, donanteId: string): Promise<CargaLab[]> {
  const { data } = await supabase
    .from("laboratorio_cargas")
    .select("id, donante_id, imagen_url, fecha_hora_estudio, etiqueta, items, created_at")
    .eq("donante_id", donanteId)
    .order("fecha_hora_estudio", { ascending: false });
  return (data as CargaLab[]) ?? [];
}

/**
 * Edita un ítem puntual dentro de una carga ya guardada: actualiza el
 * storage estructurado donde haya quedado (planilla_valores u
 * laboratorio_biblioteca, según destino) y refleja el cambio en el
 * snapshot de items de la carga. Los ítems "bloqueados" no tienen
 * storage estructurado que tocar -- solo se corrige el snapshot.
 */
export async function actualizarItemDeCarga(
  supabase: SupabaseClient,
  carga: CargaLab,
  idx: number,
  nuevo: { parametro: string; valor: string; unidad: string | null }
): Promise<{ ok: true; items: CargaItemGuardado[] } | { ok: false; error: string }> {
  const item = carga.items[idx];
  if (!item) return { ok: false, error: "Ítem no encontrado." };

  if (item.destino.tipo === "op2") {
    const { error } = await supabase
      .from("planilla_valores")
      .update({ valor: formatValor(nuevo.valor, nuevo.unidad) })
      .eq("donante_id", carga.donante_id)
      .eq("planilla_key", "op2_p3")
      .eq("campo_pdf", `lab_${item.destino.parametroCanonico}_${item.destino.columna}`);
    if (error) return { ok: false, error: error.message };
  } else if (item.destino.tipo === "biblioteca") {
    const { error } = await supabase
      .from("laboratorio_biblioteca")
      .update({ parametro: nuevo.parametro, valor: nuevo.valor, unidad: nuevo.unidad })
      .eq("id", item.destino.bibliotecaId);
    if (error) return { ok: false, error: error.message };
  }

  const nuevosItems = carga.items.map((it, i) =>
    i === idx ? { ...it, parametro: nuevo.parametro, valor: nuevo.valor, unidad: nuevo.unidad } : it
  );
  const { error: errorCarga } = await supabase
    .from("laboratorio_cargas")
    .update({ items: nuevosItems })
    .eq("id", carga.id);
  if (errorCarga) return { ok: false, error: errorCarga.message };

  return { ok: true, items: nuevosItems };
}
