import { PDFDocument } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Donante, Familiar } from "./types";
import { resolveCanonico } from "./panels";

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
