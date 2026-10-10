// Cargador SOLO para tests: compila .tsx/.ts con TypeScript y resuelve
// "@/..." y los imports sin extensión, para poder renderizar componentes
// de app/ con react-dom/server dentro de `node --test`.
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const EXT = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

function buscar(base) {
  for (const e of EXT) {
    const f = base + e;
    if (existsSync(f) && !f.endsWith(path.sep) && path.extname(f)) return pathToFileURL(f).href;
  }
  return null;
}

export async function resolve(especificador, contexto, siguiente) {
  if (especificador.startsWith("@/")) {
    const url = buscar(path.join(RAIZ, especificador.slice(2)));
    if (url) return { url, shortCircuit: true };
  }
  if ((especificador.startsWith("./") || especificador.startsWith("../")) && contexto.parentURL?.startsWith("file:")) {
    const url = buscar(path.resolve(path.dirname(fileURLToPath(contexto.parentURL)), especificador));
    if (url) return { url, shortCircuit: true };
  }
  return siguiente(especificador, contexto);
}

export async function load(url, contexto, siguiente) {
  if (/\.tsx?$/.test(url) && !url.includes("/node_modules/")) {
    const fuente = await readFile(fileURLToPath(url), "utf8");
    const { outputText } = ts.transpileModule(fuente, {
      fileName: fileURLToPath(url),
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, verbatimModuleSyntax: false },
    });
    return { format: "module", source: outputText, shortCircuit: true };
  }
  return siguiente(url, contexto);
}
