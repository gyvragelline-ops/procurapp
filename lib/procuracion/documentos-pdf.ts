import { PDFDocument } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Donante, Familiar } from "./types";
import { resolveCanonico } from "./panels";
import { REFLEJOS_ME, REFLEJO_PDF_PREFIX, reflejoKey } from "./constants";

export type DocumentoDef = {
  key: string;
  nombre: string;
  archivo: string | null; // ruta bajo /forms/documentos -- solo aplica a motor "legacy"
  planillaKeys: string[];
  fuente: string; // descripción corta de qué paneles lo alimentan, para mostrar en el panel
  // "legacy": rellena el PDF escaneado por coordenadas/AcroForm (pdf-lib).
  // "nuevo": genera el documento desde cero con @react-pdf/renderer -- ver
  // lib/procuracion/documentos-nuevos/. El motor viejo queda obsoleto: no
  // se sigue arreglando, se va reemplazando documento por documento.
  motor: "legacy" | "nuevo";
};

// Documentos que efectivamente se imprimen desde el panel de Documentación.
// OP2, Protocolo de Coordinador de Donante y Hoja de Comunicación Familiar
// V.04 dejaron de imprimirse (decisión de producto) -- sus datos se siguen
// capturando en los paneles de siempre, pero ya no generan PDF propio, así
// que no tienen entrada acá.
export const DOCUMENTOS: DocumentoDef[] = [
  {
    key: "neuro",
    nombre: "Historia Clínica Neurológica",
    archivo: "historia_clinica_neurologica.pdf",
    planillaKeys: ["neuro"],
    fuente: "Certificación — Examen neurológico",
    motor: "legacy",
  },
  {
    key: "certificado",
    nombre: "Certificado de fallecimiento",
    archivo: null,
    planillaKeys: ["certificado"],
    fuente: "Potencial donante + Certificación",
    motor: "nuevo",
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
        // Sin tamaño fijo, pdf-lib autoajusta la fuente al ancho/alto de
        // cada campo -- en cajas anchas con poco texto (ej. estudios
        // complementarios) eso produce una letra desproporcionadamente
        // grande, y en cajas bajitas puede desbordar hacia el campo de
        // abajo. Un tamaño uniforme evita ambos problemas.
        tf.setFontSize(9);
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
 * - Fecha de cada evaluación (fecha_1a/fecha_2a): se toma del campo único
 *   "Fecha del examen" cargado en el panel (1ª y 2ª evaluación ocurren el
 *   mismo día). Fecha/hora del encabezado del documento (fecha_dia/mes/
 *   anio/fecha_hora_top): no se captura, es automática (momento en que se
 *   genera el PDF).
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
    "fecha_examen",
    ...REFLEJOS_ME.flatMap((r) => [reflejoKey(r.key, "1a"), reflejoKey(r.key, "2a")]),
  ];
  const { data } = await supabase
    .from("planilla_valores")
    .select("campo_pdf, valor")
    .eq("donante_id", donanteId)
    .eq("planilla_key", "neuro")
    .in("campo_pdf", clavesInternas);
  const crudo = new Map(((data as { campo_pdf: string; valor: string | null }[]) ?? []).map((r) => [r.campo_pdf, r.valor]));

  // Reflejos -> 48 casilleros reales (cada evaluación tiene su propio valor)
  for (const r of REFLEJOS_ME) {
    const prefijo = REFLEJO_PDF_PREFIX[r.key];
    for (const momento of ["1a", "2a"] as const) {
      const val = crudo.get(reflejoKey(r.key, momento));
      if (val !== "ausente" && val !== "presente") continue;
      const sufijo = val === "presente" ? "si" : "no";
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
    valores.set("otros_examenes_resto", { valor: partes.join(" "), tipo: "text" });
    if (crudo.get("atropina_fecha")) valores.set("otros_examenes_fecha", { valor: crudo.get("atropina_fecha")!, tipo: "text" });
    if (crudo.get("atropina_hora")) valores.set("otros_examenes_hora", { valor: crudo.get("atropina_hora")!, tipo: "text" });
  }

  // Fecha del encabezado del documento: automática, al momento de generar
  // el PDF (no es la fecha del examen).
  const ahora = new Date();
  const dia = pad2(ahora.getDate());
  const mes = pad2(ahora.getMonth() + 1);
  const anio = String(ahora.getFullYear());
  const hora = `${pad2(ahora.getHours())}:${pad2(ahora.getMinutes())}`;
  valores.set("fecha_dia", { valor: dia, tipo: "text" });
  valores.set("fecha_mes", { valor: mes, tipo: "text" });
  valores.set("fecha_anio", { valor: anio, tipo: "text" });
  valores.set("fecha_hora_top", { valor: hora, tipo: "text" });

  // Fecha de cada evaluación: la que cargó el procurador en "Fecha del
  // examen" -- única para 1ª y 2ª porque ocurren el mismo día.
  const fechaExamen = crudo.get("fecha_examen");
  if (fechaExamen) {
    valores.set("fecha_1a", { valor: fechaExamen, tipo: "text" });
    valores.set("fecha_2a", { valor: fechaExamen, tipo: "text" });
  }
}

/**
 * El 2º médico que certifica se etiqueta automáticamente como
 * "Neurólogo/Neurocirujano" en el documento -- el procurador solo carga
 * el nombre, no se le pide el rol.
 */
function aplicarReglasCertificado(valores: Map<string, ValorCampo>): void {
  const medico2 = valores.get("medico2_nombre");
  if (medico2?.valor) {
    valores.set("medico2_nombre", { valor: `Neurólogo/Neurocirujano: ${medico2.valor}`, tipo: "text" });
  }
}

/** Genera el PDF prellenado de un documento "legacy" (AcroForm sobre el escaneado). */
export async function generarDocumentoPdf(
  supabase: SupabaseClient,
  doc: DocumentoDef,
  donante: Donante,
  familiar: Familiar | null
): Promise<Uint8Array> {
  if (doc.motor !== "legacy" || !doc.archivo) throw new Error("Este documento no usa el motor legacy.");

  const bytes = await fetch(`/forms/documentos/${doc.archivo}`).then((r) => r.arrayBuffer());
  const valores = doc.planillaKeys.length > 0 ? await resolverValoresPlanilla(supabase, doc.planillaKeys, donante, familiar) : new Map();
  if (doc.key === "neuro") await aplicarReglasNeuro(supabase, donante.id, valores);
  return rellenarCamposPdf(bytes, valores);
}

/** Genera el PDF de un documento "nuevo" (@react-pdf/renderer, sin plantilla escaneada). */
export async function generarDocumentoNuevo(
  supabase: SupabaseClient,
  doc: DocumentoDef,
  donante: Donante,
  familiar: Familiar | null
): Promise<Blob> {
  if (doc.motor !== "nuevo") throw new Error("Este documento no usa el motor nuevo.");

  const valores = await resolverValoresPlanilla(supabase, doc.planillaKeys, donante, familiar);
  if (doc.key === "certificado") {
    aplicarReglasCertificado(valores);
    const { generarCertificadoFallecimientoPdf } = await import("./documentos-nuevos/CertificadoFallecimiento");
    return generarCertificadoFallecimientoPdf(donante, valores);
  }
  throw new Error(`Todavía no hay generador "nuevo" para ${doc.key}.`);
}

export function descargarPdf(bytes: Uint8Array, nombreArchivo: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  descargarBlob(blob, nombreArchivo);
}

export function descargarBlob(blob: Blob, nombreArchivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
