import dotenv from "dotenv";
dotenv.config({ path: `${__dirname}/../../.env.local` });
dotenv.config({ path: `${__dirname}/../../.env` });
import fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";
import { DOCUMENTOS, generarDocumentoPdf } from "../../lib/procuracion/documentos-pdf";
import type { Donante, Familiar } from "../../lib/procuracion/types";
import { REFLEJOS_ME, REFLEJO_PDF_PREFIX, reflejoKey } from "../../lib/procuracion/constants";

// generarDocumentoPdf usa fetch("/forms/documentos/...") -- solo funciona
// en el navegador. Para probarlo en Node, interceptamos ese path y leemos
// el archivo real del disco.
const originalFetch = global.fetch;
global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input.toString();
  if (url.startsWith("/forms/documentos/")) {
    const filePath = path.join(__dirname, "../../public", url);
    const bytes = fs.readFileSync(filePath);
    return new Response(bytes);
  }
  return originalFetch(input, init);
}) as typeof fetch;

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

type Resultado = { campo: string; esperado: string; obtenido: string; ok: boolean };
const resultados: Resultado[] = [];

function leerTexto(outDoc: PDFDocument, campo: string): string {
  try {
    return outDoc.getForm().getTextField(campo).getText() ?? "";
  } catch {
    return "<<CAMPO NO EXISTE EN EL PDF>>";
  }
}

function leerCheckbox(outDoc: PDFDocument, campo: string): boolean {
  try {
    return outDoc.getForm().getCheckBox(campo).isChecked();
  } catch {
    return false;
  }
}

function assertTexto(outDoc: PDFDocument, campo: string, esperado: string) {
  const obtenido = leerTexto(outDoc, campo);
  resultados.push({ campo, esperado, obtenido, ok: obtenido === esperado });
}

function assertCheckbox(outDoc: PDFDocument, campo: string, esperado: boolean) {
  const obtenido = leerCheckbox(outDoc, campo);
  resultados.push({ campo, esperado: String(esperado), obtenido: String(obtenido), ok: obtenido === esperado });
}

async function main() {
  console.log("--- Crear donante de prueba con TODOS los campos de Certificación cargados ---");
  const { data: donante, error: donanteErr } = await supabase
    .from("donantes")
    .insert({
      nombre_completo: "TEST MAPEO NEURO COMPLETO -- borrar",
      dni: "55667788",
      sexo: "masculino",
      edad: "45",
      servicio: "UTI",
      pd_numero: "TEST-MAPEO",
    })
    .select("*")
    .single();
  if (donanteErr || !donante) throw new Error("No se pudo crear donante: " + donanteErr?.message);
  const donanteId = (donante as Donante).id;
  console.log("donante_id:", donanteId);

  try {
    // Simula EXACTAMENTE lo que guardan MePanel + CertAuxPanel con el panel
    // completo lleno -- mismos campo_pdf, mismo planilla_key ("neuro").
    const neuroValores: Record<string, string> = {
      fecha_examen: "20/08/2026",
      causa_coma: "TEC grave",
      estudios_complementarios: "TAC: edema cerebral difuso, borramiento de cisternas de la base",
      arm_fecha_hs: "19/08/2026 22:00",
      arm_obligada: "Sí",

      hora_1a: "08:00",
      ta_tam_1a: "93",
      t_central_1a: "36.5",
      diabetes_insipida_1a_si: "si",
      pupilas_1a: "Midriáticas arreactivas",

      hora_2a: "10:15",
      ta_tam_2a: "91",
      t_central_2a: "36.2",
      diabetes_insipida_2a_no: "si",
      pupilas_2a: "Midriáticas arreactivas bilaterales",

      tipo_test_confirmacion: "apnea",
      apneica1_resultado: "negativa",
      apneica1_pco2_inicial: "38",
      apneica1_pco2_final: "62",
      apneica1_duracion: "9 min",

      cumple_me_si: "si",
      no_cumple_motivo: "N/A -- se probó igual para verificar el mapeo del campo de texto",

      eeg1_fecha: "20/08/2026",
      eeg1_hora: "07:30",
      eeg1_informe: "Silencio eléctrico cerebral",

      potenciales_fecha: "20/08/2026",
      potenciales_hora: "09:00",
      peat: "Ausencia de respuesta bilateral",
      pess: "Ausencia de respuesta bilateral",
      pev: "No realizado",
    };
    // Reflejos: 1ª evaluación todos ausentes salvo fotomotor presente;
    // 2ª evaluación todos ausentes salvo corneano presente -- prueba SI/NO
    // y que las 2 evaluaciones son independientes.
    for (const r of REFLEJOS_ME) {
      neuroValores[reflejoKey(r.key, "1a")] = r.key === "reflejo_fotomotor" ? "presente" : "ausente";
      neuroValores[reflejoKey(r.key, "2a")] = r.key === "reflejo_corneano" ? "presente" : "ausente";
    }

    await supabase
      .from("planilla_valores")
      .insert(Object.entries(neuroValores).map(([campo_pdf, valor]) => ({ donante_id: donanteId, planilla_key: "neuro", campo_pdf, valor })));

    console.log("--- Generar PDF ---");
    const doc = DOCUMENTOS.find((d) => d.key === "neuro")!;
    const bytes = await generarDocumentoPdf(supabase, doc, donante as Donante, null as unknown as Familiar);
    const outDoc = await PDFDocument.load(bytes);

    console.log("--- Verificar campo por campo ---");

    // Página 1
    assertTexto(outDoc, "nombre", "TEST MAPEO NEURO COMPLETO -- borrar");
    assertTexto(outDoc, "edad", "45");
    assertTexto(outDoc, "pd_numero", "TEST-MAPEO");
    assertTexto(outDoc, "causa_coma", neuroValores.causa_coma);
    assertTexto(outDoc, "arm_obligada", "Sí");
    assertTexto(outDoc, "arm_fecha_hs", neuroValores.arm_fecha_hs);
    assertTexto(outDoc, "estudios_complementarios", neuroValores.estudios_complementarios);

    // Página 2
    assertTexto(outDoc, "eeg1_fecha", neuroValores.eeg1_fecha);
    assertTexto(outDoc, "eeg1_hora", neuroValores.eeg1_hora);
    assertTexto(outDoc, "eeg1_informe", neuroValores.eeg1_informe);
    assertTexto(outDoc, "potenciales_fecha", neuroValores.potenciales_fecha);
    assertTexto(outDoc, "potenciales_hora", neuroValores.potenciales_hora);
    assertTexto(outDoc, "peat", neuroValores.peat);
    assertTexto(outDoc, "pess", neuroValores.pess);
    assertTexto(outDoc, "pev", neuroValores.pev);
    assertCheckbox(outDoc, "apneica1_positiva", false);
    assertCheckbox(outDoc, "apneica1_negativa", true);
    assertCheckbox(outDoc, "apneica1_indeterminada", false);
    assertTexto(outDoc, "apneica1_pco2_inicial", neuroValores.apneica1_pco2_inicial);
    assertTexto(outDoc, "apneica1_pco2_final", neuroValores.apneica1_pco2_final);
    assertTexto(outDoc, "apneica1_duracion", neuroValores.apneica1_duracion);
    assertCheckbox(outDoc, "cumple_me_si", true);
    assertCheckbox(outDoc, "cumple_me_no", false);
    assertTexto(outDoc, "no_cumple_motivo", neuroValores.no_cumple_motivo);

    // Página 3
    assertTexto(outDoc, "fecha_1a", neuroValores.fecha_examen);
    assertTexto(outDoc, "fecha_2a", neuroValores.fecha_examen);
    assertTexto(outDoc, "hora_1a", neuroValores.hora_1a);
    assertTexto(outDoc, "hora_2a", neuroValores.hora_2a);
    assertTexto(outDoc, "ta_tam_1a", neuroValores.ta_tam_1a);
    assertTexto(outDoc, "ta_tam_2a", neuroValores.ta_tam_2a);
    assertTexto(outDoc, "t_central_1a", neuroValores.t_central_1a);
    assertTexto(outDoc, "t_central_2a", neuroValores.t_central_2a);
    assertCheckbox(outDoc, "diabetes_insipida_1a_si", true);
    assertCheckbox(outDoc, "diabetes_insipida_1a_no", false);
    assertCheckbox(outDoc, "diabetes_insipida_2a_si", false);
    assertCheckbox(outDoc, "diabetes_insipida_2a_no", true);
    assertTexto(outDoc, "pupilas_1a", neuroValores.pupilas_1a);
    assertTexto(outDoc, "pupilas_2a", neuroValores.pupilas_2a);

    for (const r of REFLEJOS_ME) {
      const prefijo = REFLEJO_PDF_PREFIX[r.key];
      const esperado1aSi = r.key === "reflejo_fotomotor";
      const esperado2aSi = r.key === "reflejo_corneano";
      assertCheckbox(outDoc, `${prefijo}_1a_si`, esperado1aSi);
      assertCheckbox(outDoc, `${prefijo}_1a_no`, !esperado1aSi);
      assertCheckbox(outDoc, `${prefijo}_2a_si`, esperado2aSi);
      assertCheckbox(outDoc, `${prefijo}_2a_no`, !esperado2aSi);
    }

    // Campos que a propósito NO se capturan -- deben quedar en blanco.
    const debenQuedarEnBlanco = [
      "fondo_ojo",
      "observaciones_resto",
      "observaciones_l1",
      "droga1",
      "droga2",
      "otra_med_resto",
      "cb_union_neuromuscular",
      "movimientos_atipicos_1a_si",
      "movimientos_atipicos_1a_no",
      "movimientos_atipicos_2a_si",
      "movimientos_atipicos_2a_no",
      "observaciones_1a",
      "observaciones_2a",
    ];
    for (const campo of debenQuedarEnBlanco) {
      const esCheckbox = campo.startsWith("cb_") || campo.startsWith("movimientos_atipicos");
      if (esCheckbox) assertCheckbox(outDoc, campo, false);
      else assertTexto(outDoc, campo, "");
    }

    console.log("\n=== RESULTADOS ===");
    let ok = 0;
    let fail = 0;
    for (const r of resultados) {
      const marca = r.ok ? "OK" : "FALLO";
      if (r.ok) ok++;
      else fail++;
      console.log(`  ${marca}  ${r.campo}  esperado="${r.esperado}"  obtenido="${r.obtenido}"`);
    }
    console.log(`\nTotal: ${resultados.length}  OK: ${ok}  FALLO: ${fail}`);
    if (fail > 0) {
      console.log("\nCampos con FALLO:");
      for (const r of resultados.filter((r) => !r.ok)) console.log(`  - ${r.campo}: esperaba "${r.esperado}", obtuvo "${r.obtenido}"`);
    }
  } finally {
    console.log("\n--- Limpieza ---");
    await supabase.from("planilla_valores").delete().eq("donante_id", donanteId);
    await supabase.from("donantes").delete().eq("id", donanteId);
    console.log("Listo.");
  }
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
