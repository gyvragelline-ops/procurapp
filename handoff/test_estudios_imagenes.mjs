// Script de prueba puntual (no se commitea como parte del feature) --
// sube una imagen y un "video" simulado a estudios-imagenes e inserta
// las filas correspondientes, usando el service role key (bypassa RLS).
// Correr: node handoff/test_estudios_imagenes.mjs
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function cargarEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const linea of readFileSync(path, "utf8").split("\n")) {
    const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const env = { ...cargarEnv(".env"), ...cargarEnv(".env.local") };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function main() {
  const { data: donantes, error: errDonantes } = await supabase.from("donantes").select("id").limit(1);
  if (errDonantes) {
    console.error("Error leyendo donantes:", errDonantes.message);
    process.exit(1);
  }
  if (!donantes || donantes.length === 0) {
    console.error("No hay ningún donante en la base para probar. Creá uno de prueba primero.");
    process.exit(1);
  }
  const donanteId = donantes[0].id;
  console.log("Usando donante_id:", donanteId);

  // 1x1 JPEG mínimo válido, para probar el path de "imagen".
  const jpegBase64 =
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAABAAEBAREA/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAA/AKp//9k=";

  const imgPath = `${donanteId}/test-${Date.now()}.jpg`;
  const imgBytes = Buffer.from(jpegBase64, "base64");
  const up1 = await supabase.storage.from("estudios-imagenes").upload(imgPath, imgBytes, { contentType: "image/jpeg", upsert: true });
  if (up1.error) {
    console.error("Error subiendo imagen de prueba:", up1.error.message);
    process.exit(1);
  }
  const { data: pubImg } = supabase.storage.from("estudios-imagenes").getPublicUrl(imgPath);
  const insImg = await supabase.from("estudios_imagenes").insert({
    donante_id: donanteId,
    tipo_estudio: "ECG",
    archivo_url: pubImg.publicUrl,
    archivo_tipo: "image",
    mime_type: "image/jpeg",
  }).select().single();
  if (insImg.error) {
    console.error("Error insertando fila de imagen:", insImg.error.message);
    process.exit(1);
  }
  console.log("OK imagen -> fila:", insImg.data);

  // Video simulado: un blob binario chico con content-type de video, para
  // probar el path de "video" (no hace falta que sea reproducible para
  // validar Storage + tabla).
  const videoBytes = Buffer.from("SIMULACION-DE-VIDEO-CORTO-PARA-PRUEBA");
  const vidPath = `${donanteId}/test-${Date.now()}.mp4`;
  const up2 = await supabase.storage.from("estudios-imagenes").upload(vidPath, videoBytes, { contentType: "video/mp4", upsert: true });
  if (up2.error) {
    console.error("Error subiendo video de prueba:", up2.error.message);
    process.exit(1);
  }
  const { data: pubVid } = supabase.storage.from("estudios-imagenes").getPublicUrl(vidPath);
  const insVid = await supabase.from("estudios_imagenes").insert({
    donante_id: donanteId,
    tipo_estudio: "Video",
    archivo_url: pubVid.publicUrl,
    archivo_tipo: "video",
    mime_type: "video/mp4",
  }).select().single();
  if (insVid.error) {
    console.error("Error insertando fila de video:", insVid.error.message);
    process.exit(1);
  }
  console.log("OK video -> fila:", insVid.data);

  const { data: todas, error: errTodas } = await supabase
    .from("estudios_imagenes")
    .select("id, tipo_estudio, archivo_tipo, archivo_url, created_at")
    .eq("donante_id", donanteId)
    .order("created_at", { ascending: false })
    .limit(5);
  if (errTodas) {
    console.error("Error releyendo estudios_imagenes:", errTodas.message);
    process.exit(1);
  }
  console.log("Últimas filas de estudios_imagenes para este donante:");
  console.table(todas);
}

main();
