import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alarmasEnfermeria,
  calcularBalance,
  concentracion,
  dosisDesdeVelocidad,
  horasDelCaso,
  inicioDeHora,
  liquidosPrecargados,
  perdidasInsensiblesHora,
  registroDeLaHora,
  temperaturaParaPerdidas,
  textoConfirmacionDilucion,
  totalesFila,
  velocidadDesdeDosis,
  volumenBombasEnHora,
  type InfusionFila,
  type RegistroBase,
} from "../mantenimiento-calculos.ts";

const cerca = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} no es ≈ ${b}`);
// Horas locales armadas con el constructor local (independiente del huso).
const h = (hora: number, min = 0) => new Date(2026, 9, 6, hora, min).getTime();
const iso = (hora: number, min = 0) => new Date(h(hora, min)).toISOString();

// ---------------------------------------------------------------- pérdidas insensibles
test("pérdidas insensibles por hora = 255 × (T − 36) / 24; T ≤ 36 -> 0", () => {
  cerca(perdidasInsensiblesHora(37)!, 10.625);
  cerca(perdidasInsensiblesHora(38)!, 21.25);
  assert.equal(perdidasInsensiblesHora(36), 0);
  assert.equal(perdidasInsensiblesHora(35), 0);
  cerca(perdidasInsensiblesHora(38.5)!, 26.5625);
  assert.equal(perdidasInsensiblesHora(null), null);
});

test("temperatura para pérdidas: la de la fila, o la última anterior con su hora", () => {
  const regs = [
    { registrado_en: iso(8), anulado: false, temperatura: 37.5 },
    { registrado_en: iso(9), anulado: false, temperatura: 38 },
    { registrado_en: iso(10), anulado: true, temperatura: 40 }, // anulada: no cuenta
  ];
  assert.deepEqual(temperaturaParaPerdidas(regs, h(11), 37.2), { valor: 37.2, registrado_en: null, propia: true });
  assert.deepEqual(temperaturaParaPerdidas(regs, h(11), null), { valor: 38, registrado_en: iso(9), propia: false });
  assert.equal(temperaturaParaPerdidas([], h(11), null), null);
});

// ---------------------------------------------------------------- dosis por hora
test("furosemida en mg/h: 100 mg en 100 mL = 1 mg/mL; 5 mL/h = 5 mg/h (sin peso)", () => {
  const d = { ampollas: 5, contenidoPorAmpolla: 20, unidadContenido: "mg" as const, volumenFinalMl: 100 };
  const c = concentracion("furosemida", d);
  assert.ok(c.ok);
  if (!c.ok) return;
  assert.equal(c.unidad, "mg/mL");
  assert.equal(c.valor, 1);
  assert.equal(textoConfirmacionDilucion("furosemida", d), "100 mg en 100 mL = 1 mg/mL. ¿Correcto?");
  const r = dosisDesdeVelocidad("furosemida", 5, 1, null);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.unidad, "mg/h");
    assert.equal(r.dosis, 5);
    assert.match(r.cuenta, /5 mL\/h × 1 mg\/mL = 5 mg\/h/);
  }
  const v = velocidadDesdeDosis("furosemida", 10, 1, null);
  if (v.ok) assert.equal(v.velocidadMlH, 10);
});

test("insulina en U/h y potasio/bicarbonato en mEq/h", () => {
  const ins = concentracion("insulina", { ampollas: 1, contenidoPorAmpolla: 100, unidadContenido: "U", volumenFinalMl: 100 });
  assert.ok(ins.ok);
  if (ins.ok) {
    assert.equal(ins.unidad, "U/mL");
    const r = dosisDesdeVelocidad("insulina", 3, ins.valor, null);
    if (r.ok) assert.deepEqual([r.dosis, r.unidad], [3, "U/h"]);
  }
  const k = concentracion("potasio", { ampollas: 2, contenidoPorAmpolla: 20, unidadContenido: "mEq", volumenFinalMl: 500 });
  assert.ok(k.ok);
  if (k.ok) {
    assert.equal(k.unidad, "mEq/mL");
    cerca(k.valor, 0.08);
    const r = dosisDesdeVelocidad("potasio", 50, k.valor, null);
    if (r.ok) {
      cerca(r.dosis, 4);
      assert.equal(r.unidad, "mEq/h");
    }
    const v = velocidadDesdeDosis("potasio", 10, k.valor, null);
    if (v.ok) cerca(v.velocidadMlH, 125);
  }
  // unidades equivocadas se rechazan
  assert.equal(concentracion("potasio", { ampollas: 1, contenidoPorAmpolla: 20, unidadContenido: "mg", volumenFinalMl: 100 }).ok, false);
  assert.equal(concentracion("insulina", { ampollas: 1, contenidoPorAmpolla: 100, unidadContenido: "mg", volumenFinalMl: 100 }).ok, false);
  assert.equal(concentracion("bicarbonato", { ampollas: 1, contenidoPorAmpolla: 50, unidadContenido: "mEq", volumenFinalMl: 250 }).ok, true);
});

test("noradrenalina sigue en γ (las drogas por hora no cambian las demás)", () => {
  const d = dosisDesdeVelocidad("noradrenalina", 10, 80, 70);
  if (d.ok) {
    assert.equal(d.unidad, "mcg/kg/min");
    cerca(d.dosis, 800 / 4200);
  }
});

// ---------------------------------------------------------------- balance filas viejas y nuevas
test("balance: fila nueva (egresos incluye diuresis) y fila vieja (egresos sin diuresis)", () => {
  const base = (id: string, hora: number, extra: Partial<RegistroBase>): RegistroBase => ({
    id, registrado_en: iso(hora), anulado: false, diuresis_ml: null, diuresis_es_ultima_hora: false, ingresos_ml: null, egresos_ml: null, ...extra,
  });
  const b = calcularBalance([
    base("vieja", 8, { ingresos_ml: 500, egresos_ml: 50, diuresis_ml: 300 }), // 500 − (50 + 300) = 150
    base("nueva", 9, { ingresos_ml: 400, egresos_ml: 350, diuresis_ml: 300, egresos_incluye_diuresis: true }), // 400 − 350 = 50
  ]);
  assert.deepEqual(b.map((f) => [f.id, f.parcial, f.acumulado]), [["vieja", 150, 150], ["nueva", 50, 200]]);
});

// ---------------------------------------------------------------- totales de la fila
test("totales de la fila: ingresos = líquidos + bombas; egresos = diuresis + SNG + insensibles", () => {
  const t = totalesFila({
    ing_sol_medio_ml: 100, ing_sol_09_ml: 250, ing_ringer_ml: null, ing_dextrosa_ml: 50,
    bombasMl: 12.5, diuresis_ml: 300, egr_sng_drenajes_ml: 40, perdidas_insensibles_ml: 10.625,
  });
  cerca(t.ingresos, 412.5);
  cerca(t.egresos, 350.625);
  cerca(t.parcial, 61.875);
});

// ---------------------------------------------------------------- horas
test("hora de reloj: 09:00-09:59 es la misma hora; se completa el registro existente", () => {
  assert.equal(inicioDeHora(h(9, 47)), h(9));
  const regs = [
    { id: "medico", registrado_en: iso(9, 20), anulado: false },
    { id: "anulado", registrado_en: iso(10, 0), anulado: true },
  ];
  assert.equal(registroDeLaHora(regs, h(9))?.id, "medico");
  assert.equal(registroDeLaHora(regs, h(10)), null); // el anulado no cuenta
});

test("grilla de horas: cargadas, faltantes (desde :15) y en curso; alarmas solo de faltantes", () => {
  const regs = [
    { id: "a", registrado_en: iso(8), anulado: false },
    { id: "b", registrado_en: iso(10, 30), anulado: false },
  ];
  // a las 11:10: 08 cargada, 09 faltante, 10 cargada, 11 en curso (todavía no pasó :15)
  let grilla = horasDelCaso(regs, h(11, 10));
  assert.deepEqual(grilla.map((x) => x.estado), ["cargada", "faltante", "cargada", "en_curso"]);
  assert.deepEqual(alarmasEnfermeria(grilla).map((a) => a.texto), ["Hora 09 sin cargar"]);
  // a las 11:15 la hora en curso pasa a faltante
  grilla = horasDelCaso(regs, h(11, 15));
  assert.deepEqual(alarmasEnfermeria(grilla).map((a) => a.texto), ["Hora 09 sin cargar", "Hora 11 sin cargar"]);
  // sin registros: solo la hora actual
  assert.equal(horasDelCaso([], h(11, 20)).length, 1);
});

// ---------------------------------------------------------------- bombas
const inf = (id: string, hora: number, min: number, droga: InfusionFila["droga"], velocidad: number, extra: Partial<InfusionFila> = {}): InfusionFila => ({
  id, registrado_en: iso(hora, min), droga, tipo: "infusion", ampollas: 2, contenido_por_ampolla: 4, unidad_contenido: "mg",
  volumen_final_ml: 100, velocidad_ml_h: velocidad, dosis_calculada: null, unidad_dosis: null, anulado: false, ...extra,
});

test("volumen de bombas en la hora (estimado): velocidad vigente al final de la hora", () => {
  const filas = [
    inf("1", 8, 0, "noradrenalina", 10),
    inf("2", 9, 30, "noradrenalina", 15), // cambió dentro de la hora 09
    inf("3", 8, 0, "furosemida", 5),
    inf("4", 9, 10, "furosemida", 0), // suspendida
    inf("5", 9, 20, "dopamina", 8, { anulado: true }), // anulada: no cuenta
    inf("6", 10, 30, "insulina", 3), // empieza después de la hora 09
    inf("7", 9, 0, "desmopresina", 0, { tipo: "bolo" }), // bolo: no es volumen de bomba
  ];
  const v = volumenBombasEnHora(filas, h(10) - 1);
  assert.equal(v.totalMl, 15);
  assert.deepEqual(v.detalle, [{ droga: "noradrenalina", velocidadMlH: 15 }]);
});

// ---------------------------------------------------------------- fila precargada
test("fila nueva: arranca con los líquidos de la hora anterior (no con diuresis ni signos)", () => {
  const anterior = { ing_sol_medio_ml: 100, ing_sol_09_ml: null, ing_ringer_ml: 250, ing_dextrosa_ml: null, anulado: false, diuresis_ml: 300 };
  assert.deepEqual(liquidosPrecargados(anterior), { ing_sol_medio_ml: 100, ing_sol_09_ml: null, ing_ringer_ml: 250, ing_dextrosa_ml: null });
  assert.deepEqual(liquidosPrecargados(null), { ing_sol_medio_ml: null, ing_sol_09_ml: null, ing_ringer_ml: null, ing_dextrosa_ml: null });
});

import { totalesParaGuardar } from "../mantenimiento-calculos.ts";

test("totales para guardar: insensibles calculadas (o las editadas), bombas, marca de egresos total", () => {
  const fila = {
    ing_sol_medio_ml: 100, ing_sol_09_ml: null, ing_ringer_ml: null, ing_dextrosa_ml: null,
    temperatura: 38, diuresis_ml: 200, egr_sng_drenajes_ml: null, perdidas_insensibles_ml: null, perdidas_insensibles_editadas: false,
  };
  const bombas = [inf("1", 8, 0, "noradrenalina", 10)];
  const t = totalesParaGuardar(fila, h(9), [], bombas);
  cerca(t.perdidas_insensibles_ml!, 21.25);
  assert.equal(t.bombasMl, 10);
  cerca(t.ingresos_ml, 110);
  cerca(t.egresos_ml, 221.25);
  assert.equal(t.egresos_incluye_diuresis, true);
  // editadas a mano: se respetan
  const e = totalesParaGuardar({ ...fila, perdidas_insensibles_ml: 5, perdidas_insensibles_editadas: true }, h(9), [], bombas);
  assert.equal(e.perdidas_insensibles_ml, 5);
  cerca(e.egresos_ml, 205);
});
