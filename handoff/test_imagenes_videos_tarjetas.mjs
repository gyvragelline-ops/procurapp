// Prueba puntual (no forma parte del feature) -- verifica que las 5
// categorías fijas nuevas funcionan: sube una "foto" a Rx_torax y un
// "video" a Fotos_cuerpo (blobs sintéticos, sin necesitar cámara real),
// confirma que ambos quedan en estudios_imagenes con su tipo_estudio, y
// que el archivo (y la miniatura del video) llegan al bucket.
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

  const stampFoto = Date.now();
  const pathFoto = `${donanteId}/${stampFoto}.jpg`;
  const bytesFoto = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0, 1, 2, 3]); // JPEG-ish, no hace falta que sea válido
  const up1 = await supabase.storage.from("estudios-imagenes").upload(pathFoto, bytesFoto, { contentType: "image/jpeg" });
  if (up1.error) throw up1.error;
  const pubFoto = supabase.storage.from("estudios-imagenes").getPublicUrl(pathFoto).data.publicUrl;
  const insFoto = await supabase
    .from("estudios_imagenes")
    .insert({ donante_id: donanteId, tipo_estudio: "Rx_torax", archivo_url: pubFoto, archivo_tipo: "image", mime_type: "image/jpeg" })
    .select()
    .single();
  if (insFoto.error) throw insFoto.error;
  console.log("OK foto -> Rx_torax:", insFoto.data.id);

  const stampVideo = Date.now() + 1;
  const pathVideo = `${donanteId}/${stampVideo}.mp4`;
  const pathThumb = `${donanteId}/${stampVideo}-thumb.jpg`;
  const bytesVideo = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]); // mp4-ish
  const bytesThumb = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0, 1, 2, 3]);
  const up2 = await supabase.storage.from("estudios-imagenes").upload(pathVideo, bytesVideo, { contentType: "video/mp4" });
  if (up2.error) throw up2.error;
  const up3 = await supabase.storage.from("estudios-imagenes").upload(pathThumb, bytesThumb, { contentType: "image/jpeg" });
  if (up3.error) throw up3.error;
  const pubVideo = supabase.storage.from("estudios-imagenes").getPublicUrl(pathVideo).data.publicUrl;
  const insVideo = await supabase
    .from("estudios_imagenes")
    .insert({ donante_id: donanteId, tipo_estudio: "Fotos_cuerpo", archivo_url: pubVideo, archivo_tipo: "video", mime_type: "video/mp4" })
    .select()
    .single();
  if (insVideo.error) throw insVideo.error;
  console.log("OK video -> Fotos_cuerpo:", insVideo.data.id, "thumb:", pathThumb);

  const { data: leidos } = await supabase
    .from("estudios_imagenes")
    .select("tipo_estudio, archivo_tipo, archivo_url")
    .eq("donante_id", donanteId)
    .in("id", [insFoto.data.id, insVideo.data.id]);
  console.table(leidos);

  // Confirma que la miniatura del video se puede derivar por convención
  // de nombre (rutaMiniaturaVideo) y que existe en el bucket.
  const rutaThumbEsperada = pubVideo.replace(/\.[^./]+$/, "-thumb.jpg");
  const listado = await supabase.storage.from("estudios-imagenes").list(donanteId);
  const existeThumb = listado.data?.some((f) => f.name === `${stampVideo}-thumb.jpg`);
  console.log("thumb esperado en bucket:", existeThumb ? "OK" : "FALTA", rutaThumbEsperada);

  // Limpieza
  await supabase.from("estudios_imagenes").delete().in("id", [insFoto.data.id, insVideo.data.id]);
  await supabase.storage.from("estudios-imagenes").remove([pathFoto, pathVideo, pathThumb]);
  console.log("Limpieza OK.");
}

main();
