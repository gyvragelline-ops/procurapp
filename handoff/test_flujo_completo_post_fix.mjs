// Prueba puntual (no forma parte del feature) -- reproduce, con la ANON
// key (misma que usa el navegador), los dos caminos que tocó este
// arreglo:
// 1) Foto (Imágenes y videos, plain-archive): comprimir->subir->insertar,
//    igual que subirFoto() en imagenes-videos-panel.tsx.
// 2) Subida multipart armada a mano (igual que subirArchivoConProgreso
//    en lib/procuracion/subir-con-progreso.ts) contra el endpoint real
//    de Storage, para confirmar que el mecanismo de "progreso real" que
//    reemplaza al cliente estándar funciona contra la API real.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
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
  const { data: donantes } = await supabase.from("donantes").select("id").limit(1);
  const donanteId = donantes[0].id;
  console.log("donante_id:", donanteId);

  // === 1) Foto (mismo camino que subirFoto) ===
  const svg = `<svg width='600' height='400' xmlns='http://www.w3.org/2000/svg'><rect width='100%' height='100%' fill='#eee'/><text x='30' y='60' font-size='26'>Rx de torax - prueba post-fix</text></svg>`;
  const jpg = await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
  const stamp1 = Date.now();
  const path1 = `${donanteId}/${stamp1}.jpg`;
  const t1 = Date.now();
  const up1 = await supabase.storage.from("estudios-imagenes").upload(path1, jpg, { contentType: "image/jpeg", upsert: true });
  if (up1.error) throw new Error("upload foto: " + up1.error.message);
  const pub1 = supabase.storage.from("estudios-imagenes").getPublicUrl(path1).data.publicUrl;
  const ins1 = await supabase
    .from("estudios_imagenes")
    .insert({ donante_id: donanteId, tipo_estudio: "Rx_torax", archivo_url: pub1, archivo_tipo: "image", mime_type: "image/jpeg" })
    .select()
    .single();
  if (ins1.error) throw new Error("insert foto: " + ins1.error.message);
  console.log(`OK foto: subida+insertada en ${((Date.now() - t1) / 1000).toFixed(1)}s ->`, ins1.data.id);

  // === 2) Multipart a mano (mismo POST que subirArchivoConProgreso) ===
  const stamp2 = Date.now() + 1;
  const path2 = `${donanteId}/${stamp2}.jpg`;
  const formData = new FormData();
  formData.append("cacheControl", "3600");
  formData.append("", new Blob([jpg], { type: "image/jpeg" }));

  const t2 = Date.now();
  const res2 = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/estudios-imagenes/${path2}`, {
    method: "POST",
    headers: {
      apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      "x-upsert": "true",
    },
    body: formData,
  });
  console.log(`multipart status: ${res2.status} en ${((Date.now() - t2) / 1000).toFixed(1)}s`);
  if (!res2.ok) throw new Error("multipart upload falló: " + (await res2.text()));
  console.log("OK multipart: mismo mecanismo que usará el Context de video en segundo plano.");

  // Limpieza
  await supabase.from("estudios_imagenes").delete().eq("id", ins1.data.id);
  await supabase.storage.from("estudios-imagenes").remove([path1, path2]);
  console.log("Limpieza OK.");
}

main().catch((e) => {
  console.error("FALLÓ:", e.message);
  process.exit(1);
});
