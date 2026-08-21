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
  console.log("--- Crear donante de prueba ---");
  const { data: donante } = await supabase
    .from("donantes")
    .insert({ nombre_completo: "TEST SINTESIS EVAL -- borrar", dni: "44556677", sexo: "masculino", servicio: "UTI", pd_numero: "TEST-SINT" })
    .select("*")
    .single();
  const donanteId = (donante as Donante).id;
  console.log("donante_id:", donanteId);

  try {
    // Simula lo que hace saveField/setSiNoPar en el panel: guarda 1a Y
    // copia a 2a porque 2a está vacío (comportamiento ya implementado
    // client-side; acá probamos el resultado final tal cual quedaría).
    await supabase.from("planilla_valores").insert([
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "hora_1a", valor: "08:00" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "hora_2a", valor: "09:00" }, // auto (08:00+1h)
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "ta_tam_1a", valor: "120/80" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "ta_tam_2a", valor: "120/80" }, // copiado
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "t_central_1a", valor: "36.5" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "t_central_2a", valor: "36.5" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "pupilas_1a", valor: "Midriáticas" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "pupilas_2a", valor: "Midriáticas" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "diabetes_insipida_1a_si", valor: "si" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "diabetes_insipida_2a_si", valor: "si" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "causa_coma", valor: "TEC grave" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "estudios_complementarios", valor: "TAC: edema difuso" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "arm_obligada", valor: "Sí" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "arm_fecha_hs", valor: "19/08/2026 22:00" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "tipo_test_confirmacion", valor: "apnea" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "apneica1_pco2_inicial", valor: "38" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "apneica1_pco2_final", valor: "62" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "apneica1_duracion", valor: "9 min" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "cumple_me_si", valor: "si" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "eeg1_fecha", valor: "20/08/2026" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "eeg1_hora", valor: "07:30" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "eeg1_informe", valor: "Silencio eléctrico" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "potenciales_fecha", valor: "20/08/2026" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "potenciales_hora", valor: "09:00" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "peat", valor: "Ausente bilateral" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "pess", valor: "Ausente bilateral" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "pev", valor: "No realizado" },
    ]);
    for (const r of REFLEJOS_ME) {
      await supabase.from("planilla_valores").insert({ donante_id: donanteId, planilla_key: "neuro", campo_pdf: r.key, valor: "ausente" });
    }

    await supabase.from("planilla_valores").insert([
      { donante_id: donanteId, planilla_key: "certificado", campo_pdf: "medico1_nombre", valor: "Juan Gómez" },
      { donante_id: donanteId, planilla_key: "certificado", campo_pdf: "medico2_nombre", valor: "Ana Ruiz" },
      { donante_id: donanteId, planilla_key: "certificado", campo_pdf: "archivo_lugar", valor: "Archivo Central" },
    ]);

    console.log("\n--- Verificar rol automático del médico 2 en Certificado ---");
    {
      const doc = DOCUMENTOS.find((d) => d.key === "certificado")!;
      const bytes = await generarDocumentoPdf(supabase, doc, donante as Donante, null as unknown as Familiar);
      const outDoc = await PDFDocument.load(bytes);
      const m1 = outDoc.getForm().getTextField("medico1_nombre").getText();
      const m2 = outDoc.getForm().getTextField("medico2_nombre").getText();
      console.log(`  medico1_nombre="${m1}"`);
      console.log(`  medico2_nombre="${m2}"`);
      if (m1 !== "Juan Gómez") throw new Error("FALLO: médico 1 no debe llevar etiqueta de rol");
      if (m2 !== "Neurólogo/Neurocirujano: Ana Ruiz") throw new Error("FALLO: médico 2 no llevó la etiqueta esperada");
      console.log("  OK");
    }

    console.log("\n--- Verificar campos removidos NO se envían (droga1/complicaciones/fondo_ojo/observaciones/movimientos) ---");
    const removidos = ["droga1", "droga2", "otra_med_resto", "cb_union_neuromuscular", "cb_electroestimulacion", "fondo_ojo", "observaciones_resto", "apneica1_complicaciones", "atropina_complicaciones", "movimientos_atipicos_1a_si", "movimientos_atipicos_1a_no"];
    const { data: existentes } = await supabase
      .from("planilla_valores")
      .select("campo_pdf")
      .eq("donante_id", donanteId)
      .eq("planilla_key", "neuro")
      .in("campo_pdf", removidos);
    console.log(`  Filas encontradas para campos removidos (debe ser 0): ${(existentes ?? []).length}`);
    if ((existentes ?? []).length > 0) throw new Error("FALLO: hay datos guardados en campos que deberían estar removidos");

    console.log("\n--- Cobertura final de Historia Clínica Neurológica ---");
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
    console.log(`Historia Clínica Neurológica: ${cubiertos} / ${total} campos cubiertos.`);
    console.log(`En blanco (${enBlanco.length}): ${enBlanco.join(", ")}`);

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
