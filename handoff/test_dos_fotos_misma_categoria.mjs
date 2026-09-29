// Prueba puntual (no forma parte del feature) -- reproduce, con la ANON
// key (misma que usa el navegador), el escenario pedido: 2 fotos
// seguidas a la categoría "Laboratorio" (Imágenes y videos, sin IA) y 1
// a otra categoría. El tile "+" solo dispara el mismo click() sobre el
// input ya probado -- lo que hace falta confirmar acá es que el CAMINO
// DE DATOS (subirFoto: comprimir->subir->insertar) funciona igual la
// segunda vez sobre la misma categoría, sin pisar la primera.
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

async function subirFoto(donanteId, tipoEstudio, texto) {
  const svg = `<svg width='500' height='300' xmlns='http://www.w3.org/2000/svg'><rect width='100%' height='100%' fill='#ddd'/><text x='20' y='50' font-size='22'>${texto}</text></svg>`;
  const jpg = await sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
  const stamp = Date.now();
  const path = `${donanteId}/${stamp}.jpg`;
  const up = await supabase.storage.from("estudios-imagenes").upload(path, jpg, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error("upload: " + up.error.message);
  const pub = supabase.storage.from("estudios-imagenes").getPublicUrl(path).data.publicUrl;
  const ins = await supabase
    .from("estudios_imagenes")
    .insert({ donante_id: donanteId, tipo_estudio: tipoEstudio, archivo_url: pub, archivo_tipo: "image", mime_type: "image/jpeg" })
    .select()
    .single();
  if (ins.error) throw new Error("insert: " + ins.error.message);
  await new Promise((r) => setTimeout(r, 5)); // separa timestamps
  return ins.data;
}

async function main() {
  const { data: donantes } = await supabase.from("donantes").select("id").limit(1);
  const donanteId = donantes[0].id;
  console.log("donante_id:", donanteId);

  console.log("Subiendo foto 1 a Laboratorio (como si fuera 'Agregar estudio')...");
  const f1 = await subirFoto(donanteId, "Laboratorio", "Lab foto 1");
  console.log("OK:", f1.id);

  console.log("Subiendo foto 2 a Laboratorio (como si fuera el tile '+')...");
  const f2 = await subirFoto(donanteId, "Laboratorio", "Lab foto 2");
  console.log("OK:", f2.id);

  console.log("Subiendo foto a otra categoría (Rx_torax)...");
  const f3 = await subirFoto(donanteId, "Rx_torax", "Rx foto 1");
  console.log("OK:", f3.id);

  const { data: enLab } = await supabase
    .from("estudios_imagenes")
    .select("id, created_at")
    .eq("donante_id", donanteId)
    .eq("tipo_estudio", "Laboratorio")
    .in("id", [f1.id, f2.id])
    .order("created_at", { ascending: true });
  console.log(`Laboratorio tiene ${enLab.length} fotos de esta prueba (esperado: 2, la más nueva sería el destacado):`);
  console.table(enLab);

  // Confirma que compartir puede al menos bajar el archivo público como
  // blob (la parte de Web Share API en sí no se puede probar sin
  // navegador, pero el fetch()+blob() de la URL pública sí).
  const resp = await fetch(f1.archivo_url);
  console.log("fetch de archivo_url para compartir: status", resp.status, "type", resp.headers.get("content-type"));

  // Limpieza
  await supabase.from("estudios_imagenes").delete().in("id", [f1.id, f2.id, f3.id]);
  const paths = [f1, f2, f3].map((f) => f.archivo_url.split("/estudios-imagenes/")[1]);
  await supabase.storage.from("estudios-imagenes").remove(paths);
  console.log("Limpieza OK.");
}

main().catch((e) => {
  console.error("FALLÓ:", e.message);
  process.exit(1);
});
