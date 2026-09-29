// Subida con progreso real, portada de PASE (lib/estudios.ts,
// subirArchivoConProgreso) -- supabase-js sube con fetch, que no expone
// progreso de subida de forma confiable en el navegador. Para video
// (archivos grandes, sin compresión de por medio a veces, con señal
// mala) se arma a mano el mismo POST multipart que hace supabase-js
// (mismo endpoint, mismos headers/campos) pero con XMLHttpRequest, que
// sí dispara xhr.upload.onprogress.
//
// Sin sesión de usuario en esta app (no hay Supabase Auth acá, todo es
// anon + RLS permisiva) -- se autentica con la anon key directo, no con
// un access_token como en PASE.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export function subirArchivoConProgreso(
  bucket: string,
  ruta: string,
  archivo: Blob,
  onProgreso: (fraccion: number) => void
): Promise<{ ok: true } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const formData = new FormData();
    formData.append("cacheControl", "3600");
    formData.append("", archivo);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${SUPABASE_URL}/storage/v1/object/${bucket}/${ruta}`);
    xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
    xhr.setRequestHeader("Authorization", `Bearer ${SUPABASE_ANON_KEY}`);
    xhr.setRequestHeader("x-upsert", "true");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgreso(e.loaded / e.total);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ ok: true });
      } else {
        resolve({ ok: false, error: `No se pudo subir el video (${xhr.status}).` });
      }
    };
    xhr.onerror = () => resolve({ ok: false, error: "Error de red al subir el video." });

    xhr.send(formData);
  });
}
