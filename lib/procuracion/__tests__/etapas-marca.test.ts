import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { STAGES_CORNEAS, STAGES_MULTIORGANICO, type EstadoEtapa } from "../constants.ts";

// Render real de los componentes (app/*.tsx) con react-dom/server.
register("./soporte/cargador-tsx.mjs", import.meta.url);
const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { default: EtapaFila } = await import("../../../app/etapa-fila.tsx");
const { guardarMarca } = await import("../marca-etapa-datos.ts");

// Todas las etapas que existen (multiorgánico, con judicial, y córneas).
const TODAS = [...STAGES_MULTIORGANICO, ...STAGES_CORNEAS].filter((s, i, a) => a.findIndex((x) => x.key === s.key) === i);

type Props = { calculado?: EstadoEtapa; marca?: { marca: "completo" | "no_completo"; en: string | null }; disponible?: boolean; abierta?: boolean };
function render(etapa: { key: string; label: string }, p: Props = {}) {
  return renderToStaticMarkup(
    createElement(
      EtapaFila,
      {
        etapa,
        numero: 1,
        donanteId: "d1",
        calculado: p.calculado,
        marca: p.marca,
        marcasDisponibles: p.disponible ?? true,
        abierta: p.abierta ?? true,
        onAlternar: () => {},
        onMarca: () => {},
      },
      createElement("div", { "data-contenido": etapa.key }, "contenido propio")
    )
  );
}

test("las 13 etapas multiorgánicas (y las de córneas) renderizan la marca, al final del contenido", () => {
  assert.equal(STAGES_MULTIORGANICO.length, 13);
  for (const s of TODAS) {
    const html = render(s);
    const marca = html.indexOf(`data-marca-etapa="${s.key}"`);
    assert.ok(marca > 0, `la etapa ${s.key} no renderiza la marca`);
    assert.ok(html.indexOf(`data-contenido="${s.key}"`) < marca, `en ${s.key} la marca no está al final`);
    assert.match(html, /Marcar completo/, s.key);
    assert.equal(render(s, { abierta: false }).includes("data-marca-etapa"), false, `${s.key}: cerrada no muestra la marca`);
  }
});

test("en todas: la marca manual prevalece, con 'marcado manualmente' y la nota de datos faltantes", () => {
  for (const s of TODAS) {
    const completa = render(s, { calculado: "amber", marca: { marca: "completo", en: "2026-10-10T14:05:00Z" } });
    assert.match(completa, /chip-green/, `${s.key}: marcada completa debe verse verde`);
    assert.match(completa, /marcado manualmente \d{2}:\d{2}/, s.key);
    assert.match(completa, /Marcada completa; el sistema ve datos faltantes/, s.key);
    assert.match(completa, /Marcar no completo/, s.key);

    const noCompleta = render(s, { calculado: "green", marca: { marca: "no_completo", en: "2026-10-10T14:05:00Z" } });
    assert.match(noCompleta, /chip-amber/, `${s.key}: marcada no completa no puede verse verde`);
    assert.doesNotMatch(noCompleta, /chip-green/, s.key);
    assert.match(noCompleta, /marcado manualmente/, s.key);

    const sinMarca = render(s, { calculado: "green" });
    assert.match(sinMarca, /chip-green/, s.key);
    assert.doesNotMatch(sinMarca, /marcado manualmente/, s.key);
  }
});

test("sin el SQL aplicado el botón se ve igual (deshabilitado) y explica por qué", () => {
  for (const s of TODAS) {
    const html = render(s, { disponible: false });
    assert.match(html, /<button[^>]*disabled[^>]*>Marcar completo<\/button>/, s.key);
    assert.match(html, /falta aplicar el SQL/, s.key);
  }
});

test("en todas: guardar la marca escribe etapas_estado y deja la línea de tiempo con el nombre de la etapa", async () => {
  for (const s of TODAS) {
    const llamadas: { tabla: string; op: string; datos: unknown }[] = [];
    const respuesta = (tabla: string, op: string, datos: unknown) => {
      llamadas.push({ tabla, op, datos });
      const r = { data: op === "update" ? [{ id: "e1" }] : null, error: null };
      const q = { eq: () => q, select: () => q, then: (ok: (x: typeof r) => unknown) => Promise.resolve(r).then(ok) };
      return q;
    };
    const supabase = { from: (t: string) => ({ update: (d: unknown) => respuesta(t, "update", d), insert: (d: unknown) => respuesta(t, "insert", d) }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await guardarMarca(supabase as any, "d1", s.key, s.label, "completo");
    assert.equal(r.avisoTimeline, null);
    assert.deepEqual(llamadas.map((l) => `${l.tabla}.${l.op}`), ["etapas_estado.update", "timeline_eventos.insert"], s.key);
    assert.equal((llamadas[0].datos as { marcado_manual: string }).marcado_manual, "completo");
    assert.ok((llamadas[1].datos as { texto: string }).texto.startsWith(`${s.label} — marcada completa manualmente`), s.key);
  }
});

test("la marca se renderiza SOLO desde el contenedor común (ninguna etapa la pone por su cuenta)", () => {
  const app = new URL("../../../app/", import.meta.url);
  const usan = readdirSync(app).filter((f) => f.endsWith(".tsx") && /<MarcaEtapa\b/.test(readFileSync(new URL(f, app), "utf8")));
  assert.deepEqual(usan, ["etapa-fila.tsx"]);
  const pagina = readFileSync(new URL("page.tsx", app), "utf8");
  assert.match(pagina, /visibleStages\.map\(\(s, idx\) => \{[\s\S]*?<EtapaFila\b/);
});
