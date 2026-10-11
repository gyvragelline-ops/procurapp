import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONSULTA_SOLICITUDES_MS,
  cambiosEnProceso,
  cambiosResuelto,
  contadorProcurador,
  lineaEnProceso,
  lineaPedido,
  lineaResuelto,
  paraElProcurador,
  pedidosALaBase,
  resueltasDelProcurador,
  validarPedidoALaBase,
} from "../solicitudes-procurador.ts";
import { solicitudDemo } from "./fixtures/base-simulados.ts";

const AHORA = new Date(2026, 9, 10, 22, 15).getTime();
const hace = (min: number) => new Date(AHORA - min * 60_000).toISOString();
const s = (id: string, extra = {}) => solicitudDemo(id, "d", AHORA, { origen: "base", destino: "procurador", created_at: hace(10), ...extra });

test("al procurador: destino procurador, no anuladas, no completadas; urgentes primero y después la más vieja", () => {
  const xs = [
    s("normal-vieja", { created_at: hace(90) }),
    s("urg-nueva", { prioridad: "urgente", created_at: hace(5) }),
    s("urg-vieja", { prioridad: "urgente", created_at: hace(40) }),
    s("en-proceso", { estado: "en_proceso", created_at: hace(20) }),
    s("resuelta", { estado: "completado" }),
    s("anulada", { anulado: true }),
    s("a-la-base", { origen: "procurador", destino: "base" }),
    s("al-equipo", { destino: "equipo" }),
  ];
  assert.deepEqual(paraElProcurador(xs).map((x) => x.id), ["urg-vieja", "urg-nueva", "normal-vieja", "en-proceso"]);
  assert.deepEqual(contadorProcurador(xs), { abiertas: 4, urgentes: 2 });
  assert.deepEqual(resueltasDelProcurador(xs).map((x) => x.id), ["resuelta"]);
  assert.deepEqual(pedidosALaBase(xs).map((x) => x.id), ["a-la-base"]);
});

test("las 2 solicitudes reales (Base → procurador, pendientes) le llegan al procurador", () => {
  const reales = [
    s("567d1ba0", { titulo: "orina", detalle: "hola me pasas una orina por favor", prioridad: "normal", estado: "pendiente", created_at: hace(60) }),
    s("4d676e41", { titulo: "orina", detalle: "orina pre ablación", prioridad: "urgente", estado: "pendiente", created_at: hace(59) }),
  ];
  assert.deepEqual(paraElProcurador(reales).map((x) => x.id), ["4d676e41", "567d1ba0"]);
  assert.deepEqual(contadorProcurador(reales), { abiertas: 2, urgentes: 1 });
});

test("acciones: En proceso; Resuelto con respuesta corta opcional", () => {
  assert.deepEqual(cambiosEnProceso(), { estado: "en_proceso" });
  assert.deepEqual(cambiosResuelto("  ", "Ana", "T"), { ok: true, cambios: { estado: "completado", completed_at: "T" } });
  assert.deepEqual(cambiosResuelto(" ya la mandé ", " Ana ", "T"), {
    ok: true,
    cambios: { estado: "completado", completed_at: "T", respuesta: "ya la mandé", respondida_por: "Ana", respondida_en: "T" },
  });
  assert.deepEqual(cambiosResuelto("ok", "", "T"), { ok: true, cambios: { estado: "completado", completed_at: "T", respuesta: "ok", respondida_por: null, respondida_en: "T" } });
  assert.equal(cambiosResuelto("x".repeat(301), "Ana", "T").ok, false);
});

test("pedir a la Base: origen procurador, destino base; título obligatorio", () => {
  assert.deepEqual(validarPedidoALaBase({ titulo: " Ecocardiograma ", detalle: "", prioridad: "urgente", nombre: " Ana " }), {
    ok: true,
    datos: { titulo: "Ecocardiograma", detalle: null, origen: "procurador", destino: "base", organo_key: null, prioridad: "urgente", pedido_por: "Ana" },
  });
  assert.equal(validarPedidoALaBase({ titulo: " ", detalle: "", prioridad: "normal", nombre: "" }).ok, false);
});

test("líneas de la línea de tiempo con el estilo de las demás", () => {
  assert.equal(lineaEnProceso({ titulo: "orina" }, "Ana", AHORA), "Procurador · Ana · marcó en proceso la solicitud «orina» (22:15)");
  assert.equal(lineaResuelto({ titulo: "orina" }, "", "", AHORA), "Procurador · sin nombre · resolvió la solicitud «orina» (22:15)");
  assert.equal(lineaResuelto({ titulo: "orina" }, "enviada", "Ana", AHORA), "Procurador · Ana · resolvió la solicitud «orina»: enviada (22:15)");
  assert.equal(lineaPedido({ titulo: "Eco", prioridad: "urgente" }, "Ana", AHORA), "Procurador · Ana · pidió a la Base (urgente): «Eco» (22:15)");
});

test("actualización automática cada 30 s", () => {
  assert.equal(CONSULTA_SOLICITUDES_MS, 30_000);
});
