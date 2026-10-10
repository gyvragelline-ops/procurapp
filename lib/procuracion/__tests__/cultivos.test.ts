import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TIPOS_CULTIVO,
  estadoEtapaCultivos,
  etiquetaCultivo,
  lineasCultivosMedico,
  validarAlta,
  validarResultado,
  type Cultivo,
} from "../cultivos-calculos.ts";

const h = (hora: number, min = 0) => new Date(2026, 9, 6, hora, min).getTime();
const iso = (hora: number, min = 0) => new Date(h(hora, min)).toISOString();
const cult = (id: string, extra: Partial<Cultivo> = {}): Cultivo => ({
  id, tipo: "hemocultivo", tipo_otro: null, tomado_en: iso(8), estado: "pendiente", germen: null, sensibilidad: null,
  resultado_en: null, modificado_en: null, anulado: false, ...extra,
});

// ---------------------------------------------------------------- tipos
test("tipos: las 7 etiquetas; 'otro' muestra su texto", () => {
  assert.deepEqual(TIPOS_CULTIVO.map((t) => t.etiqueta), [
    "Aspirado traqueal", "Hemocultivos", "Punta de CVC", "Punta de TAM", "LCR", "Urocultivo", "Otro",
  ]);
  assert.equal(etiquetaCultivo({ tipo: "otro", tipo_otro: "Líquido pleural" }), "Líquido pleural");
  assert.equal(etiquetaCultivo({ tipo: "lcr", tipo_otro: null }), "LCR");
});

// ---------------------------------------------------------------- alta
test("alta: tipo obligatorio; 'otro' exige texto y los demás no lo guardan; toma no futura", () => {
  const ahora = h(10);
  assert.deepEqual(validarAlta({ tipo: null, tipoOtro: "", tomadoEnIso: iso(9) }, ahora), { ok: false, error: "Elegí el tipo de cultivo." });
  assert.deepEqual(validarAlta({ tipo: "otro", tipoOtro: "  ", tomadoEnIso: iso(9) }, ahora), { ok: false, error: "Escribí qué cultivo es." });
  assert.deepEqual(validarAlta({ tipo: "otro", tipoOtro: " Pleural ", tomadoEnIso: iso(9) }, ahora), {
    ok: true, datos: { tipo: "otro", tipo_otro: "Pleural", tomado_en: iso(9) },
  });
  assert.deepEqual(validarAlta({ tipo: "lcr", tipoOtro: "quedó escrito", tomadoEnIso: iso(9) }, ahora), {
    ok: true, datos: { tipo: "lcr", tipo_otro: null, tomado_en: iso(9) },
  });
  assert.equal(validarAlta({ tipo: "lcr", tipoOtro: "", tomadoEnIso: iso(11) }, ahora).ok, false); // futura
});

// ---------------------------------------------------------------- resultado
test("resultado: positivo exige germen (texto libre); sensibilidad opcional", () => {
  const ahora = h(20);
  assert.deepEqual(validarResultado(cult("a"), { estado: "positivo", germen: " ", sensibilidad: "", resultadoEnIso: iso(18) }, ahora), {
    ok: false, error: "Si es positivo, escribí el germen.",
  });
  const r = validarResultado(cult("a"), { estado: "positivo", germen: " Bacilos gram negativos ", sensibilidad: "", resultadoEnIso: iso(18) }, ahora);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.cambios, { estado: "positivo", germen: "Bacilos gram negativos", sensibilidad: null, resultado_en: iso(18), modificado_en: null });
  assert.equal(validarResultado(cult("a"), { estado: null, germen: "", sensibilidad: "", resultadoEnIso: iso(18) }, ahora).ok, false);
});

test("resultado: negativo no guarda germen ni sensibilidad", () => {
  const r = validarResultado(cult("a"), { estado: "negativo", germen: "lo que sea", sensibilidad: "x", resultadoEnIso: iso(18) }, h(20));
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual([r.cambios.germen, r.cambios.sensibilidad], [null, null]);
});

test("resultado: no anterior a la toma ni futuro", () => {
  assert.deepEqual(validarResultado(cult("a", { tomado_en: iso(8) }), { estado: "negativo", germen: "", sensibilidad: "", resultadoEnIso: iso(7) }, h(20)), {
    ok: false, error: "El resultado no puede ser anterior a la toma.",
  });
  assert.equal(validarResultado(cult("a"), { estado: "negativo", germen: "", sensibilidad: "", resultadoEnIso: iso(21) }, h(20)).ok, false);
});

test("sobre el mismo registro: solo columnas de resultado (nunca tipo ni toma); corregir deja modificado_en", () => {
  const r = validarResultado(cult("a"), { estado: "negativo", germen: "", sensibilidad: "", resultadoEnIso: iso(18) }, h(20));
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(Object.keys(r.cambios).sort(), ["estado", "germen", "modificado_en", "resultado_en", "sensibilidad"]);
  // primera carga: sin marca de corrección
  if (r.ok) assert.equal(r.cambios.modificado_en, null);
  // corrección de un resultado ya cargado: la hora de ahora ("corregido HH:MM")
  const yaCargado = cult("a", { estado: "negativo", resultado_en: iso(18) });
  const c = validarResultado(yaCargado, { estado: "positivo", germen: "S. aureus", sensibilidad: "Oxacilina S", resultadoEnIso: iso(19) }, h(20, 15));
  assert.ok(c.ok);
  if (c.ok) assert.equal(c.cambios.modificado_en, iso(20, 15));
});

// ---------------------------------------------------------------- etapa
test("etapa: solo avance (gris sin cultivos, ámbar con pendientes, verde si todos tienen resultado); un positivo no se marca afuera", () => {
  assert.equal(estadoEtapaCultivos([]), "gray");
  assert.equal(estadoEtapaCultivos([cult("a"), cult("b", { estado: "negativo" })]), "amber");
  // con un positivo, la etapa queda verde como cualquier otra completa: sin color ni texto de alerta
  assert.equal(estadoEtapaCultivos([cult("a", { estado: "positivo", germen: "S. aureus", resultado_en: iso(9) }), cult("b", { estado: "negativo" })]), "green");
  assert.equal(estadoEtapaCultivos([cult("a", { estado: "positivo", germen: "S. aureus", resultado_en: iso(9) })]), "green");
  // anulados no cuentan
  assert.equal(estadoEtapaCultivos([cult("a", { anulado: true })]), "gray");
});

// ---------------------------------------------------------------- vista del médico
test("vista del médico: positivo = alerta; pendiente = gris con horas sin resultado; negativo y anulado no aparecen", () => {
  const cultivos = [
    cult("p", { tipo: "aspirado_traqueal", tomado_en: iso(6, 30), estado: "positivo", germen: "Klebsiella pneumoniae", resultado_en: iso(10, 20) }),
    cult("q", { tipo: "hemocultivo", tomado_en: iso(2, 10) }),
    cult("r", { tipo: "urocultivo", tomado_en: iso(20, 40) }),
    cult("n", { estado: "negativo", resultado_en: iso(9) }),
    cult("x", { anulado: true }),
  ];
  const l = lineasCultivosMedico(cultivos, h(21));
  assert.deepEqual(l.alertas, [{ id: "p", texto: "✕ Aspirado traqueal positivo · Klebsiella pneumoniae · resultado 10:20" }]);
  assert.deepEqual(l.pendientes, [
    { id: "q", texto: "Hemocultivos pendiente hace 18 h" },
    { id: "r", texto: "Urocultivo pendiente hace menos de 1 h" },
  ]);
});
