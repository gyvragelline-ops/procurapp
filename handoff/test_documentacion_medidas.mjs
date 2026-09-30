// Prueba puntual (no forma parte del feature) -- reproduce, con la ANON
// key (misma que usa el navegador), los 3 caminos nuevos: foto de DNI,
// botón "Marcar como completo" de Medidas, y guardado de una medida.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import sharp from "sharp";

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

async function main() {
  const { data: donantes } = await supabase.from("donantes").select("id, peso, talla").limit(1);
  const donanteId = donantes[0].id;
  console.log("donante_id:", donanteId);

  // === 1) Foto de DNI (mismo camino que DocumentacionFotosPanel) ===
  const svg = `<svg width='500' height='300' xmlns='http://www.w3.org/2000/svg'><rect width='100%' height='100%' fill='#ddd'/><text x='20' y='50' font-size='22'>DNI - prueba</text></svg>`;
  const jpg = await sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
  const stamp = Date.now();
  const path = `${donanteId}/doc-dni-${stamp}.jpg`;
  const up = await supabase.storage.from("estudios-imagenes").upload(path, jpg, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error("upload foto DNI: " + up.error.message);
  const pub = supabase.storage.from("estudios-imagenes").getPublicUrl(path).data.publicUrl;
  const ins = await supabase.from("documentacion_fotos").insert({ donante_id: donanteId, tipo: "dni", archivo_url: pub, mime_type: "image/jpeg" }).select().single();
  if (ins.error) throw new Error("insert documentacion_fotos: " + ins.error.message);
  console.log("OK foto DNI:", ins.data.id);

  const upEstado = await supabase.from("documentacion_estado").upsert(
    { donante_id: donanteId, categoria: "documentacion", item_key: "foto_dni", estado: "si" },
    { onConflict: "donante_id,categoria,item_key" }
  );
  if (upEstado.error) throw new Error("sync estado foto_dni: " + upEstado.error.message);
  console.log("OK chip foto_dni sincronizado a 'si'");

  // === 2) Medidas antropométricas: Marcar como completo ===
  const upMed = await supabase.from("documentacion_estado").upsert(
    { donante_id: donanteId, categoria: "medidas", item_key: "completo", estado: "si" },
    { onConflict: "donante_id,categoria,item_key" }
  );
  if (upMed.error) throw new Error("marcar medidas completo: " + upMed.error.message);
  const { data: leidoMed } = await supabase
    .from("documentacion_estado")
    .select("estado")
    .eq("donante_id", donanteId)
    .eq("categoria", "medidas")
    .eq("item_key", "completo")
    .maybeSingle();
  console.log("OK Medidas marcadas como completo, estado leído:", leidoMed.estado);

  // === 3) Una medida real: Línea esternal (planilla_valores) + Peso (donantes.peso) ===
  const upPlanilla = await supabase.from("planilla_valores").upsert(
    { donante_id: donanteId, planilla_key: "op2_p2", campo_pdf: "l_esternal", valor: "18" },
    { onConflict: "donante_id,planilla_key,campo_pdf" }
  );
  if (upPlanilla.error) throw new Error("guardar l_esternal: " + upPlanilla.error.message);
  const upPeso = await supabase.from("donantes").update({ peso: 72 }).eq("id", donanteId).select("peso").single();
  if (upPeso.error) throw new Error("guardar peso: " + upPeso.error.message);
  console.log("OK Línea esternal guardada, Peso actualizado a:", upPeso.data.peso);

  // Limpieza
  await supabase.from("documentacion_fotos").delete().eq("id", ins.data.id);
  await supabase.storage.from("estudios-imagenes").remove([path]);
  await supabase.from("documentacion_estado").delete().eq("donante_id", donanteId).eq("categoria", "documentacion").eq("item_key", "foto_dni");
  await supabase.from("documentacion_estado").delete().eq("donante_id", donanteId).eq("categoria", "medidas").eq("item_key", "completo");
  await supabase.from("planilla_valores").delete().eq("donante_id", donanteId).eq("planilla_key", "op2_p2").eq("campo_pdf", "l_esternal");
  await supabase.from("donantes").update({ peso: donantes[0].peso }).eq("id", donanteId);
  console.log("Limpieza OK (peso restaurado a su valor original:", donantes[0].peso, ").");
}

main().catch((e) => {
  console.error("FALLÓ:", e.message);
  process.exit(1);
});
