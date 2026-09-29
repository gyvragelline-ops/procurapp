// Prueba puntual (no forma parte del feature) -- reproduce el mismo
// upsert que hace LabImagenesCompleto, con la ANON key.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

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
  const { data: donantes } = await supabase.from("donantes").select("id").limit(1);
  const donanteId = donantes[0].id;
  console.log("donante_id:", donanteId);

  const up1 = await supabase
    .from("documentacion_estado")
    .upsert(
      { donante_id: donanteId, categoria: "labImagenes", item_key: "completo", estado: "si", updated_at: new Date().toISOString() },
      { onConflict: "donante_id,categoria,item_key" }
    );
  if (up1.error) throw new Error("upsert si: " + up1.error.message);
  console.log("OK marcado como completo");

  const { data: leido1 } = await supabase
    .from("documentacion_estado")
    .select("estado")
    .eq("donante_id", donanteId)
    .eq("categoria", "labImagenes")
    .eq("item_key", "completo")
    .maybeSingle();
  console.log("estado leído:", leido1.estado);

  const up2 = await supabase
    .from("documentacion_estado")
    .upsert(
      { donante_id: donanteId, categoria: "labImagenes", item_key: "completo", estado: "no", updated_at: new Date().toISOString() },
      { onConflict: "donante_id,categoria,item_key" }
    );
  if (up2.error) throw new Error("upsert no: " + up2.error.message);
  const { data: leido2 } = await supabase
    .from("documentacion_estado")
    .select("estado")
    .eq("donante_id", donanteId)
    .eq("categoria", "labImagenes")
    .eq("item_key", "completo")
    .maybeSingle();
  console.log("estado tras marcar pendiente:", leido2.estado);

  // Limpieza: vuelve al estado neutro (borra la fila de prueba)
  await supabase.from("documentacion_estado").delete().eq("donante_id", donanteId).eq("categoria", "labImagenes").eq("item_key", "completo");
  console.log("Limpieza OK.");
}

main().catch((e) => {
  console.error("FALLÓ:", e.message);
  process.exit(1);
});
