// Prueba puntual (no forma parte del feature) -- verifica que
// laboratorio_cargas funciona: insert de una carga con items (op2 +
// biblioteca + bloqueado), lectura, y update de un item (simulando lo que
// hace actualizarItemDeCarga).
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

async function main() {
  const { data: donantes } = await supabase.from("donantes").select("id").limit(1);
  const donanteId = donantes[0].id;
  console.log("donante_id:", donanteId);

  // Simula lo que arma confirmarGuardado tras guardar 3 items reales
  await supabase.from("planilla_valores").upsert(
    { donante_id: donanteId, planilla_key: "op2_p3", campo_pdf: "lab_Urea_extraccion1", valor: "45 mg/dL" },
    { onConflict: "donante_id,planilla_key,campo_pdf" }
  );
  const insBib = await supabase
    .from("laboratorio_biblioteca")
    .insert({ donante_id: donanteId, parametro: "pH", valor: "7.38", unidad: null, grupo_sugerido: "gasometrico" })
    .select()
    .single();

  const items = [
    { parametro: "Urea", valor: "45", unidad: "mg/dL", destino: { tipo: "op2", parametroCanonico: "Urea", columna: "extraccion1" } },
    { parametro: "pH", valor: "7.38", unidad: null, destino: { tipo: "biblioteca", bibliotecaId: insBib.data.id } },
    { parametro: "Troponina T", valor: "0.02", unidad: "ng/mL", destino: { tipo: "bloqueado" } },
  ];

  const insCarga = await supabase
    .from("laboratorio_cargas")
    .insert({
      donante_id: donanteId,
      imagen_url: "https://example.com/foto-test.jpg",
      fecha_hora_estudio: new Date("2026-09-29T14:30:00").toISOString(),
      etiqueta: "Laboratorio 14:30",
      items,
    })
    .select()
    .single();
  if (insCarga.error) throw insCarga.error;
  console.log("OK carga insertada:", insCarga.data.id, "items:", insCarga.data.items.length);

  const { data: leida } = await supabase.from("laboratorio_cargas").select("*").eq("id", insCarga.data.id).single();
  console.table(leida.items.map((it) => ({ parametro: it.parametro, valor: it.valor, destino: it.destino.tipo })));

  // Simula actualizarItemDeCarga sobre el item op2 (idx 0): edita el valor
  const nuevoValor = "48 mg/dL";
  await supabase
    .from("planilla_valores")
    .update({ valor: nuevoValor })
    .eq("donante_id", donanteId)
    .eq("planilla_key", "op2_p3")
    .eq("campo_pdf", "lab_Urea_extraccion1");
  const nuevosItems = leida.items.map((it, i) => (i === 0 ? { ...it, valor: "48" } : it));
  await supabase.from("laboratorio_cargas").update({ items: nuevosItems }).eq("id", insCarga.data.id);

  const { data: planillaTrasEdit } = await supabase
    .from("planilla_valores")
    .select("valor")
    .eq("donante_id", donanteId)
    .eq("planilla_key", "op2_p3")
    .eq("campo_pdf", "lab_Urea_extraccion1")
    .single();
  const { data: cargaTrasEdit } = await supabase.from("laboratorio_cargas").select("items").eq("id", insCarga.data.id).single();
  console.log("planilla_valores tras edit:", planillaTrasEdit.valor);
  console.log("carga.items[0].valor tras edit:", cargaTrasEdit.items[0].valor);
  if (planillaTrasEdit.valor !== nuevoValor || cargaTrasEdit.items[0].valor !== "48") {
    throw new Error("La edición no se reflejó correctamente.");
  }
  console.log("OK: edición sincronizada entre laboratorio_cargas y planilla_valores.");

  // Limpieza
  await supabase.from("laboratorio_cargas").delete().eq("id", insCarga.data.id);
  await supabase.from("laboratorio_biblioteca").delete().eq("id", insBib.data.id);
  await supabase
    .from("planilla_valores")
    .delete()
    .eq("donante_id", donanteId)
    .eq("planilla_key", "op2_p3")
    .eq("campo_pdf", "lab_Urea_extraccion1");
  console.log("Limpieza OK.");
}

main();
