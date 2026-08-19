import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Donante } from "./types";

export type MuestraPaqueteDef = {
  key: string;
  nombre: string;
  tubos: string;
  archivo: string;
  prellenable: boolean;
};

// Los 8 ítems del paquete de Muestras. paquete_key === planilla_key.
export const MUESTRAS_PAQUETES: MuestraPaqueteDef[] = [
  { key: "hla", nombre: "HLA", tubos: "a definir", archivo: "solicitud_hla.pdf", prellenable: true },
  { key: "lab", nombre: "Laboratorio", tubos: "a definir", archivo: "solicitud_laboratorio.pdf", prellenable: true },
  { key: "hemocultivo", nombre: "Hemocultivo", tubos: "a definir", archivo: "solicitud_hemocultivo.pdf", prellenable: true },
  { key: "urocultivo", nombre: "Urocultivo", tubos: "a definir", archivo: "solicitud_urocultivo.pdf", prellenable: true },
  { key: "serologia", nombre: "Serología", tubos: "a definir", archivo: "solicitud_serologia.pdf", prellenable: true },
  { key: "preablacion", nombre: "Laboratorio pre-ablación", tubos: "a definir", archivo: "solicitud_laboratorio_preablacion.pdf", prellenable: true },
  { key: "grupors", nombre: "Grupo sanguíneo y factor RH", tubos: "a definir", archivo: "solicitud_grupo_factor.pdf", prellenable: true },
  // El formulario de COVID es una ficha epidemiológica nacional con una
  // estructura totalmente distinta (sin PD Nº/Potencial Donante/Cama) --
  // no comparte el bloque común y queda fuera del prellenado de este piloto.
  { key: "covid", nombre: "Hisopado COVID", tubos: "1 hisopado", archivo: "solicitud_covid.pdf", prellenable: false },
];

// Coordenadas en px @150dpi (origen arriba-a-la-izquierda), determinadas
// visualmente sobre un render de referencia -- mismo criterio que
// handoff/formkit.py. Las 7 solicitudes CUCAIBA comparten exactamente
// este layout (verificado visualmente en las 7).
const SCALE = 72 / 150; // pt por px @150dpi

const CAMPOS_COMUNES: Record<string, { x: number; y: number; size: number }> = {
  dia: { x: 1230, y: 858, size: 26 },
  mes: { x: 1465, y: 858, size: 26 },
  anio: { x: 1705, y: 858, size: 26 },
  horaHH: { x: 1948, y: 858, size: 26 },
  horaMM: { x: 2058, y: 858, size: 26 },
  pdNumero: { x: 2820, y: 862, size: 24 },
  potencialDonante: { x: 1030, y: 1085, size: 22 },
  edad: { x: 3365, y: 1085, size: 22 },
  establecimiento: { x: 1000, y: 1235, size: 22 },
  servicio: { x: 2365, y: 1235, size: 22 },
  cama: { x: 3425, y: 1235, size: 22 },
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function camposComunesDeDonante(donante: Donante) {
  const now = new Date();
  return {
    dia: pad2(now.getDate()),
    mes: pad2(now.getMonth() + 1),
    anio: String(now.getFullYear()),
    horaHH: pad2(now.getHours()),
    horaMM: pad2(now.getMinutes()),
    pdNumero: donante.pd_numero ?? "",
    potencialDonante: donante.nombre_completo ?? "",
    edad: donante.edad != null ? String(donante.edad) : "",
    establecimiento: donante.institucion ?? "",
    servicio: donante.servicio ?? "",
    cama: donante.cama ?? "",
  };
}

// Los 6 campos base mínimos para disparar el prellenado automático.
export function tieneDatosMinimos(donante: Donante): boolean {
  return !!(
    donante.pd_numero &&
    donante.nombre_completo &&
    donante.edad != null &&
    donante.institucion &&
    donante.servicio &&
    donante.cama
  );
}

// Firma de los campos base -- cambia si cambia cualquiera de ellos,
// se usa para saber cuándo hay que regenerar los PDFs.
export function firmaDatosBase(donante: Donante): string {
  return [donante.pd_numero, donante.nombre_completo, donante.edad, donante.institucion, donante.servicio, donante.cama].join(
    "|"
  );
}

export async function fillMuestraPdf(archivoUrl: string, donante: Donante): Promise<Uint8Array> {
  const bytes = await fetch(archivoUrl).then((r) => r.arrayBuffer());
  const pdfDoc = await PDFDocument.load(bytes);
  const page = pdfDoc.getPage(0);
  const { height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const values = camposComunesDeDonante(donante);
  const color = rgb(0.06, 0.06, 0.4);

  (Object.keys(CAMPOS_COMUNES) as (keyof typeof values)[]).forEach((key) => {
    const text = values[key];
    if (!text) return;
    const pos = CAMPOS_COMUNES[key];
    page.drawText(text, {
      x: pos.x * SCALE,
      y: height - pos.y * SCALE,
      size: pos.size * SCALE,
      font,
      color,
    });
  });

  return pdfDoc.save();
}

// Genera (o regenera) los PDFs prellenables de los 8, los sube a
// Storage (bucket "planillas", sobrescribiendo el mismo archivo por
// caso+planilla) y deja un registro de auditoría en planillas_generadas.
export async function generarMuestrasPdfs(supabase: SupabaseClient, donante: Donante): Promise<void> {
  const prellenables = MUESTRAS_PAQUETES.filter((p) => p.prellenable);
  for (const p of prellenables) {
    const bytes = await fillMuestraPdf(`/forms/${p.archivo}`, donante);
    const path = `${donante.id}/${p.key}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("planillas")
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (uploadError) continue;
    const { data: pub } = supabase.storage.from("planillas").getPublicUrl(path);
    await supabase.from("planillas_generadas").insert({
      donante_id: donante.id,
      planilla_key: p.key,
      archivo_url: pub.publicUrl,
    });
  }
}
