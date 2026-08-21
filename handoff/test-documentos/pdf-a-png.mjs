// Rasteriza un PDF a PNG por página, para confirmar visualmente el
// resultado de generarDocumentoPdf (posición y tamaño de fuente de los
// campos) sin depender de la extensión de Chrome ni de abrir el PDF a
// mano. Usa pdfjs-dist + @napi-rs/canvas (ambos devDependencies).
//
// Uso: node handoff/test-documentos/pdf-a-png.mjs <archivo.pdf> <dir_salida>
import fs from "fs";
import path from "path";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const [, , pdfPath, outDir] = process.argv;
if (!pdfPath || !outDir) {
  console.error("Uso: node pdf-a-png.mjs <archivo.pdf> <dir_salida>");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const data = new Uint8Array(fs.readFileSync(pdfPath));
const standardFontDataUrl = new URL("../../node_modules/pdfjs-dist/standard_fonts/", import.meta.url).href;
const doc = await getDocument({ data, disableFontFace: true, standardFontDataUrl }).promise;

for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  const outFile = path.join(outDir, `page${i}.png`);
  fs.writeFileSync(outFile, canvas.toBuffer("image/png"));
  console.log("Escrito:", outFile);
}
