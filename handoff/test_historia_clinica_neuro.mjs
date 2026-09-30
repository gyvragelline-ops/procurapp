// Prueba puntual (no forma parte del feature) -- crea un donante de
// prueba PROPIO y descartable (nunca toca donantes reales/compartidos:
// esto reemplaza la versión anterior, que reusaba el primer donante de
// la tabla y por eso pudo haber pisado datos reales de Gelline al
// correr upsert+delete sobre los mismos campo_pdf que un usuario real
// carga -- ver conversación). Siembra datos reales de Certificación
// (Examen neurológico), corre el generador NUEVO de punta a punta
// contra la base real, guarda el PDF a disco, confirma con pdf-lib que
// es texto renderizado (no AcroForm), y borra el donante de prueba
// entero al final (cascade se lleva sus planilla_valores con él).
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";

function cargarEnv(path) {
  const out = {};
  for (const l of readFileSync(path, "utf8").split("\n")) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
const env = { ...cargarEnv(".env"), ...cargarEnv(".env.local") };
// Service role a propósito acá (no anon): así el insert/delete del
// donante de prueba no depende de ninguna política de RLS que pueda
// cambiar, y queda 100% aislado de cualquier sesión real.
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const REFLEJOS = [
  "reflejo_fotomotor", "reflejo_corneano", "reflejo_oculocefalico", "reflejo_oculovestibular",
  "reflejo_nauseoso", "reflejo_deglutorio", "reflejo_maseterino", "reflejo_dolor",
  "reflejo_osteotendinosos", "reflejo_plantar", "reflejo_cremasteriano", "reflejo_cutaneoabdominal",
];

async function main() {
  const insDonante = await supabase
    .from("donantes")
    .insert({ nombre_completo: "ZZZ_TEST_NO_USAR (script automático)", dni: "00000000", institucion: "Hospital de prueba", tipo_procuracion: "multiorganico" })
    .select()
    .single();
  if (insDonante.error) throw new Error("crear donante de prueba: " + insDonante.error.message);
  const donante = insDonante.data;
  console.log("donante de prueba creado:", donante.id, "-- se borra entero al final");

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
    // Caso A: 11 ausentes, 1 presente (prueba la excepción puntual)
    ...REFLEJOS.slice(0, 11).flatMap((r) => [[`${r}_1a`, "ausente"]]),
    [`${REFLEJOS[11]}_1a`, "presente"],
    // Caso B (2ª evaluación): NINGÚN reflejo marcado -- prueba que ya no
    // diga "0/12 ausentes" sino "Sin datos cargados".
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
  console.log("Datos de prueba sembrados (donante propio, no comparte nada con datos reales).");

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
  console.log("Campos de formulario (AcroForm):", campos.length, campos.length === 0 ? "-- correcto" : "-- MAL, sigue siendo un AcroForm");

  // Borra el donante de prueba ENTERO (cascade se lleva planilla_valores
  // y documentacion_estado con él) -- nada real tocado en ningún momento.
  await supabase.from("donantes").delete().eq("id", donante.id);
  console.log("Donante de prueba borrado por completo. El PDF de salida queda en disco para inspección.");
}

main().catch((e) => {
  console.error("FALLÓ:", e);
  process.exit(1);
});
