import dotenv from "dotenv";
dotenv.config({ path: `${__dirname}/../../.env.local` });
dotenv.config({ path: `${__dirname}/../../.env` });
import fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";
import { DOCUMENTOS, generarDocumentoPdf } from "../../lib/procuracion/documentos-pdf";
import type { Donante, Familiar } from "../../lib/procuracion/types";
import { REFLEJOS_ME } from "../../lib/procuracion/constants";

const originalFetch = global.fetch;
global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input.toString();
  if (url.startsWith("/forms/documentos/")) {
    return new Response(fs.readFileSync(path.join(__dirname, "../../public", url)));
  }
  return originalFetch(input, init);
}) as typeof fetch;

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

async function main() {
  console.log("--- Crear donante de prueba con TODOS los campos del panel completos ---");
  const { data: donante } = await supabase
    .from("donantes")
    .insert({ nombre_completo: "TEST COBERTURA FINAL -- borrar", dni: "55443322", sexo: "masculino", servicio: "UTI", pd_numero: "TEST-FINAL" })
    .select("*")
    .single();
  const donanteId = (donante as Donante).id;
  console.log("donante_id:", donanteId);

  try {
    const neuroValores: Record<string, string> = {
      hora_1a: "08:00",
      hora_2a: "10:00",
      tipo_test_confirmacion: "apnea",
      apneica1_pco2_inicial: "38",
      apneica1_pco2_final: "62",
      apneica1_duracion: "9 min",
      apneica1_complicaciones: "Ninguna",
      // apneica1_resultado sin definir -> default "Positiva"
      ta_tam_1a: "120/80 (TAM 93)",
      ta_tam_2a: "118/78 (TAM 91)",
      t_central_1a: "36.5",
      t_central_2a: "36.2",
      diabetes_insipida_1a_si: "si",
      diabetes_insipida_2a_no: "si",
      pupilas_1a: "Midriáticas arreactivas",
      pupilas_2a: "Midriáticas arreactivas",
      movimientos_atipicos_1a_no: "si",
      movimientos_atipicos_2a_no: "si",
      causa_coma: "TEC grave",
      estudios_complementarios: "TAC de cráneo: edema cerebral difuso",
      arm_obligada: "Sí",
      arm_fecha_hs: "19/08/2026 22:00",
      fondo_ojo: "Sin alteraciones",
      observaciones_resto: "Paciente estable hemodinámicamente durante la evaluación.",
      cumple_me_si: "si",
      eeg1_fecha: "20/08/2026",
      eeg1_hora: "07:30",
      eeg1_informe: "Silencio eléctrico cerebral",
      potenciales_fecha: "20/08/2026",
      potenciales_hora: "09:00",
      peat: "Ausencia de respuesta bilateral",
      pess: "Ausencia de respuesta bilateral",
      pev: "No realizado",
    };
    for (const r of REFLEJOS_ME) neuroValores[r.key] = "ausente";

    await supabase
      .from("planilla_valores")
      .insert(Object.entries(neuroValores).map(([campo_pdf, valor]) => ({ donante_id: donanteId, planilla_key: "neuro", campo_pdf, valor })));

    await supabase.from("planilla_valores").insert([
      { donante_id: donanteId, planilla_key: "certificado", campo_pdf: "medico1_nombre", valor: "Dr. Juan Gómez, M.P. 12345" },
      { donante_id: donanteId, planilla_key: "certificado", campo_pdf: "medico2_nombre", valor: "Dra. Ana Ruiz, M.P. 67890" },
      { donante_id: donanteId, planilla_key: "certificado", campo_pdf: "archivo_lugar", valor: "Archivo Central del Hospital" },
    ]);

    const doc = DOCUMENTOS.find((d) => d.key === "neuro")!;
    const bytes = await generarDocumentoPdf(supabase, doc, donante as Donante, null as unknown as Familiar);
    const outDoc = await PDFDocument.load(bytes);
    const form = outDoc.getForm();
    const total = form.getFields().length;

    let cubiertos = 0;
    const enBlanco: string[] = [];
    for (const f of form.getFields()) {
      const name = f.getName();
      let tieneValor = false;
      try {
        tieneValor = form.getCheckBox(name).isChecked();
      } catch {
        try {
          tieneValor = !!form.getTextField(name).getText();
        } catch {
          tieneValor = false;
        }
      }
      if (tieneValor) cubiertos++;
      else enBlanco.push(name);
    }

    console.log(`\nHistoria Clínica Neurológica: ${cubiertos} / ${total} campos cubiertos.`);
    console.log(`En blanco (${enBlanco.length}):`);
    console.log(enBlanco.join(", "));

    console.log("\n✅ OK");
  } finally {
    console.log("\n--- Limpieza ---");
    await supabase.from("donantes").delete().eq("id", donanteId);
    console.log("Listo.");
  }
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
