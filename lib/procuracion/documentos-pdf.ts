import { PDFDocument } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Donante, Familiar } from "./types";
import { resolveCanonico } from "./panels";
import { REFLEJOS_ME, REFLEJO_PDF_PREFIX } from "./constants";

export type DocumentoDef = {
  key: string;
  nombre: string;
  archivo: string | null; // ruta bajo /forms/documentos, o null si todavía no tenemos la plantilla
  planillaKeys: string[];
  fuente: string; // descripción corta de qué paneles lo alimentan, para mostrar en el panel
};

// Los 5 documentos grandes del panel de Documentación. Cada uno se prellena
// con lo que ya tengamos disponible en planilla_valores/campo_mapeo para
// sus planilla_keys -- el resto del formulario queda en blanco. El
// prellenado fino de cada uno se itera formulario por formulario, como se
// hizo con Muestras.
export const DOCUMENTOS: DocumentoDef[] = [
  {
    key: "neuro",
    nombre: "Historia Clínica Neurológica",
    archivo: "historia_clinica_neurologica.pdf",
    planillaKeys: ["neuro"],
    fuente: "Certificación — Examen neurológico",
  },
  {
    key: "certificado",
    nombre: "Certificado de fallecimiento",
    archivo: "certificado_fallecimiento.pdf",
    planillaKeys: ["certificado"],
    fuente: "Potencial donante + Certificación",
  },
  {
    key: "coord_donante",
    nombre: "Protocolo de Coordinador de Donante",
    archivo: null,
    planillaKeys: [],
    fuente: "Potencial donante + Judicial (falta la plantilla del formulario)",
  },
  {
    key: "op2_completo",
    nombre: "Historia Clínica del Potencial Donante — OP2",
    archivo: "op2_completo.pdf",
    planillaKeys: ["op2_p1", "op2_p2", "op2_p3", "op2_p4", "op2_p5"],
    fuente: "Mantenimiento + Laboratorio e imágenes",
  },
  {
    key: "coord_familia",
    nombre: "Hoja de Comunicación Familiar V.04",
    archivo: "comunicacion_familiar.pdf",
    planillaKeys: ["coord_familia"],
    fuente: "Comunicación de donación — datos del familiar",
  },
];

export type ValorCampo = { valor: string | null; tipo: "text" | "checkbox" };

export async function resolverValoresPlanilla(
  supabase: SupabaseClient,
  planillaKeys: string[],
  donante: Donante,
  familiar: Familiar | null
): Promise<Map<string, ValorCampo>> {
  const [{ data: mapeo }, { data: valores }] = await Promise.all([
    supabase.from("campo_mapeo").select("campo_pdf, tipo_campo, fuente_canonica").in("planilla_key", planillaKeys),
    supabase.from("planilla_valores").select("campo_pdf, valor").eq("donante_id", donante.id).in("planilla_key", planillaKeys),
  ]);

  const valMap = new Map(((valores as { campo_pdf: string; valor: string | null }[]) ?? []).map((v) => [v.campo_pdf, v.valor]));
  const resultado = new Map<string, ValorCampo>();
  ((mapeo as { campo_pdf: string; tipo_campo: string; fuente_canonica: string | null }[]) ?? []).forEach((m) => {
    const valor = m.fuente_canonica ? resolveCanonico(m.fuente_canonica, donante, familiar) : (valMap.get(m.campo_pdf) ?? null);
    resultado.set(m.campo_pdf, { valor, tipo: m.tipo_campo === "checkbox" ? "checkbox" : "text" });
  });
  return resultado;
}

const VALORES_TRUTHY = /^(si|sí|true|x|1|completo)$/i;

/** Rellena los campos de un PDF interactivo (AcroForm) con los valores resueltos. */
export async function rellenarCamposPdf(bytes: ArrayBuffer | Uint8Array, valores: Map<string, ValorCampo>): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(bytes);
  const form = pdfDoc.getForm();

  for (const [campo, { valor, tipo }] of valores) {
    if (valor == null || valor === "") continue;
    try {
      if (tipo === "checkbox") {
        const cb = form.getCheckBox(campo);
        if (VALORES_TRUTHY.test(valor.trim())) cb.check();
      } else {
        const tf = form.getTextField(campo);
        tf.setText(valor);
      }
    } catch {
      // el campo no existe en esta plantilla o es de otro tipo -- se ignora
    }
  }

  return pdfDoc.save();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Reglas de mapeo específicas de Historia Clínica Neurológica -- no son
 * campos nuevos a capturar, son reglas de dónde vuelca cada dato ya
 * cargado en otro lado. Muta `valores` con lo derivado:
 * - Reflejos: los 12 valores planos (ausente/presente) se vuelcan en los
 *   48 casilleros reales (1a/2a x si/no), reusando el mismo valor para
 *   ambas evaluaciones porque la app no distingue 1a de 2a por reflejo.
 * - Test de apnea: resultado (Positiva por defecto) -> casillero
 *   POSITIVA/NEGATIVA/INDETERMINADA.
 * - Test de atropina: no tiene casillero propio en el formulario -> se
 *   vuelca como texto en "Otros exámenes" (fecha/hora/informe).
 * - Fecha del documento y de cada evaluación: la fecha/hora en que se
 *   genera el PDF (no se captura, es automática).
 */
async function aplicarReglasNeuro(supabase: SupabaseClient, donanteId: string, valores: Map<string, ValorCampo>): Promise<void> {
  const clavesInternas = [
    "tipo_test_confirmacion",
    "apneica1_resultado",
    "fc_inicial",
    "fc_final",
    "atropina_fecha",
    "atropina_hora",
    "atropina_duracion",
    "atropina_complicaciones",
    ...REFLEJOS_ME.map((r) => r.key),
  ];
  const { data } = await supabase
    .from("planilla_valores")
    .select("campo_pdf, valor")
    .eq("donante_id", donanteId)
    .eq("planilla_key", "neuro")
    .in("campo_pdf", clavesInternas);
  const crudo = new Map(((data as { campo_pdf: string; valor: string | null }[]) ?? []).map((r) => [r.campo_pdf, r.valor]));

  // Reflejos -> 48 casilleros reales
  for (const r of REFLEJOS_ME) {
    const val = crudo.get(r.key);
    if (val !== "ausente" && val !== "presente") continue;
    const prefijo = REFLEJO_PDF_PREFIX[r.key];
    const sufijo = val === "presente" ? "si" : "no";
    for (const momento of ["1a", "2a"]) {
      valores.set(`${prefijo}_${momento}_${sufijo}`, { valor: "si", tipo: "checkbox" });
    }
  }

  // Test de apnea -> casillero Positiva/Negativa/Indeterminada (Positiva
  // por defecto si el procurador no lo cambió).
  if (crudo.get("tipo_test_confirmacion") === "apnea") {
    const resultado = crudo.get("apneica1_resultado") || "positiva";
    valores.set(`apneica1_${resultado}`, { valor: "si", tipo: "checkbox" });
  }

  // Test de atropina -> no tiene casillero propio; se vuelca como texto
  // en "Otros exámenes" (el formulario no distingue el tipo de test ahí).
  if (crudo.get("tipo_test_confirmacion") === "atropina") {
    const partes: string[] = ["Test de atropina."];
    if (crudo.get("fc_inicial")) partes.push(`FC inicial: ${crudo.get("fc_inicial")} lpm.`);
    if (crudo.get("fc_final")) partes.push(`FC final: ${crudo.get("fc_final")} lpm.`);
    if (crudo.get("atropina_duracion")) partes.push(`Duración: ${crudo.get("atropina_duracion")}.`);
    if (crudo.get("atropina_complicaciones")) partes.push(`Complicaciones: ${crudo.get("atropina_complicaciones")}.`);
    valores.set("otros_examenes_resto", { valor: partes.join(" "), tipo: "text" });
    if (crudo.get("atropina_fecha")) valores.set("otros_examenes_fecha", { valor: crudo.get("atropina_fecha")!, tipo: "text" });
    if (crudo.get("atropina_hora")) valores.set("otros_examenes_hora", { valor: crudo.get("atropina_hora")!, tipo: "text" });
  }

  // Fecha del documento y de cada evaluación: automática, al momento de
  // generar el PDF.
  const ahora = new Date();
  const dia = pad2(ahora.getDate());
  const mes = pad2(ahora.getMonth() + 1);
  const anio = String(ahora.getFullYear());
  const hora = `${pad2(ahora.getHours())}:${pad2(ahora.getMinutes())}`;
  valores.set("fecha_dia", { valor: dia, tipo: "text" });
  valores.set("fecha_mes", { valor: mes, tipo: "text" });
  valores.set("fecha_anio", { valor: anio, tipo: "text" });
  valores.set("fecha_hora_top", { valor: hora, tipo: "text" });
  const fechaCorta = `${dia}/${mes}/${anio}`;
  valores.set("fecha_1a", { valor: fechaCorta, tipo: "text" });
  valores.set("fecha_2a", { valor: fechaCorta, tipo: "text" });
}

/** Genera el PDF prellenado de un documento con lo que ya esté disponible. */
export async function generarDocumentoPdf(
  supabase: SupabaseClient,
  doc: DocumentoDef,
  donante: Donante,
  familiar: Familiar | null
): Promise<Uint8Array> {
  if (!doc.archivo) throw new Error("Todavía no tenemos la plantilla de este formulario.");

  const bytes = await fetch(`/forms/documentos/${doc.archivo}`).then((r) => r.arrayBuffer());
  const valores = doc.planillaKeys.length > 0 ? await resolverValoresPlanilla(supabase, doc.planillaKeys, donante, familiar) : new Map();
  if (doc.key === "neuro") await aplicarReglasNeuro(supabase, donante.id, valores);
  return rellenarCamposPdf(bytes, valores);
}

export function descargarPdf(bytes: Uint8Array, nombreArchivo: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
