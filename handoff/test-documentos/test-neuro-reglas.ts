import dotenv from "dotenv";
dotenv.config({ path: `${__dirname}/../../.env.local` });
dotenv.config({ path: `${__dirname}/../../.env` });
import fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";
import { DOCUMENTOS, resolverValoresPlanilla, rellenarCamposPdf, generarDocumentoPdf } from "../../lib/procuracion/documentos-pdf";
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

async function checkField(outDoc: PDFDocument, name: string, esperado: boolean) {
  const form = outDoc.getForm();
  let marcado = false;
  try {
    marcado = form.getCheckBox(name).isChecked();
  } catch {
    throw new Error(`Campo checkbox no encontrado: ${name}`);
  }
  const ok = marcado === esperado;
  console.log(`  ${ok ? "OK" : "FALLO"}: ${name} = ${marcado} (esperado ${esperado})`);
  if (!ok) throw new Error(`FALLO verificando ${name}`);
}

async function main() {
  console.log("--- Crear donante de prueba ---");
  const { data: donante } = await supabase
    .from("donantes")
    .insert({ nombre_completo: "TEST REGLAS NEURO -- borrar", dni: "99887766", sexo: "masculino", servicio: "UTI", pd_numero: "TEST-REGLAS" })
    .select("*")
    .single();
  const donanteId = (donante as Donante).id;
  console.log("donante_id:", donanteId);

  try {
    // --- Caso 1: apnea sin resultado explícito -> default Positiva ---
    console.log("\n=== Caso 1: apnea, sin apneica1_resultado -> debe marcar Positiva por defecto ===");
    await supabase.from("planilla_valores").insert([
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "tipo_test_confirmacion", valor: "apnea" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "apneica1_pco2_inicial", valor: "38" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "apneica1_pco2_final", valor: "62" },
    ]);
    {
      const doc = DOCUMENTOS.find((d) => d.key === "neuro")!;
      const bytes = await generarDocumentoPdf(supabase, doc, donante as Donante, null as unknown as Familiar);
      const outDoc = await PDFDocument.load(bytes);
      await checkField(outDoc, "apneica1_positiva", true);
      await checkField(outDoc, "apneica1_negativa", false);
      await checkField(outDoc, "apneica1_indeterminada", false);
    }

    // --- Caso 2: apnea con resultado explícito "negativa" ---
    console.log("\n=== Caso 2: apnea con apneica1_resultado='negativa' ===");
    await supabase.from("planilla_valores").upsert(
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "apneica1_resultado", valor: "negativa" },
      { onConflict: "donante_id,planilla_key,campo_pdf" }
    );
    {
      const doc = DOCUMENTOS.find((d) => d.key === "neuro")!;
      const bytes = await generarDocumentoPdf(supabase, doc, donante as Donante, null as unknown as Familiar);
      const outDoc = await PDFDocument.load(bytes);
      await checkField(outDoc, "apneica1_positiva", false);
      await checkField(outDoc, "apneica1_negativa", true);
    }

    // --- Caso 3: atropina -> vuelca en Otros exámenes ---
    console.log("\n=== Caso 3: atropina -> debe volcarse en otros_examenes_* ===");
    await supabase.from("planilla_valores").upsert(
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "tipo_test_confirmacion", valor: "atropina" },
      { onConflict: "donante_id,planilla_key,campo_pdf" }
    );
    await supabase.from("planilla_valores").insert([
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "fc_inicial", valor: "70" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "fc_final", valor: "72" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "atropina_fecha", valor: "21/08/2026" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "atropina_hora", valor: "10:00" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "atropina_duracion", valor: "5 min" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "atropina_complicaciones", valor: "Ninguna" },
    ]);
    {
      const doc = DOCUMENTOS.find((d) => d.key === "neuro")!;
      const bytes = await generarDocumentoPdf(supabase, doc, donante as Donante, null as unknown as Familiar);
      const outDoc = await PDFDocument.load(bytes);
      const form = outDoc.getForm();
      const resto = form.getTextField("otros_examenes_resto").getText();
      const fecha = form.getTextField("otros_examenes_fecha").getText();
      const hora = form.getTextField("otros_examenes_hora").getText();
      console.log(`  otros_examenes_fecha="${fecha}" otros_examenes_hora="${hora}"`);
      console.log(`  otros_examenes_resto="${resto}"`);
      if (fecha !== "21/08/2026" || hora !== "10:00" || !resto?.includes("70") || !resto?.includes("72")) {
        throw new Error("FALLO: atropina no se volcó correctamente en Otros exámenes");
      }
      console.log("  OK");
    }

    // --- Caso 4: reflejos -> 48 casilleros reales, 1ª y 2ª evaluación independientes ---
    console.log("\n=== Caso 4: reflejos -> deben volcarse en los 48 casilleros reales, cada evaluación con su propio valor ===");
    await supabase.from("planilla_valores").insert([
      ...REFLEJOS_ME.map((r, i) => ({
        donante_id: donanteId,
        planilla_key: "neuro",
        campo_pdf: reflejoKey(r.key, "1a"),
        valor: i % 2 === 0 ? "ausente" : "presente",
      })),
      ...REFLEJOS_ME.map((r, i) => ({
        donante_id: donanteId,
        planilla_key: "neuro",
        campo_pdf: reflejoKey(r.key, "2a"),
        // deliberadamente invertido respecto a la 1ª, para probar que no comparten estado
        valor: i % 2 === 0 ? "presente" : "ausente",
      })),
    ]);
    {
      const doc = DOCUMENTOS.find((d) => d.key === "neuro")!;
      const bytes = await generarDocumentoPdf(supabase, doc, donante as Donante, null as unknown as Familiar);
      const outDoc = await PDFDocument.load(bytes);
      for (const [i, r] of REFLEJOS_ME.entries()) {
        const prefijo = REFLEJO_PDF_PREFIX[r.key];
        const esperado1aSi = i % 2 !== 0; // presente
        const esperado2aSi = i % 2 === 0; // presente (invertido)
        await checkField(outDoc, `${prefijo}_1a_si`, esperado1aSi);
        await checkField(outDoc, `${prefijo}_1a_no`, !esperado1aSi);
        await checkField(outDoc, `${prefijo}_2a_si`, esperado2aSi);
        await checkField(outDoc, `${prefijo}_2a_no`, !esperado2aSi);
      }
    }

    // --- Caso 5: fecha del encabezado (automática) vs. fecha del examen (cargada) ---
    console.log("\n=== Caso 5: fecha_dia automática, fecha_1a/2a en blanco sin fecha_examen ===");
    {
      const doc = DOCUMENTOS.find((d) => d.key === "neuro")!;
      const bytes = await generarDocumentoPdf(supabase, doc, donante as Donante, null as unknown as Familiar);
      const outDoc = await PDFDocument.load(bytes);
      const form = outDoc.getForm();
      const dia = form.getTextField("fecha_dia").getText();
      const fecha1a = form.getTextField("fecha_1a").getText();
      console.log(`  fecha_dia="${dia}" fecha_1a="${fecha1a}"`);
      if (!dia) throw new Error("FALLO: fecha automática del encabezado no generada");
      if (fecha1a) throw new Error("FALLO: fecha_1a no debería tener valor sin fecha_examen cargado");
      console.log("  OK");
    }

    console.log("\n=== Caso 6: fecha_examen cargado -> vuelca en fecha_1a y fecha_2a ===");
    await supabase.from("planilla_valores").insert({ donante_id: donanteId, planilla_key: "neuro", campo_pdf: "fecha_examen", valor: "20/08/2026" });
    {
      const doc = DOCUMENTOS.find((d) => d.key === "neuro")!;
      const bytes = await generarDocumentoPdf(supabase, doc, donante as Donante, null as unknown as Familiar);
      const outDoc = await PDFDocument.load(bytes);
      const form = outDoc.getForm();
      const fecha1a = form.getTextField("fecha_1a").getText();
      const fecha2a = form.getTextField("fecha_2a").getText();
      console.log(`  fecha_1a="${fecha1a}" fecha_2a="${fecha2a}"`);
      if (fecha1a !== "20/08/2026" || fecha2a !== "20/08/2026") throw new Error("FALLO: fecha_examen no se volcó en fecha_1a/fecha_2a");
      console.log("  OK");
    }

    // --- Cobertura final ---
    console.log("\n--- Cobertura final de Historia Clínica Neurológica ---");
    const doc = DOCUMENTOS.find((d) => d.key === "neuro")!;
    const templatePath = path.join(__dirname, "../../public/forms/documentos", doc.archivo!);
    const templateBytes = fs.readFileSync(templatePath);
    const valores = await resolverValoresPlanilla(supabase, doc.planillaKeys, donante as Donante, null as unknown as Familiar);
    // aplicarReglasNeuro no está exportada aparte -- generamos con la función pública y releemos
    const outBytes = await generarDocumentoPdf(supabase, doc, donante as Donante, null as unknown as Familiar);
    const outDoc = await PDFDocument.load(outBytes);
    const totalCampos = outDoc.getForm().getFields().length;
    const marcados = outDoc.getForm().getFields().filter((f) => {
      try {
        const cb = outDoc.getForm().getCheckBox(f.getName());
        return cb.isChecked();
      } catch {
        try {
          const tf = outDoc.getForm().getTextField(f.getName());
          return !!tf.getText();
        } catch {
          return false;
        }
      }
    }).length;
    console.log(`Total campos del PDF: ${totalCampos}`);
    console.log(`Campos con contenido tras generar (checkbox marcado o texto no vacío): ${marcados}`);
    console.log(`En blanco: ${totalCampos - marcados}`);
    void templateBytes;
    void rellenarCamposPdf;
    void valores;

    console.log("\n✅ Todas las reglas verificadas correctamente.");
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
