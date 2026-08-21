// Rasteriza un PDF a PNG por página, para confirmar visualmente el
// resultado de generarDocumentoPdf (posición y tamaño de fuente de los
// campos) sin depender de la extensión de Chrome ni de abrir el PDF a
// mano. Usa pdfjs-dist + @napi-rs/canvas (ambos devDependencies).
//
// Uso: node handoff/test-documentos/pdf-a-png.mjs <archivo.pdf> <dir_salida>
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const [, , pdfPath, outDir, scaleArg] = process.argv;
if (!pdfPath || !outDir) {
  console.error("Uso: node pdf-a-png.mjs <archivo.pdf> <dir_salida> [escala=2.0]");
  process.exit(1);
}
const scale = scaleArg ? Number(scaleArg) : 2.0;
fs.mkdirSync(outDir, { recursive: true });

const data = new Uint8Array(fs.readFileSync(pdfPath));
// pdfjs-dist en Node usa fetch() para standardFontDataUrl -- fetch no
// soporta file://, así que hay que pasar una ruta de filesystem simple
// (termina en "/") para que use fs.readFile internamente.
const standardFontDataUrl =
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../../node_modules/pdfjs-dist/standard_fonts").replace(/\\/g, "/") + "/";
const doc = await getDocument({ data, disableFontFace: true, standardFontDataUrl, useSystemFonts: false }).promise;

for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  const outFile = path.join(outDir, `page${i}.png`);
  fs.writeFileSync(outFile, canvas.toBuffer("image/png"));
  console.log("Escrito:", outFile);
}
