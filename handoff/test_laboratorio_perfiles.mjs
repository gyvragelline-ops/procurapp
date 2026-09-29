// Prueba puntual (no forma parte del feature) -- verifica que un valor
// OP2, uno extendido (gasometría) y uno con grupo sugerido por IA
// (simulado, sin llamar a la API) caigan donde corresponde.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function cargarEnv(path) {
  const out = {};
  for (const l of readFileSync(path, "utf8").split("\n")) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
const env = { ...cargarEnv(".env"), ...cargarEnv(".env.local") };
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const fechaHora = { dia: "29", mes: "09", anio: "2026", hora: "14:30" };

async function main() {
  const { data: donantes } = await supabase.from("donantes").select("id").limit(1);
  const donanteId = donantes[0].id;
  console.log("donante_id:", donanteId);

  // 1) OP2: Urea -> planilla_valores, perfil renal
  await supabase.from("planilla_valores").upsert(
    { donante_id: donanteId, planilla_key: "op2_p3", campo_pdf: "lab_Urea_extraccion1", valor: "45 mg/dL" },
    { onConflict: "donante_id,planilla_key,campo_pdf" }
  );
  console.log("OK: Urea escrita en planilla_valores (op2_p3, renal).");

  // 2) Extendido: pH -> laboratorio_biblioteca, grupo gasometrico
  const insPh = await supabase
    .from("laboratorio_biblioteca")
    .insert({ donante_id: donanteId, parametro: "pH", valor: "7.38", unidad: null, grupo_sugerido: "gasometrico" })
    .select()
    .single();
  console.log("OK pH -> biblioteca:", insPh.data);

  // 3) Sugerido por IA (simulado): Troponina -> grupo cardiaco
  const insTrop = await supabase
    .from("laboratorio_biblioteca")
    .insert({ donante_id: donanteId, parametro: "Troponina T", valor: "0.02", unidad: "ng/mL", grupo_sugerido: "cardiaco" })
    .select()
    .single();
  console.log("OK Troponina -> biblioteca:", insTrop.data);

  // 4) Sin grupo -> biblioteca abierta
  const insLibre = await supabase
    .from("laboratorio_biblioteca")
    .insert({ donante_id: donanteId, parametro: "Parametro raro X", valor: "1", unidad: null, grupo_sugerido: null })
    .select()
    .single();
  console.log("OK sin grupo -> biblioteca abierta:", insLibre.data);

  const { data: bib } = await supabase
    .from("laboratorio_biblioteca")
    .select("parametro, grupo_sugerido")
    .eq("donante_id", donanteId)
    .order("created_at", { ascending: false })
    .limit(5);
  console.table(bib);

  // Limpieza
  await supabase.from("laboratorio_biblioteca").delete().in("id", [insPh.data.id, insTrop.data.id, insLibre.data.id]);
  await supabase
    .from("planilla_valores")
    .delete()
    .eq("donante_id", donanteId)
    .eq("planilla_key", "op2_p3")
    .eq("campo_pdf", "lab_Urea_extraccion1");
  console.log("Limpieza OK.");
}

main();
