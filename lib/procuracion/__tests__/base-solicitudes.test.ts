import { test } from "node:test";
import assert from "node:assert/strict";
import { cambiosAlResolver, cambiosAlResponder, esAbierta, ordenarSolicitudes, sinRespuesta, urgenteVencida, validarRespuesta, validarSolicitud } from "../base-solicitudes.ts";
import { solicitudDemo } from "./fixtures/base-simulados.ts";

const AHORA = new Date(2026, 9, 10, 14, 0).getTime();
const hace = (min: number) => new Date(AHORA - min * 60_000).toISOString();

test("crear: qué se pide y a quién, obligatorio; a otro rol; textos recortados", () => {
  const base = { titulo: " Ecocardiograma ", detalle: "", origen: "base" as const, destino: "procurador" as const, prioridad: "urgente" as const, pedidoPor: " Laura " };
  assert.deepEqual(validarSolicitud(base), {
    ok: true,
    datos: { titulo: "Ecocardiograma", detalle: null, origen: "base", destino: "procurador", organo_key: null, prioridad: "urgente", pedido_por: "Laura" },
  });
  assert.equal(validarSolicitud({ ...base, titulo: "  " }).ok, false);
  assert.equal(validarSolicitud({ ...base, destino: null }).ok, false);
  assert.equal(validarSolicitud({ ...base, destino: "base" }).ok, false);
  assert.equal(validarSolicitud({ ...base, titulo: "x".repeat(201) }).ok, false);
});

test("responder y resolver: solo cambian sus columnas", () => {
  assert.deepEqual(validarRespuesta(" en 20 min ", ""), { ok: true, respuesta: "en 20 min", respondidaPor: null });
  assert.equal(validarRespuesta(" ", "x").ok, false);
  assert.deepEqual(cambiosAlResponder("ok", "Ana", "T"), { respuesta: "ok", respondida_por: "Ana", respondida_en: "T", estado: "en_proceso" });
  assert.deepEqual(cambiosAlResolver("T"), { estado: "completado", completed_at: "T" });
});

test("abierta / sin respuesta / urgente vencida (>30 min)", () => {
  const s = (extra = {}) => solicitudDemo("s", "d", AHORA, { prioridad: "urgente", created_at: hace(31), ...extra });
  assert.equal(esAbierta(s()), true);
  assert.equal(esAbierta(s({ estado: "completado" })), false);
  assert.equal(esAbierta(s({ anulado: true })), false);
  assert.equal(sinRespuesta(s({ respuesta: "ya va" })), false);
  assert.equal(urgenteVencida(s(), AHORA), true);
  assert.equal(urgenteVencida(s({ created_at: hace(30) }), AHORA), false);
  assert.equal(urgenteVencida(s({ prioridad: "normal" }), AHORA), false);
});

test("orden: abiertas (urgentes y más viejas primero), resueltas (más nueva primero), anuladas al final", () => {
  const xs = [
    solicitudDemo("res-vieja", "d", AHORA, { estado: "completado", created_at: hace(300) }),
    solicitudDemo("anulada", "d", AHORA, { anulado: true, created_at: hace(1) }),
    solicitudDemo("normal", "d", AHORA, { created_at: hace(200) }),
    solicitudDemo("urg-nueva", "d", AHORA, { prioridad: "urgente", created_at: hace(5) }),
    solicitudDemo("urg-vieja", "d", AHORA, { prioridad: "urgente", created_at: hace(50) }),
    solicitudDemo("res-nueva", "d", AHORA, { estado: "completado", created_at: hace(100) }),
  ];
  assert.deepEqual(ordenarSolicitudes(xs).map((x) => x.id), ["urg-vieja", "urg-nueva", "normal", "res-nueva", "res-vieja", "anulada"]);
});
