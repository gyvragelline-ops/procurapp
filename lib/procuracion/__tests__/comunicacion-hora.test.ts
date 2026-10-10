import { test } from "node:test";
import assert from "node:assert/strict";
import { comunicadaEn, validarHoraComunicacion } from "../comunicacion-hora.ts";

const AHORA = new Date(2026, 9, 10, 14, 0).getTime();

test("fecha y hora de la comunicación: obligatoria y nunca futura", () => {
  const antes = new Date(AHORA - 3_600_000).toISOString();
  assert.deepEqual(validarHoraComunicacion(antes, AHORA), { ok: true, iso: antes });
  assert.equal(validarHoraComunicacion(null, AHORA).ok, false);
  assert.equal(validarHoraComunicacion("no es fecha", AHORA).ok, false);
  assert.equal(validarHoraComunicacion(new Date(AHORA + 10 * 60_000).toISOString(), AHORA).ok, false);
  assert.equal(validarHoraComunicacion(new Date(AHORA + 30_000).toISOString(), AHORA).ok, true); // margen de reloj
});

test("se lee de documentacion_estado.meta.comunicada_en", () => {
  assert.equal(comunicadaEn({ comunicada_en: "2026-10-10T09:05:00.000Z" }), "2026-10-10T09:05:00.000Z");
  assert.equal(comunicadaEn({}), null);
  assert.equal(comunicadaEn(null), null);
  assert.equal(comunicadaEn({ comunicada_en: "x" }), null);
});
