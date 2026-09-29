// Prueba puntual (no forma parte del feature) -- reproduce, con la ANON
// key (misma que usa el navegador), el escenario que pidió probar antes
// de dar por resuelto el rediseño mínimo: una foto en Laboratorio, un
// video en TAC de tórax, y borrar una de las dos.
//
// La compresión de video en sí (MediaRecorder+canvas) es solo de
// navegador y no se puede correr en Node -- ese código no se tocó en
// este rediseño (viene portado y verificado de antes). Lo que sí se
// reescribió es todo el resto del camino (subir, guardar la fila,
// borrar), que es justo lo que este script ejercita de punta a punta
// contra la base y el storage reales.
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
  const { data: donantes } = await supabase.from("donantes").select("id").limit(1);
  const donanteId = donantes[0].id;
  console.log("donante_id:", donanteId);

  // === 1) Foto en Laboratorio (mismo camino que subirFoto) ===
  const svg = `<svg width='500' height='300' xmlns='http://www.w3.org/2000/svg'><rect width='100%' height='100%' fill='#ddd'/><text x='20' y='50' font-size='22'>Laboratorio - prueba panel minimo</text></svg>`;
  const jpg = await sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
  const stampFoto = Date.now();
  const pathFoto = `${donanteId}/${stampFoto}.jpg`;
  const upFoto = await supabase.storage.from("estudios-imagenes").upload(pathFoto, jpg, { contentType: "image/jpeg", upsert: true });
  if (upFoto.error) throw new Error("upload foto: " + upFoto.error.message);
  const pubFoto = supabase.storage.from("estudios-imagenes").getPublicUrl(pathFoto).data.publicUrl;
  const insFoto = await supabase
    .from("estudios_imagenes")
    .insert({ donante_id: donanteId, tipo_estudio: "Laboratorio", archivo_url: pubFoto, archivo_tipo: "image", mime_type: "image/jpeg" })
    .select()
    .single();
  if (insFoto.error) throw new Error("insert foto: " + insFoto.error.message);
  console.log("OK foto Laboratorio:", insFoto.data.id, pubFoto);

  // === 2) Video en TAC de tórax (mismo camino que subirArchivoConProgreso + guardarEstudioImagen) ===
  // MP4 mínimo válido (ftyp box) -- suficiente para probar upload+insert;
  // la recompresión real corre en el navegador y no se toca acá.
  const mp4 = Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 0x69, 0x73, 0x6f, 0x6d]);
  const stampVideo = Date.now() + 1;
  const pathVideo = `${donanteId}/${stampVideo}.mp4`;

  const formData = new FormData();
  formData.append("cacheControl", "3600");
  formData.append("", new Blob([mp4], { type: "video/mp4" }));
  const resVideo = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/estudios-imagenes/${pathVideo}`, {
    method: "POST",
    headers: {
      apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      "x-upsert": "true",
    },
    body: formData,
  });
  if (!resVideo.ok) throw new Error("upload video (multipart): " + (await resVideo.text()));
  const pubVideo = supabase.storage.from("estudios-imagenes").getPublicUrl(pathVideo).data.publicUrl;
  const insVideo = await supabase
    .from("estudios_imagenes")
    .insert({ donante_id: donanteId, tipo_estudio: "TAC_torax", archivo_url: pubVideo, archivo_tipo: "video", mime_type: "video/mp4" })
    .select()
    .single();
  if (insVideo.error) throw new Error("insert video: " + insVideo.error.message);
  console.log("OK video TAC_torax:", insVideo.data.id, pubVideo);

  // Confirma que ambas filas quedaron en la categoría correcta
  const { data: filas } = await supabase
    .from("estudios_imagenes")
    .select("id, tipo_estudio, archivo_tipo, archivo_url")
    .in("id", [insFoto.data.id, insVideo.data.id]);
  console.table(filas);

  // === 3) Borrar una de las dos (mismo camino que borrarEstudioImagen) ===
  console.log("Borrando la foto de Laboratorio...");
  const delFila = await supabase.from("estudios_imagenes").delete().eq("id", insFoto.data.id);
  if (delFila.error) throw new Error("delete fila: " + delFila.error.message);
  const delArchivo = await supabase.storage.from("estudios-imagenes").remove([pathFoto]);
  if (delArchivo.error) throw new Error("delete archivo: " + delArchivo.error.message);

  const { data: verificaBorrado } = await supabase.from("estudios_imagenes").select("id").eq("id", insFoto.data.id).maybeSingle();
  console.log("Fila de la foto sigue existiendo tras borrar:", verificaBorrado ? "SÍ (mal)" : "NO (bien)");
  const { data: listado } = await supabase.storage.from("estudios-imagenes").list(donanteId);
  const archivoSigue = listado?.some((f) => f.name === `${stampFoto}.jpg`);
  console.log("Archivo de la foto sigue en el bucket tras borrar:", archivoSigue ? "SÍ (mal)" : "NO (bien)");

  // Limpieza del video (queda vivo hasta acá para poder chequearlo)
  await supabase.from("estudios_imagenes").delete().eq("id", insVideo.data.id);
  await supabase.storage.from("estudios-imagenes").remove([pathVideo]);
  console.log("Limpieza final OK.");
}

main().catch((e) => {
  console.error("FALLÓ:", e.message);
  process.exit(1);
});
