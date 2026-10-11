import { test } from "node:test";
import assert from "node:assert/strict";
import { lineaBaseValida, lineaConAutor, lineaSolicitudBase, validarNombreBase } from "../base-nombre.ts";
import { textoLineaAccion } from "../base-secciones.ts";
import { textoTimelineCierre, textoTimelineReapertura } from "../base-tablero.ts";
import { textoTimelineExportacion } from "../base-exportar.ts";

const AHORA = new Date(2026, 9, 11, 15, 4).getTime();

test("nombre: obligatorio, sin espacios de más; 'sin nombre' no vale", () => {
  assert.deepEqual(validarNombreBase("  Ana   Pérez "), { ok: true, nombre: "Ana Pérez" });
  assert.equal(validarNombreBase("").ok, false);
  assert.equal(validarNombreBase("   ").ok, false);
  assert.equal(validarNombreBase("Sin nombre").ok, false);
  assert.equal(validarNombreBase("x".repeat(81)).ok, false);
});

test("las líneas que no traían autor ahora lo llevan", () => {
  assert.equal(lineaConAutor("Ana", textoTimelineExportacion("todo", false, "15:04")), "Base · Ana · Exportado completo, 15:04");
  assert.equal(lineaConAutor("Ana", textoTimelineCierre("otro", "traslado", "15:04")), "Base · Ana · Protocolo cerrado — Otro: traslado (15:04)");
  assert.equal(lineaConAutor("Ana", textoTimelineReapertura("15:04")), "Base · Ana · Protocolo reabierto (15:04)");
  assert.throws(() => lineaConAutor("  ", "x"), /Falta el nombre/);
});

test("solicitudes desde la Base: cada acción con su línea y su autor", () => {
  assert.equal(lineaSolicitudBase("pidió", { titulo: "orina", prioridad: "urgente" }, "Ana", AHORA), "Base · Ana · pidió (urgente): «orina» (15:04)");
  assert.equal(lineaSolicitudBase("pidió", { titulo: "orina", prioridad: "normal" }, "Ana", AHORA), "Base · Ana · pidió: «orina» (15:04)");
  assert.equal(lineaSolicitudBase("respondió", { titulo: "orina" }, "Ana", AHORA, "ya va"), "Base · Ana · respondió la solicitud «orina»: ya va (15:04)");
  assert.equal(lineaSolicitudBase("resolvió", { titulo: "orina" }, "Ana", AHORA), "Base · Ana · resolvió la solicitud «orina» (15:04)");
  assert.equal(lineaSolicitudBase("anuló", { titulo: "orina" }, "Ana", AHORA), "Base · Ana · anuló la solicitud «orina» (15:04)");
});

test("control final: una línea de la Base sin nombre no se graba", () => {
  assert.equal(lineaBaseValida("Base · Ana · copió 01 Potencial donante (15:04)"), true);
  assert.equal(lineaBaseValida(textoLineaAccion("copió", { numero: "01", titulo: "Potencial donante" }, "", AHORA)), false);
  assert.equal(lineaBaseValida("Base ·  · copió algo"), false);
  assert.equal(lineaBaseValida("Exportado completo, 15:04"), false);
  assert.equal(lineaBaseValida("Solicitud urgente: orina"), false);
});
