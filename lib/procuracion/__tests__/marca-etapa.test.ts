import { test } from "node:test";
import assert from "node:assert/strict";
import { esMarca, estadoConMarca, primeraNoCompleta, proximaMarca, textoTimelineMarca } from "../marca-etapa.ts";

test("marca manual 'completo' prevalece: verde; si el cálculo no era verde, avisa datos faltantes", () => {
  assert.deepEqual(estadoConMarca("amber", "completo"), { estado: "green", manual: true, faltanDatos: true });
  assert.deepEqual(estadoConMarca("gray", "completo"), { estado: "green", manual: true, faltanDatos: true });
  assert.deepEqual(estadoConMarca(undefined, "completo"), { estado: "green", manual: true, faltanDatos: true });
  assert.deepEqual(estadoConMarca("green", "completo"), { estado: "green", manual: true, faltanDatos: false });
});

test("marca manual 'no completo': nunca verde (verde calculado pasa a ámbar); si no, el cálculo", () => {
  assert.deepEqual(estadoConMarca("green", "no_completo"), { estado: "amber", manual: true, faltanDatos: false });
  assert.deepEqual(estadoConMarca("gray", "no_completo"), { estado: "gray", manual: true, faltanDatos: false });
  assert.deepEqual(estadoConMarca("red", "no_completo"), { estado: "red", manual: true, faltanDatos: false });
});

test("sin marca: el estado calculado (sin dato, gris)", () => {
  assert.deepEqual(estadoConMarca("amber", null), { estado: "amber", manual: false, faltanDatos: false });
  assert.deepEqual(estadoConMarca(undefined, undefined), { estado: "gray", manual: false, faltanDatos: false });
});

test("anillo: la primera etapa no completa, en el orden de la lista", () => {
  const e: Record<string, "green" | "amber" | "gray"> = { a: "green", b: "green", c: "amber", d: "gray" };
  assert.equal(primeraNoCompleta(["a", "b", "c", "d"], (k) => e[k]), "c");
  assert.equal(primeraNoCompleta(["a", "x"], (k) => e[k]), "x"); // sin dato cuenta como no completa
  assert.equal(primeraNoCompleta(["a", "b"], (k) => e[k]), null);
});

test("botón: ofrece lo contrario de lo visible; textos de la línea de tiempo", () => {
  assert.equal(proximaMarca("green"), "no_completo");
  assert.equal(proximaMarca("amber"), "completo");
  assert.equal(proximaMarca("gray"), "completo");
  assert.equal(textoTimelineMarca("Cultivos", "completo", "14:05"), "Cultivos — marcada completa manualmente (14:05)");
  assert.equal(textoTimelineMarca("Cultivos", "no_completo", "14:05"), "Cultivos — marcada no completa manualmente (14:05)");
  assert.equal(textoTimelineMarca("Cultivos", null, "14:05"), "Cultivos — se quitó la marca manual; vuelve al cálculo (14:05)");
  assert.equal(esMarca("completo"), true);
  assert.equal(esMarca("x"), false);
  assert.equal(esMarca(null), false);
});
