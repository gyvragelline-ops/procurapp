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
  console.log("--- 1) Crear donante de prueba con datos parciales en neuro/certificado/op2_p3 ---");
  const { data: donante, error: donanteErr } = await supabase
    .from("donantes")
    .insert({ nombre_completo: "TEST DOC PANEL -- borrar", dni: "12345678", sexo: "masculino", servicio: "UTI", pd_numero: "TEST-DOC" })
    .select("*")
    .single();
  if (donanteErr || !donante) throw new Error("No se pudo crear donante: " + donanteErr?.message);
  const donanteId = donante.id as string;
  console.log("donante_id:", donanteId);

  try {
    await supabase.from("planilla_valores").insert([
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "hora_evaluacion_1", valor: "14:00" },
      { donante_id: donanteId, planilla_key: "neuro", campo_pdf: "hora_evaluacion_2", valor: "20:00" },
      { donante_id: donanteId, planilla_key: "op2_p3", campo_pdf: "lab_Hematocrito_extraccion1", valor: "38 %" },
    ]);
    const { data: familiar } = await supabase
      .from("familiares")
      .insert({ donante_id: donanteId, nombre: "Maria Perez", dni: "87654321", edad: "52", parentesco: "Madre", direccion: "Calle Falsa 123", telefono: "1122334455" })
      .select("*")
      .single();

    for (const doc of DOCUMENTOS) {
      console.log(`\n=== ${doc.nombre} (${doc.key}) ===`);
      if (!doc.archivo) {
        console.log("  Sin plantilla -- se omite (esperado para 'coord_donante').");
        continue;
      }
      const templatePath = path.join(__dirname, "../../public/forms/documentos", doc.archivo);
      const bytes = fs.readFileSync(templatePath);
      const valores = doc.planillaKeys.length > 0 ? await resolverValoresPlanilla(supabase, doc.planillaKeys, donante as Donante, familiar as Familiar) : new Map();
      console.log(`  Campos con valor resuelto: ${[...valores.entries()].filter(([, v]) => v.valor).length} / ${valores.size} totales`);

      const outBytes = await rellenarCamposPdf(bytes, valores);
      const outDoc = await PDFDocument.load(outBytes);
      const form = outDoc.getForm();
      const nombresPdf = new Set(form.getFields().map((f) => f.getName()));

      function leer(campo: string): string {
        try {
          return form.getTextField(campo).getText() ?? "";
        } catch {
          return "(no es campo de texto -- probablemente checkbox)";
        }
      }

      // Reporta cuántos de los campos que SÍ tenían valor resuelto además
      // existen como campo real en esta plantilla -- ese es el verdadero
      // "match" (nombre de campo_mapeo == nombre de campo del PDF).
      const conValor = [...valores.entries()].filter(([, v]) => v.valor);
      const matchReal = conValor.filter(([campo]) => nombresPdf.has(campo));
      console.log(`  De los ${conValor.length} con valor resuelto, ${matchReal.length} matchean un campo real del PDF.`);
      for (const [campo, v] of matchReal) {
        console.log(`    ✓ ${campo} = "${v.valor}" -> en el PDF: "${leer(campo)}"`);
      }
      const sinMatch = conValor.filter(([campo]) => !nombresPdf.has(campo));
      if (sinMatch.length > 0) {
        console.log(`  (${sinMatch.length} con valor pero SIN campo homónimo en esta plantilla -- quedan sin efecto: ${sinMatch.map(([c]) => c).join(", ")})`);
      }

      if (doc.key === "certificado" && matchReal.length === 0) throw new Error("FALLO: certificado no matcheó ningún campo -- se esperaba al menos nombre/dni/sexo.");
      if (doc.key === "op2_completo" && matchReal.length === 0) throw new Error("FALLO: op2_completo no matcheó ningún campo -- se esperaba lab_Hematocrito_extraccion1.");
      if (doc.key === "coord_familia" && matchReal.length < 6) throw new Error(`FALLO: coord_familia matcheó solo ${matchReal.length}/6 -- se esperaban los 6 datos del familiar.`);

      console.log("  OK -- PDF generado sin errores (aunque algunos campos no tengan homónimo todavía).");
    }

    console.log("\n✅ TODO OK");
  } finally {
    console.log("\n--- Limpieza: borrando donante de prueba ---");
    await supabase.from("donantes").delete().eq("id", donanteId);
    console.log("Listo.");
  }
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
