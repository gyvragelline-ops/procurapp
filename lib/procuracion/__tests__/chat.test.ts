import { test } from "node:test";
import assert from "node:assert/strict";
import { contarNoLeidos, esMio, marcaDeLectura, mensajesOrdenados, validarMensaje, type MensajeCaso } from "../chat-calculos.ts";

const iso = (hora: number, min = 0) => new Date(2026, 9, 10, hora, min).toISOString();
const m = (id: string, rol: MensajeCaso["rol"], creado: string, anulado = false): MensajeCaso => ({ id, rol, autor: null, texto: id, creado_en: creado, anulado });

test("mensaje: rol obligatorio; texto de 1 a 1000 caracteres; nombre opcional", () => {
  assert.deepEqual(validarMensaje({ rol: null, autor: "", texto: "hola" }), { ok: false, error: "Elegí quién escribe (Procurador, Base o Equipo)." });
  assert.deepEqual(validarMensaje({ rol: "base", autor: "", texto: "   " }), { ok: false, error: "Escribí el mensaje." });
  assert.equal(validarMensaje({ rol: "base", autor: "", texto: "x".repeat(1001) }).ok, false);
  assert.deepEqual(validarMensaje({ rol: "equipo", autor: " Riñón Italiano ", texto: " Salimos 15:30 " }), {
    ok: true, datos: { rol: "equipo", autor: "Riñón Italiano", texto: "Salimos 15:30" },
  });
  assert.deepEqual(validarMensaje({ rol: "procurador", autor: "  ", texto: "ok" }), { ok: true, datos: { rol: "procurador", autor: null, texto: "ok" } });
});

test("orden de chat: del más viejo al más nuevo; los anulados se conservan (tachados en pantalla)", () => {
  assert.deepEqual(mensajesOrdenados([m("c", "base", iso(11)), m("a", "base", iso(9), true), m("b", "base", iso(10))]).map((x) => [x.id, x.anulado]), [
    ["a", true], ["b", false], ["c", false],
  ]);
});

test("míos (a la derecha) = los del rol elegido en el dispositivo; sin rol elegido, ninguno", () => {
  assert.equal(esMio({ rol: "base" }, "base"), true);
  assert.equal(esMio({ rol: "base" }, "procurador"), false);
  assert.equal(esMio({ rol: "base" }, null), false);
});

test("sin leer: de otros roles, no anulados, posteriores a la última lectura del dispositivo", () => {
  const ms = [
    m("1", "base", iso(9)),
    m("2", "procurador", iso(10)), // mío
    m("3", "equipo", iso(11)),
    m("4", "base", iso(12), true), // anulado
    m("5", "base", iso(13)),
  ];
  assert.equal(contarNoLeidos(ms, null, "procurador"), 3); // nunca lo abrió: todos los de otros
  assert.equal(contarNoLeidos(ms, iso(10, 30), "procurador"), 2); // 3 y 5
  assert.equal(contarNoLeidos(ms, iso(13), "procurador"), 0);
  assert.equal(contarNoLeidos(ms, null, null), 4); // sin rol elegido: todos menos el anulado
});

test("al abrir el chat, la marca de lectura es la hora del último mensaje", () => {
  assert.equal(marcaDeLectura([m("a", "base", iso(9)), m("b", "base", iso(12)), m("c", "base", iso(10))]), iso(12));
  assert.equal(marcaDeLectura([]), null);
});
