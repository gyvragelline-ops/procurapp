import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
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

// Coordenadas en px @150dpi (origen arriba-a-la-izquierda), determinadas por
// escaneo de píxeles sobre el render de referencia (bordes de recuadro,
// posición de puntos suspensivos) -- mucho más preciso que a ojo. Las 7
// solicitudes CUCAIBA comparten exactamente este layout de encabezado
// (verificado visualmente en las 7).
const SCALE = 72 / 150; // pt por px @150dpi
const COLOR_TEXTO = rgb(0.06, 0.06, 0.4);
const COLOR_X = rgb(0.06, 0.06, 0.4);

// Los 4 recuadros (Día/Mes/Año/Hora) -- se centra el texto dentro de
// cada uno usando el ancho real de la fuente, no una posición fija.
const RECUADROS = {
  dia: { left: 1221, width: 286 },
  mes: { left: 1530, width: 287 },
  anio: { left: 1838, width: 286 },
  horaHH: { left: 2146, width: 144 },
  horaMM: { left: 2298, width: 135 },
};
const RECUADRO_BASELINE_Y = 865;
// Tamaño único para TODO el texto prellenado (recuadros de fecha/hora y
// campos sobre línea de puntos) -- antes variaba entre campos y se veía
// inconsistente.
const FONT_SIZE_UNIFICADO = 80; // px @150dpi

// Campos sobre línea de puntos -- alineados a la izquierda, con un
// margen chico después de los dos puntos impresos para que el valor
// no quede pegado al enunciado.
const CAMPOS_LINEA: Record<string, { x: number; y: number }> = {
  pdNumero: { x: 2870, y: 864 },
  potencialDonante: { x: 1080, y: 1092 },
  edad: { x: 3410, y: 1092 },
  establecimiento: { x: 1050, y: 1248 },
  servicio: { x: 2415, y: 1248 },
  cama: { x: 3460, y: 1248 },
};

// Casilleros a tildar por planilla (centro x,y + tamaño del recuadro,
// en px @150dpi, determinados por detección de blobs sobre el render).
// Grupo y factor no tiene casilleros. Hemocultivo/Urocultivo no se tocan.
type Checkbox = { cx: number; cy: number; size: number };
const CHECKBOXES_A_MARCAR: Record<string, Checkbox[]> = {
  hla: [
    { cx: 773, cy: 1801, size: 84 }, // Sangre con EDTA (único a tildar)
  ],
  lab: [
    { cx: 393, cy: 1456, size: 60 },
    { cx: 1090, cy: 1456, size: 60 },
    { cx: 1736, cy: 1461, size: 61 },
    { cx: 393, cy: 1535, size: 60 },
    { cx: 1090, cy: 1535, size: 60 },
    { cx: 1736, cy: 1540, size: 61 },
    { cx: 393, cy: 1618, size: 60 },
    { cx: 1090, cy: 1618, size: 60 },
    { cx: 1736, cy: 1622, size: 61 },
    { cx: 393, cy: 1697, size: 60 },
    { cx: 1090, cy: 1697, size: 60 },
    { cx: 1736, cy: 1703, size: 61 },
    { cx: 393, cy: 1781, size: 60 },
    { cx: 1090, cy: 1781, size: 60 },
    { cx: 1736, cy: 1786, size: 61 },
    { cx: 393, cy: 1865, size: 60 },
    { cx: 1090, cy: 1865, size: 60 },
    { cx: 1736, cy: 1869, size: 61 },
    { cx: 393, cy: 1946, size: 60 },
    { cx: 1090, cy: 1946, size: 60 },
    { cx: 1736, cy: 1951, size: 61 },
    { cx: 393, cy: 2029, size: 60 },
    { cx: 1090, cy: 2029, size: 60 },
  ],
  serologia: [
    // Se excluye a propósito el casillero en blanco sin etiqueta al pie
    // de la 2ª columna (cx≈1334, cy≈1992) -- no corresponde a ningún ítem.
    { cx: 546, cy: 1507, size: 73 },
    { cx: 1336, cy: 1504, size: 74 },
    { cx: 546, cy: 1600, size: 73 },
    { cx: 1336, cy: 1606, size: 74 },
    { cx: 546, cy: 1702, size: 73 },
    { cx: 1334, cy: 1699, size: 73 },
    { cx: 546, cy: 1799, size: 73 },
    { cx: 1334, cy: 1794, size: 74 },
    { cx: 546, cy: 1900, size: 73 },
    { cx: 1334, cy: 1894, size: 73 },
    { cx: 546, cy: 2002, size: 73 },
  ],
  preablacion: [
    { cx: 1140, cy: 1604, size: 99 },
    { cx: 1140, cy: 1799, size: 99 },
  ],
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

function drawCentrado(page: PDFPage, font: PDFFont, text: string, left: number, width: number, baselineY: number, sizePx: number, pageHeight: number) {
  const sizePt = sizePx * SCALE;
  const textWidthPt = font.widthOfTextAtSize(text, sizePt);
  const centerXPt = (left + width / 2) * SCALE;
  page.drawText(text, {
    x: centerXPt - textWidthPt / 2,
    y: pageHeight - baselineY * SCALE,
    size: sizePt,
    font,
    color: COLOR_TEXTO,
  });
}

function drawEnLinea(page: PDFPage, font: PDFFont, text: string, x: number, y: number, sizePx: number, pageHeight: number) {
  page.drawText(text, {
    x: x * SCALE,
    y: pageHeight - y * SCALE,
    size: sizePx * SCALE,
    font,
    color: COLOR_TEXTO,
  });
}

function marcarCheckbox(page: PDFPage, boldFont: PDFFont, box: Checkbox, pageHeight: number) {
  const sizePt = box.size * 0.72 * SCALE;
  const textWidthPt = boldFont.widthOfTextAtSize("X", sizePt);
  const centerXPt = box.cx * SCALE;
  const centerYPt = pageHeight - box.cy * SCALE;
  page.drawText("X", {
    x: centerXPt - textWidthPt / 2,
    y: centerYPt - sizePt * 0.36,
    size: sizePt,
    font: boldFont,
    color: COLOR_X,
  });
}

async function rellenarPagina(pdfDoc: PDFDocument, planillaKey: string, donante: Donante) {
  const page = pdfDoc.getPage(0);
  const { height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const values = camposComunesDeDonante(donante);

  drawCentrado(page, font, values.dia, RECUADROS.dia.left, RECUADROS.dia.width, RECUADRO_BASELINE_Y, FONT_SIZE_UNIFICADO, height);
  drawCentrado(page, font, values.mes, RECUADROS.mes.left, RECUADROS.mes.width, RECUADRO_BASELINE_Y, FONT_SIZE_UNIFICADO, height);
  drawCentrado(page, font, values.anio, RECUADROS.anio.left, RECUADROS.anio.width, RECUADRO_BASELINE_Y, FONT_SIZE_UNIFICADO, height);
  drawCentrado(page, font, values.horaHH, RECUADROS.horaHH.left, RECUADROS.horaHH.width, RECUADRO_BASELINE_Y, FONT_SIZE_UNIFICADO, height);
  drawCentrado(page, font, values.horaMM, RECUADROS.horaMM.left, RECUADROS.horaMM.width, RECUADRO_BASELINE_Y, FONT_SIZE_UNIFICADO, height);

  (Object.keys(CAMPOS_LINEA) as (keyof typeof values)[]).forEach((key) => {
    const text = values[key];
    if (!text) return;
    const pos = CAMPOS_LINEA[key];
    drawEnLinea(page, font, text, pos.x, pos.y, FONT_SIZE_UNIFICADO, height);
  });

  const checkboxes = CHECKBOXES_A_MARCAR[planillaKey];
  if (checkboxes && checkboxes.length > 0) {
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    checkboxes.forEach((box) => marcarCheckbox(page, boldFont, box, height));
  }
}

export async function fillMuestraPdf(archivoUrl: string, planillaKey: string, donante: Donante): Promise<Uint8Array> {
  const bytes = await fetch(archivoUrl).then((r) => r.arrayBuffer());
  const pdfDoc = await PDFDocument.load(bytes);
  await rellenarPagina(pdfDoc, planillaKey, donante);
  return pdfDoc.save();
}

// Genera (o regenera) los PDFs prellenables de los 7, los sube a
// Storage (bucket "planillas", sobrescribiendo el mismo archivo por
// caso+planilla) y deja un registro de auditoría en planillas_generadas.
export async function generarMuestrasPdfs(supabase: SupabaseClient, donante: Donante): Promise<void> {
  const prellenables = MUESTRAS_PAQUETES.filter((p) => p.prellenable);
  for (const p of prellenables) {
    const bytes = await fillMuestraPdf(`/forms/${p.archivo}`, p.key, donante);
    const path = `${donante.id}/${p.key}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("planillas")
      .upload(path, bytes, { contentType: "application/pdf", upsert: true, cacheControl: "0" });
    if (uploadError) continue;
    const { data: pub } = supabase.storage.from("planillas").getPublicUrl(path);
    await supabase.from("planillas_generadas").insert({
      donante_id: donante.id,
      planilla_key: p.key,
      archivo_url: pub.publicUrl,
    });
  }
}

// Combina los 7 PDFs prellenados ya generados (Storage) + el formulario
// de COVID en blanco (no se prellena) en un único PDF de varias páginas,
// listo para imprimir todo junto de una.
export async function combinarMuestrasPdfs(archivosUrl: string[]): Promise<Uint8Array> {
  const combinado = await PDFDocument.create();
  for (const url of archivosUrl) {
    const bytes = await fetch(url).then((r) => r.arrayBuffer());
    const src = await PDFDocument.load(bytes);
    const [pagina] = await combinado.copyPages(src, [0]);
    combinado.addPage(pagina);
  }
  return combinado.save();
}
