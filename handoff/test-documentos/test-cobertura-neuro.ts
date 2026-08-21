import dotenv from "dotenv";
dotenv.config({ path: `${__dirname}/../../.env.local` });
dotenv.config({ path: `${__dirname}/../../.env` });
import fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";
import { DOCUMENTOS, resolverValoresPlanilla, rellenarCamposPdf } from "../../lib/procuracion/documentos-pdf";
import type { Donante, Familiar } from "../../lib/procuracion/types";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

async function main() {
  console.log("--- 1) Crear donante de prueba y simular todo lo que cargarían los paneles ---");
  const { data: donante, error: donanteErr } = await supabase
    .from("donantes")
    .insert({ nombre_completo: "TEST COBERTURA NEURO -- borrar", dni: "11223344", sexo: "masculino", servicio: "UTI", pd_numero: "TEST-COB" })
    .select("*")
    .single();
  if (donanteErr || !donante) throw new Error("No se pudo crear donante: " + donanteErr?.message);
  const donanteId = donante.id as string;
  console.log("donante_id:", donanteId);

  try {
    // Simula exactamente lo que guardarían MePanel y CertAuxPanel con el
    // panel completo lleno -- todos los campos NUEVOS de este pedido.
    const neuroValores: Record<string, string> = {
      hora_1a: "08:00",
      hora_2a: "10:00",
      tipo_test_confirmacion: "apnea",
      apneica1_pco2_inicial: "38",
      apneica1_pco2_final: "62",
      apneica1_duracion: "9 min",
      apneica1_complicaciones: "Ninguna",
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
      droga1: "Fentanilo",
      droga2: "Midazolam",
      otra_med_resto: "Sin relajantes musculares ni anticonvulsivos vigentes",
      arm_obligada: "Sí",
      arm_fecha_hs: "19/08/2026 22:00",
      fondo_ojo: "Sin alteraciones",
      cb_union_neuromuscular: "si",
      cb_electroestimulacion: "si",
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
    // reflejos -- 1 valor independiente por evaluación (ver reflejoKey en constants.ts)
    for (const r of ["reflejo_fotomotor", "reflejo_corneano", "reflejo_oculocefalico", "reflejo_oculovestibular", "reflejo_nauseoso", "reflejo_deglutorio", "reflejo_maseterino", "reflejo_dolor", "reflejo_osteotendinosos", "reflejo_plantar", "reflejo_cremasteriano", "reflejo_cutaneoabdominal"]) {
      neuroValores[`${r}_1a`] = "ausente";
      neuroValores[`${r}_2a`] = "ausente";
    }

    await supabase
      .from("planilla_valores")
      .insert(Object.entries(neuroValores).map(([campo_pdf, valor]) => ({ donante_id: donanteId, planilla_key: "neuro", campo_pdf, valor })));

    await supabase.from("planilla_valores").insert([
      { donante_id: donanteId, planilla_key: "certificado", campo_pdf: "medico1_nombre", valor: "Dr. Juan Gómez, M.P. 12345" },
      { donante_id: donanteId, planilla_key: "certificado", campo_pdf: "medico2_nombre", valor: "Dra. Ana Ruiz, M.P. 67890" },
      { donante_id: donanteId, planilla_key: "certificado", campo_pdf: "archivo_lugar", valor: "Archivo Central del Hospital" },
    ]);

    await supabase.from("planilla_valores").insert([
      { donante_id: donanteId, planilla_key: "doppler", campo_pdf: "fecha_dia", valor: "20" },
      { donante_id: donanteId, planilla_key: "doppler", campo_pdf: "fecha_mes", valor: "08" },
      { donante_id: donanteId, planilla_key: "doppler", campo_pdf: "fecha_anio", valor: "2026" },
      { donante_id: donanteId, planilla_key: "doppler", campo_pdf: "fecha_hora_top", valor: "11:00" },
      { donante_id: donanteId, planilla_key: "doppler", campo_pdf: "interpretacion_resto", valor: "Patrón compatible con paro circulatorio cerebral" },
    ]);

    console.log("\n--- 2) Generar los 3 documentos y contar cobertura real (campo con valor Y homónimo en el PDF) ---");
    for (const key of ["neuro", "certificado"]) {
      const doc = DOCUMENTOS.find((d) => d.key === key)!;
      const templatePath = path.join(__dirname, "../../public/forms/documentos", doc.archivo!);
      const bytes = fs.readFileSync(templatePath);
      const valores = await resolverValoresPlanilla(supabase, doc.planillaKeys, donante as Donante, null as unknown as Familiar);
      const outBytes = await rellenarCamposPdf(bytes, valores);
      const outDoc = await PDFDocument.load(outBytes);
      const totalCampos = outDoc.getForm().getFields().length;
      const nombresPdf = new Set(outDoc.getForm().getFields().map((f) => f.getName()));
      const cubiertos = [...valores.entries()].filter(([campo, v]) => v.valor && nombresPdf.has(campo));
      console.log(`\n${doc.nombre}: ${cubiertos.length} / ${totalCampos} campos del PDF cubiertos con datos reales.`);
      console.log(`  En blanco: ${totalCampos - cubiertos.length}`);
    }

    // Doppler no tiene DocumentoDef en DOCUMENTOS con ese planillaKey aislado
    // (su "informe" vive en la plantilla doppler_transcraneano.pdf) -- lo
    // contamos aparte usando la misma plantilla real.
    {
      const bytes = fs.readFileSync(path.join(__dirname, "../../public/forms/documentos/doppler_transcraneano.pdf"));
      const valores = await resolverValoresPlanilla(supabase, ["doppler"], donante as Donante, null as unknown as Familiar);
      const outDoc = await PDFDocument.load(await rellenarCamposPdf(bytes, valores));
      const totalCampos = outDoc.getForm().getFields().length;
      const nombresPdf = new Set(outDoc.getForm().getFields().map((f) => f.getName()));
      const cubiertos = [...valores.entries()].filter(([campo, v]) => v.valor && nombresPdf.has(campo));
      console.log(`\nProtocolo de Doppler: ${cubiertos.length} / ${totalCampos} campos del PDF cubiertos con datos reales.`);
      console.log(`  En blanco: ${totalCampos - cubiertos.length}`);
      console.log(`  Cubiertos: ${cubiertos.map(([c]) => c).join(", ")}`);
    }

    console.log("\n✅ Generación sin errores.");
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
