import dotenv from "dotenv";
dotenv.config({ path: `${__dirname}/../../.env.local` });
dotenv.config({ path: `${__dirname}/../../.env` });
import fs from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import {
  guardarValorLaboratorio,
  cargarCamposOP2Detectados,
  cargarBibliotecaAbierta,
  EXTRACCION_COLS,
} from "../../lib/procuracion/laboratorio";

const anthropic = new Anthropic();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

const ExtraccionSchema = z.object({
  items: z.array(z.object({ parametro: z.string(), valor: z.string(), unidad: z.string().nullable() })),
});

async function main() {
  console.log("--- 1) Extracción con Claude Opus 4.8 sobre foto de prueba ---");
  const imageBase64 = fs.readFileSync(`${__dirname}/foto_prueba.jpg`).toString("base64");

  const response = await anthropic.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: zodOutputFormat(ExtraccionSchema) },
    system:
      "Sos un asistente que lee fotos de resultados de laboratorio o de pedidos de estudios, tomadas con el celular por un procurador de órganos, muchas veces con letra chica, hojas superpuestas, mala luz o encuadre torcido. Tu tarea es extraer TODOS los parámetros con valor numérico o de texto que puedas leer con confianza razonable, cada uno como un ítem separado.\n\nPara cada ítem devolvé:\n- 'parametro': el nombre del parámetro tal como aparece impreso o escrito en la foto (no lo traduzcas, no lo normalices, copiá el nombre real, incluyendo abreviaturas si así aparece).\n- 'valor': el valor tal como está escrito (número o texto).\n- 'unidad': la unidad si está indicada en la hoja (ej. 'mg/dL', '%', 'UI/L'), o null si no hay unidad visible.\n\nNo inventes valores que no puedas leer con confianza. Si un número es ambiguo (por mala calidad de imagen), no lo incluyas. Si la foto no tiene ningún dato de laboratorio legible, devolvé una lista vacía.",
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } },
          { type: "text", text: "Extraé todos los parámetros de laboratorio o de estudio legibles en esta foto." },
        ],
      },
    ],
  });

  const items = response.parsed_output?.items ?? [];
  console.log("Items extraídos:", JSON.stringify(items, null, 2));
  if (items.length === 0) throw new Error("La IA no extrajo ningún item -- no se puede continuar el test.");

  console.log("\n--- 2) Crear donante de prueba ---");
  const { data: donante, error: donanteErr } = await supabase
    .from("donantes")
    .insert({ nombre_completo: "TEST LAB FLOW -- borrar", servicio: "Test", pd_numero: "TEST-000" })
    .select("id")
    .single();
  if (donanteErr || !donante) throw new Error("No se pudo crear donante de prueba: " + donanteErr?.message);
  const donanteId = donante.id as string;
  console.log("donante_id de prueba:", donanteId);

  try {
    console.log("\n--- 3) Guardar cada item extraído (matching + escritura) ---");
    for (const item of items) {
      const resultado = await guardarValorLaboratorio(supabase, donanteId, item, "https://example.com/fake.jpg");
      console.log(`  "${item.parametro}" ->`, resultado);
    }

    console.log("\n--- 4) Verificar campos OP2 detectados ---");
    const camposOP2 = await cargarCamposOP2Detectados(supabase, donanteId);
    console.log(JSON.stringify(camposOP2, null, 2));

    console.log("\n--- 5) Verificar biblioteca abierta ---");
    const biblioteca = await cargarBibliotecaAbierta(supabase, donanteId);
    console.log(JSON.stringify(biblioteca, null, 2));

    console.log("\n--- 6) Test de bloqueo: llenar las 5 columnas de Hematocrito y probar un 6to valor ---");
    for (const col of EXTRACCION_COLS) {
      await supabase.from("planilla_valores").upsert(
        { donante_id: donanteId, planilla_key: "op2_p3", campo_pdf: `lab_Hematocrito_${col}`, valor: "40" },
        { onConflict: "donante_id,planilla_key,campo_pdf" }
      );
    }
    const resultadoBloqueo = await guardarValorLaboratorio(
      supabase,
      donanteId,
      { parametro: "Hto", valor: "99", unidad: "%" },
      null
    );
    console.log("Resultado del 6to valor de Hematocrito:", resultadoBloqueo);
    if (resultadoBloqueo.tipo !== "bloqueado") throw new Error("FALLO: se esperaba tipo 'bloqueado'");

    const { data: hematocritoRows } = await supabase
      .from("planilla_valores")
      .select("campo_pdf, valor")
      .eq("donante_id", donanteId)
      .like("campo_pdf", "lab_Hematocrito_%");
    console.log("Filas de Hematocrito tras el intento bloqueado (debe seguir habiendo 5, todas en '40'):");
    console.log(JSON.stringify(hematocritoRows, null, 2));
    if ((hematocritoRows ?? []).some((r: { valor: string | null }) => r.valor === "99")) {
      throw new Error("FALLO: el valor bloqueado se guardó igual -- no debería haber pasado.");
    }

    const { data: bibliotecaTrasBloqueo } = await supabase
      .from("laboratorio_biblioteca")
      .select("*")
      .eq("donante_id", donanteId)
      .eq("parametro", "Hto");
    console.log("Filas en biblioteca_abierta con parametro='Hto' (debe ser 0 -- no debe filtrar al bloquearse):");
    console.log(JSON.stringify(bibliotecaTrasBloqueo, null, 2));
    if ((bibliotecaTrasBloqueo ?? []).length > 0) {
      throw new Error("FALLO: el valor bloqueado terminó en biblioteca_abierta -- no debería haber pasado.");
    }

    console.log("\n✅ TODO OK");
  } finally {
    console.log("\n--- Limpieza: borrando donante de prueba (cascada) ---");
    await supabase.from("donantes").delete().eq("id", donanteId);
    console.log("Listo.");
  }
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
