import { test } from "node:test";
import assert from "node:assert/strict";
import { CONSULTA_BASE_MS, estadoActualizacion } from "../base-actualizacion.ts";

const T = (h: number, m: number, s: number) => new Date(2026, 9, 10, h, m, s).getTime();

test("actualización: 'Actualizado HH:MM:SS' si la última consulta salió bien", () => {
  assert.deepEqual(estadoActualizacion(T(14, 5, 9), null), { tipo: "ok", texto: "Actualizado 14:05:09" });
  // un fallo viejo, ya superado por una consulta buena
  assert.equal(estadoActualizacion(T(14, 5, 9), T(14, 4, 0)).tipo, "ok");
  assert.deepEqual(estadoActualizacion(null, null), { tipo: "cargando", texto: "Cargando…" });
});

test("actualización: si falla, 'Sin conexión: datos de HH:MM' (no se muestran como actuales)", () => {
  assert.deepEqual(estadoActualizacion(T(14, 5, 9), T(14, 5, 40)), { tipo: "sin_conexion", texto: "Sin conexión: datos de 14:05" });
  assert.deepEqual(estadoActualizacion(null, T(14, 5, 40)), { tipo: "sin_conexion", texto: "Sin conexión: todavía no hay datos" });
});

test("refresco automático entre 30 y 60 s", () => {
  assert.ok(CONSULTA_BASE_MS >= 30_000 && CONSULTA_BASE_MS <= 60_000);
});
