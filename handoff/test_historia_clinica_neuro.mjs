// Prueba puntual (no forma parte del feature) -- siembra datos reales de
// Certificación (Examen neurológico) para un donante de prueba, corre el
// generador NUEVO (@react-pdf/renderer) de punta a punta contra la base
// real, guarda el PDF a disco, y confirma con pdf-lib que:
//  1) es un PDF real generado desde cero (no un AcroForm)
//  2) NO tiene campos de formulario (getFields().length === 0)
//  3) el texto extraído no es la planilla escaneada vieja
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import { Font } from "@react-pdf/renderer";

// Solo para correr esto bajo Node puro (fuera del bundler de Next): el
// resolver ESM de Node rechaza el import dinámico de diccionarios de
// hyphenation por locale de @react-pdf/hyphenate (su package.json no
// declara ese subpath en "exports"). No afecta a la app real -- ahí
// corre empaquetado por Turbopack, que no hace esa resolución en
// runtime. Desactivar el hyphenation automático evita que se dispare.
Font.registerHyphenationCallback((word) => [word]);

function cargarEnv(path) {
  const out = {};
  for (const l of readFileSync(path, "utf8").split("\n")) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
const env = { ...cargarEnv(".env"), ...cargarEnv(".env.local") };
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const REFLEJOS = [
  "reflejo_fotomotor", "reflejo_corneano", "reflejo_oculocefalico", "reflejo_oculovestibular",
  "reflejo_nauseoso", "reflejo_deglutorio", "reflejo_maseterino", "reflejo_dolor",
  "reflejo_osteotendinosos", "reflejo_plantar", "reflejo_cremasteriano", "reflejo_cutaneoabdominal",
];

async function main() {
  const { data: donantes } = await supabase.from("donantes").select("*").limit(1);
  const donante = donantes[0];
  console.log("donante_id:", donante.id);

  const filasNeuro = [
    ["hora_1a", "08:00"], ["hora_2a", "09:15"],
    ["ta_tam_1a", "75"], ["ta_tam_2a", "78"],
    ["t_central_1a", "36.2"], ["t_central_2a", "36.4"],
    ["diabetes_insipida_1a_no", "si"], ["diabetes_insipida_2a_no", "si"],
    ["pupilas_1a", "Midriáticas arreactivas"], ["pupilas_2a", "Midriáticas arreactivas"],
    ["causa_coma", "HSA por aneurisma de comunicante anterior"],
    ["estudios_complementarios", "TAC de encéfalo: HSA difusa, edema cerebral"],
    ["arm_fecha_hs", "29/09/2026 07:30"],
    ["tipo_test_confirmacion", "apnea"],
    ["apneica1_pco2_inicial", "40"], ["apneica1_pco2_final", "68"],
    ["apneica1_duracion", "8 min"], ["apneica1_resultado", "positiva"],
    ["cumple_me_si", "si"],
    // Reflejos: 11 ausentes, 1 presente a propósito (para probar la excepción)
    ...REFLEJOS.slice(0, 11).flatMap((r) => [[`${r}_1a`, "ausente"], [`${r}_2a`, "ausente"]]),
    [`${REFLEJOS[11]}_1a`, "presente"], [`${REFLEJOS[11]}_2a`, "ausente"],
    ["eeg1_fecha", "29/09/2026"], ["eeg1_hora", "10:00"], ["eeg1_informe", "Silencio eléctrico cerebral"],
  ];

  for (const [campo_pdf, valor] of filasNeuro) {
    await supabase.from("planilla_valores").upsert(
      { donante_id: donante.id, planilla_key: "neuro", campo_pdf, valor },
      { onConflict: "donante_id,planilla_key,campo_pdf" }
    );
  }
  await supabase.from("planilla_valores").upsert(
    { donante_id: donante.id, planilla_key: "certificado", campo_pdf: "medico1_nombre", valor: "Dr. Juan Pérez" },
    { onConflict: "donante_id,planilla_key,campo_pdf" }
  );
  await supabase.from("planilla_valores").upsert(
    { donante_id: donante.id, planilla_key: "certificado", campo_pdf: "medico2_nombre", valor: "Dra. Ana López" },
    { onConflict: "donante_id,planilla_key,campo_pdf" }
  );
  await supabase.from("documentacion_estado").upsert(
    { donante_id: donante.id, categoria: "certificacion", item_key: "eeg", estado: "completo" },
    { onConflict: "donante_id,categoria,item_key" }
  );
  console.log("Datos de prueba sembrados.");

  // Requiere empaquetar primero (Node puro no resuelve algunas
  // sub-rutas privadas de @react-pdf/hyphenate y pdfkit que sí resuelve
  // Turbopack en la app real):
  //   npx esbuild lib/procuracion/documentos-nuevos/HistoriaClinicaNeurologica.tsx \
  //     --bundle --platform=node --format=esm \
  //     --outfile=handoff/_bundled_neuro_doc.mjs \
  //     --external:@supabase/supabase-js --external:pdfkit --jsx=automatic
  const { generarHistoriaClinicaNeurologicaPdf } = await import("./_bundled_neuro_doc.mjs");
  const blob = await generarHistoriaClinicaNeurologicaPdf(supabase, donante);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const outPath = "./handoff/test_historia_clinica_neuro_output.pdf";
  writeFileSync(outPath, bytes);
  console.log(`PDF generado: ${outPath} (${bytes.length} bytes)`);

  const pdfDoc = await PDFDocument.load(bytes);
  const form = pdfDoc.getForm();
  const campos = form.getFields();
  console.log("Páginas:", pdfDoc.getPageCount());
  console.log("Campos de formulario (AcroForm):", campos.length, campos.length === 0 ? "-- correcto, es texto renderizado, no un formulario" : "-- MAL, sigue siendo un AcroForm");

  // Limpieza de los datos de prueba sembrados
  for (const [campo_pdf] of filasNeuro) {
    await supabase.from("planilla_valores").delete().eq("donante_id", donante.id).eq("planilla_key", "neuro").eq("campo_pdf", campo_pdf);
  }
  await supabase.from("planilla_valores").delete().eq("donante_id", donante.id).eq("planilla_key", "certificado").eq("campo_pdf", "medico1_nombre");
  await supabase.from("planilla_valores").delete().eq("donante_id", donante.id).eq("planilla_key", "certificado").eq("campo_pdf", "medico2_nombre");
  await supabase.from("documentacion_estado").delete().eq("donante_id", donante.id).eq("categoria", "certificacion").eq("item_key", "eeg");
  console.log("Limpieza de datos de prueba OK (el PDF de salida queda en disco para inspección).");
}

main().catch((e) => {
  console.error("FALLÓ:", e);
  process.exit(1);
});
