import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alarmasDosis,
  alarmasEnfermeria,
  balancePorHora,
  bombasQueArrancan,
  concentracion,
  dilucionVigenteEn,
  dosisDesdeVelocidad,
  estadoBombas,
  filaPrecargada,
  horasDelCaso,
  inicioDeHora,
  perdidasDeFila,
  perdidasInsensiblesHora,
  planGuardadoBombas,
  registroDeLaHora,
  temperaturaParaPerdidas,
  textoConfirmacionDilucion,
  totalesHora,
  velocidadDesdeDosis,
  type BombaHora,
  type FilaHoraria,
  type InfusionFila,
} from "../mantenimiento-calculos.ts";
import { camposFueraDeRango } from "../mantenimiento-calculos.ts";

const cerca = (a: number, b: number, tol = 0.005) => assert.ok(Math.abs(a - b) <= tol, `${a} no es ≈ ${b}`);
// Horas locales armadas con el constructor local (independiente del huso).
const h = (hora: number, min = 0) => new Date(2026, 9, 6, hora, min).getTime();
const iso = (hora: number, min = 0) => new Date(h(hora, min)).toISOString();

const fila = (id: string, hora: number, min = 0, extra: Partial<FilaHoraria> = {}): FilaHoraria => ({
  id,
  registrado_en: iso(hora, min),
  anulado: false,
  temperatura: null,
  diuresis_ml: null,
  egr_sng_drenajes_ml: null,
  perdidas_insensibles_ml: null,
  perdidas_insensibles_editadas: false,
  ing_sol_09_ml: null,
  ing_ringer_ml: null,
  ing_sol_medio_ml: null,
  ing_dextrosa_ml: null,
  ing_hemoderivados_ml: null,
  ...extra,
});
const bomba = (id: string, registro_id: string, droga: BombaHora["droga"], velocidad_ml_h: number, extra: Partial<BombaHora> = {}): BombaHora => ({
  id, registro_id, droga, velocidad_ml_h, dilucion_id: null, anulado: false, ...extra,
});
// Fila de dilución confirmada (noradrenalina 2 amp × 4 mg en 100 mL = 80 mcg/mL).
const dil = (id: string, hora: number, min: number, droga: InfusionFila["droga"], extra: Partial<InfusionFila> = {}): InfusionFila => ({
  id, registrado_en: iso(hora, min), droga, tipo: "infusion", motivo: "inicio",
  ampollas: 2, contenido_por_ampolla: 4, unidad_contenido: "mg", volumen_final_ml: 100,
  velocidad_ml_h: null, dosis_calculada: null, unidad_dosis: null, anulado: false, ...extra,
});
const evento = (id: string, hora: number, min: number, droga: InfusionFila["droga"], velocidad: number): InfusionFila => ({
  ...dil(id, hora, min, droga), motivo: "cambio_velocidad", ampollas: null, contenido_por_ampolla: null, unidad_contenido: null,
  volumen_final_ml: null, velocidad_ml_h: velocidad,
});
const bolo = (id: string, hora: number, droga: InfusionFila["droga"], dosis: number, unidad: string): InfusionFila => ({
  ...dil(id, hora, 0, droga), tipo: "bolo", motivo: null, ampollas: null, contenido_por_ampolla: null, unidad_contenido: null,
  volumen_final_ml: null, dosis_calculada: dosis, unidad_dosis: unidad,
});

// ---------------------------------------------------------------- pérdidas insensibles
test("pérdidas insensibles por peso: 70 kg -> 37 °C 29,17; 38 °C 32,08; 39 °C 35,0; 36 °C 29,17", () => {
  cerca(perdidasInsensiblesHora(70, 37)!, 29.17);
  cerca(perdidasInsensiblesHora(70, 38)!, 32.08);
  cerca(perdidasInsensiblesHora(70, 39)!, 35.0);
  cerca(perdidasInsensiblesHora(70, 36)!, 29.17); // sin descuento por hipotermia
  cerca(perdidasInsensiblesHora(70, null)!, 29.17); // sin temperatura: la base
});

test("pérdidas insensibles sin peso: vacío (no se inventa)", () => {
  assert.equal(perdidasInsensiblesHora(null, 38), null);
  assert.equal(perdidasInsensiblesHora(0, 38), null);
});

test("pérdidas de una fila: la editada a mano se respeta; si no, se calcula con la T de la fila o la última", () => {
  const regs = [fila("a", 8, 0, { temperatura: 38 }), fila("b", 9, 0)];
  const calc = perdidasDeFila(regs[1], regs, 70);
  cerca(calc.valor!, 32.08);
  assert.equal(calc.editada, false);
  assert.equal(calc.temperatura?.propia, false);
  const editada = perdidasDeFila({ ...regs[1], perdidas_insensibles_ml: 50, perdidas_insensibles_editadas: true }, regs, 70);
  assert.deepEqual([editada.valor, editada.editada], [50, true]);
  const sinPeso = perdidasDeFila(regs[1], regs, null);
  assert.deepEqual([sinPeso.valor, sinPeso.faltaPeso], [null, true]);
});

test("pérdidas: '¿seguro?' a partir de 300 mL/h (edición manual)", () => {
  assert.equal(camposFueraDeRango({ perdidas_insensibles_ml: 300 }).length, 0);
  assert.equal(camposFueraDeRango({ perdidas_insensibles_ml: 301 }).length, 1);
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
test("drogas por hora: furosemida mg/h, insulina U/h, potasio mEq/h, hidrocortisona y dexametasona mg/h (sin peso)", () => {
  const furo = { ampollas: 5, contenidoPorAmpolla: 20, unidadContenido: "mg" as const, volumenFinalMl: 100 };
  assert.equal(textoConfirmacionDilucion("furosemida", furo), "100 mg en 100 mL = 1 mg/mL. ¿Correcto?");
  const r = dosisDesdeVelocidad("furosemida", 5, 1, null);
  assert.ok(r.ok && r.dosis === 5 && r.unidad === "mg/h");
  const v = velocidadDesdeDosis("furosemida", 10, 1, null);
  assert.ok(v.ok && v.velocidadMlH === 10);

  const ins = concentracion("insulina", { ampollas: 1, contenidoPorAmpolla: 100, unidadContenido: "U", volumenFinalMl: 100 });
  assert.ok(ins.ok);
  if (ins.ok) {
    const d = dosisDesdeVelocidad("insulina", 3, ins.valor, null);
    assert.ok(d.ok && d.dosis === 3 && d.unidad === "U/h");
  }
  const k = concentracion("potasio", { ampollas: 2, contenidoPorAmpolla: 20, unidadContenido: "mEq", volumenFinalMl: 500 });
  assert.ok(k.ok);
  if (k.ok) {
    const d = dosisDesdeVelocidad("potasio", 50, k.valor, null);
    assert.ok(d.ok && d.unidad === "mEq/h");
    if (d.ok) cerca(d.dosis, 4);
  }
  for (const droga of ["hidrocortisona", "dexametasona"] as const) {
    const c = concentracion(droga, { ampollas: 2, contenidoPorAmpolla: 100, unidadContenido: "mg", volumenFinalMl: 100 });
    assert.ok(c.ok && c.unidad === "mg/mL", droga);
    if (c.ok) {
      const d = dosisDesdeVelocidad(droga, 5, c.valor, null);
      assert.ok(d.ok && d.dosis === 10 && d.unidad === "mg/h", droga);
    }
  }
  assert.equal(concentracion("potasio", { ampollas: 1, contenidoPorAmpolla: 20, unidadContenido: "mg", volumenFinalMl: 100 }).ok, false);
});

// ---------------------------------------------------------------- horas
test("hora de reloj: 09:00-09:59 es la misma hora; se completa el registro existente", () => {
  assert.equal(inicioDeHora(h(9, 47)), h(9));
  const regs = [
    { id: "medico", registrado_en: iso(9, 20), anulado: false },
    { id: "anulado", registrado_en: iso(10, 0), anulado: true },
  ];
  assert.equal(registroDeLaHora(regs, h(9))?.id, "medico");
  assert.equal(registroDeLaHora(regs, h(10)), null);
});

test("alarma 'hora sin cargar' a los 15 minutos (salvaguarda principal)", () => {
  const regs = [
    { id: "a", registrado_en: iso(8), anulado: false },
    { id: "b", registrado_en: iso(10, 30), anulado: false },
  ];
  let grilla = horasDelCaso(regs, h(11, 10));
  assert.deepEqual(grilla.map((x) => x.estado), ["cargada", "faltante", "cargada", "en_curso"]);
  assert.deepEqual(alarmasEnfermeria(grilla).map((a) => a.texto), ["Hora 09 sin cargar"]);
  grilla = horasDelCaso(regs, h(11, 15));
  assert.deepEqual(alarmasEnfermeria(grilla).map((a) => a.texto), ["Hora 09 sin cargar", "Hora 11 sin cargar"]);
  assert.equal(horasDelCaso([], h(11, 20)).length, 1);
});

// ---------------------------------------------------------------- balance
test("totales de la hora: ingresos = líquidos + hemoderivados + bombas (velocidad × 1 h); egresos = diuresis + SNG + pérdidas", () => {
  const f = fila("a", 9, 0, { ing_sol_09_ml: 250, ing_ringer_ml: 100, ing_hemoderivados_ml: 300, diuresis_ml: 200, egr_sng_drenajes_ml: 50 });
  const t = totalesHora(f, [{ velocidad_ml_h: 10 }, { velocidad_ml_h: 5.5 }], 29.17);
  cerca(t.liquidosMl, 650);
  cerca(t.bombasMl, 15.5);
  cerca(t.ingresos, 665.5);
  cerca(t.egresos, 279.17);
  cerca(t.parcial, 386.33);
});

test("balance por hora: acumulado calculado; hora sin fila = 'faltan N horas'; fila anulada y bolos no cuentan", () => {
  const regs = [
    fila("a", 8, 5, { ing_sol_09_ml: 100, diuresis_ml: 50 }),
    // 09: sin fila
    fila("x", 10, 0, { ing_sol_09_ml: 999, anulado: true }), // anulada
    fila("c", 10, 20, { ing_sol_09_ml: 200, diuresis_ml: 100 }),
  ];
  const bombas = [bomba("b1", "a", "noradrenalina", 10), bomba("b2", "x", "noradrenalina", 50), bomba("b3", "c", "noradrenalina", 10, { anulado: true })];
  const b = balancePorHora(regs, bombas, null, h(10, 40));
  assert.deepEqual(b.horas.map((x) => x.estado), ["cargada", "faltante", "cargada"]);
  const [h8, , h10] = b.horas;
  assert.ok(h8.estado === "cargada" && h10.estado === "cargada");
  if (h8.estado === "cargada" && h10.estado === "cargada") {
    assert.equal(h8.parcial, 60); // 100 + 10 − 50 (sin peso: sin pérdidas)
    assert.equal(h10.parcial, 100); // 200 − 100; su bomba está anulada; la fila anulada no cuenta
    assert.equal(h10.acumulado, 160);
  }
  assert.equal(b.acumulado, 160);
  assert.equal(b.faltan, 1);
  assert.equal(b.horasSinPerdidas, 2);
});

test("balance: con peso descuenta las pérdidas; completar la hora faltante la suma", () => {
  const regs = [fila("a", 8, 0, { ing_sol_09_ml: 100, temperatura: 37 })];
  let b = balancePorHora(regs, [], 70, h(9, 30));
  assert.equal(b.faltan, 1);
  const ph = (70 * 10) / 24; // 29,17 mL/h
  cerca(b.acumulado, 100 - ph);
  b = balancePorHora([...regs, fila("b", 9, 10, { ing_sol_09_ml: 50 })], [], 70, h(9, 30));
  assert.equal(b.faltan, 0);
  cerca(b.acumulado, 150 - 2 * ph);
});

// ---------------------------------------------------------------- precarga
test("precarga: bombas y líquidos de la hora anterior; bombas en 0 no; signos, diuresis, SNG y hemoderivados vacíos", () => {
  const regs = [
    fila("a", 8, 0, { ing_sol_09_ml: 100, ing_ringer_ml: 50, ing_hemoderivados_ml: 300, diuresis_ml: 200, temperatura: 38 }),
  ];
  const bombas = [
    bomba("b1", "a", "noradrenalina", 10, { dilucion_id: "d1" }),
    bomba("b2", "a", "dopamina", 0), // suspendida: no se precarga
  ];
  const p = filaPrecargada(regs, bombas, [], h(9));
  assert.equal(p.desdeRegistroId, "a");
  assert.deepEqual(p.liquidos, { ing_sol_09_ml: 100, ing_ringer_ml: 50 });
  assert.deepEqual(p.bombas, [{ droga: "noradrenalina", velocidad_ml_h: 10, dilucion_id: "d1" }]);
  const vacia = filaPrecargada([], [], [], h(9));
  assert.deepEqual(vacia, { desdeRegistroId: null, liquidos: {}, bombas: [] });
});

test("precarga: un 'cambié la velocidad' posterior a la fila manda (y en 0 la saca)", () => {
  const regs = [fila("a", 8, 0)];
  const bombas = [bomba("b1", "a", "noradrenalina", 10, { dilucion_id: "d1" }), bomba("b2", "a", "vasopresina", 6, { dilucion_id: "d2" })];
  const infus = [evento("e1", 8, 40, "noradrenalina", 15), evento("e2", 8, 50, "vasopresina", 0), evento("e0", 7, 0, "dopamina", 8)];
  const p = filaPrecargada(regs, bombas, infus, h(9));
  assert.deepEqual(p.bombas, [{ droga: "noradrenalina", velocidad_ml_h: 15, dilucion_id: "d1" }]);
});

test("reiniciar (de 0 o ausente a > 0) vuelve a pedir el toque de dilución", () => {
  const precarga = [{ droga: "noradrenalina" as const, velocidad_ml_h: 10, dilucion_id: "d1" }];
  const form = [
    { droga: "noradrenalina" as const, velocidad_ml_h: 12, dilucion_id: "d1" }, // solo cambia la velocidad: no repregunta
    { droga: "dopamina" as const, velocidad_ml_h: 5, dilucion_id: null }, // arranca: pide dilución
  ];
  assert.deepEqual(bombasQueArrancan(precarga, form), ["dopamina"]);
});

// ---------------------------------------------------------------- guardar bombas sin duplicados
test("plan de guardado: una sola bomba vigente por droga y hora (actualiza, inserta, anula; nunca duplica)", () => {
  const existentes = [
    bomba("n1", "r", "noradrenalina", 10, { dilucion_id: "d1" }),
    bomba("v1", "r", "vasopresina", 6),
    bomba("v2", "r", "vasopresina", 6), // duplicado viejo: se anula
    bomba("k0", "r", "potasio", 20, { anulado: true }), // anulada: se ignora
    bomba("i1", "r", "insulina", 2), // ya no está en el formulario: se anula
  ];
  const form = [
    { droga: "noradrenalina" as const, velocidad_ml_h: 12, dilucion_id: "d1" },
    { droga: "vasopresina" as const, velocidad_ml_h: 6, dilucion_id: null },
    { droga: "potasio" as const, velocidad_ml_h: 25, dilucion_id: null },
    { droga: "potasio" as const, velocidad_ml_h: 30, dilucion_id: null }, // repetida: gana la última
  ];
  const plan = planGuardadoBombas(existentes, form);
  assert.deepEqual(plan.anular.sort(), ["i1", "v2"]);
  assert.deepEqual(plan.actualizar, [{ id: "n1", velocidad_ml_h: 12, dilucion_id: "d1" }]); // v1 no cambió
  assert.deepEqual(plan.insertar, [{ droga: "potasio", velocidad_ml_h: 30, dilucion_id: null }]);

  // Resultado final: a lo sumo una vigente por droga.
  const final = new Map<string, number>();
  for (const b of existentes) if (!b.anulado && !plan.anular.includes(b.id)) final.set(b.droga, (final.get(b.droga) ?? 0) + 1);
  for (const b of plan.insertar) final.set(b.droga, (final.get(b.droga) ?? 0) + 1);
  for (const [droga, n] of final) assert.equal(n, 1, droga);

  // Guardar dos veces lo mismo no cambia nada.
  const aplicada = [bomba("n1", "r", "noradrenalina", 12, { dilucion_id: "d1" }), bomba("v1", "r", "vasopresina", 6), bomba("p1", "r", "potasio", 30)];
  assert.deepEqual(planGuardadoBombas(aplicada, form), { anular: [], actualizar: [], insertar: [] });
});

// ---------------------------------------------------------------- gammas en vivo
test("gammas desde la última fila, con la hora del dato", () => {
  const regs = [fila("a", 8, 0), fila("b", 9, 5)];
  const bombas = [bomba("b1", "a", "noradrenalina", 5, { dilucion_id: "d1" }), bomba("b2", "b", "noradrenalina", 10, { dilucion_id: "d1" })];
  const e = estadoBombas({ registros: regs, bombas, infusiones: [dil("d1", 7, 50, "noradrenalina")], pesoKg: 70, ahora: h(9, 30) });
  const n = e.noradrenalina!;
  assert.equal(n.origen, "fila");
  assert.equal(n.momento, iso(9, 5));
  assert.equal(n.estado, "ok");
  assert.equal(n.desactualizado, false);
  cerca(e.noradrenalinaGamma!, 800 / 4200, 1e-6); // 10 mL/h × 80 mcg/mL / (70 × 60)
  assert.equal(e.filaDato, iso(9, 5));
  assert.deepEqual(alarmasDosis(e), []);
});

test("más de 70 min sin fila nueva: 'dato desactualizado' y alarmas de dosis en pausa", () => {
  const regs = [fila("a", 8, 0)];
  const bombas = [bomba("b1", "a", "noradrenalina", 10, { dilucion_id: "d1" })];
  const args = { registros: regs, bombas, infusiones: [dil("d1", 7, 50, "noradrenalina")], pesoKg: 70 };
  assert.equal(estadoBombas({ ...args, ahora: h(9, 10) }).noradrenalina!.desactualizado, false); // 70 min justos
  const e = estadoBombas({ ...args, ahora: h(9, 11) });
  assert.equal(e.noradrenalina!.desactualizado, true);
  assert.equal(e.noradrenalinaGamma, null); // no alimenta tablero ni sugerencias
  assert.match(alarmasDosis(e)[0].texto, /dato desactualizado \(de las 08:00\)/);
});

test("bomba sin dilución: suma al balance, sin gamma y con cartel", () => {
  const regs = [fila("a", 8, 0, { ing_sol_09_ml: 100 })];
  const bombas = [bomba("b1", "a", "noradrenalina", 10)];
  const e = estadoBombas({ registros: regs, bombas, infusiones: [], pesoKg: 70, ahora: h(8, 30) });
  assert.equal(e.noradrenalina!.estado, "sin_dilucion");
  assert.equal(e.noradrenalinaGamma, null);
  assert.equal(e.algunVasopresorActivo, true);
  assert.match(alarmasDosis(e)[0].texto, /Noradrenalina sin dilución confirmada/);
  const b = balancePorHora(regs, bombas, null, h(8, 30));
  assert.equal(b.acumulado, 110);
});

test("sin peso: la gamma dice 'falta peso'; las drogas por hora se calculan igual", () => {
  const regs = [fila("a", 8, 0)];
  const bombas = [bomba("b1", "a", "noradrenalina", 10, { dilucion_id: "d1" }), bomba("b2", "a", "insulina", 3, { dilucion_id: "d2" })];
  const infus = [dil("d1", 7, 0, "noradrenalina"), dil("d2", 7, 0, "insulina", { ampollas: 1, contenido_por_ampolla: 100, unidad_contenido: "U" })];
  const e = estadoBombas({ registros: regs, bombas, infusiones: infus, pesoKg: null, ahora: h(8, 30) });
  assert.equal(e.noradrenalina!.estado, "falta_peso");
  assert.equal(e.porDroga.insulina!.estado, "ok");
  assert.equal(e.porDroga.insulina!.dosis!.dosis, 3);
  assert.ok(alarmasDosis(e).some((a) => a.texto === "Falta peso: dosis por kg sin calcular."));
});

test("'cambié la velocidad': las gammas toman el dato más reciente; el balance no cambia", () => {
  const regs = [fila("a", 8, 0)];
  const bombas = [bomba("b1", "a", "noradrenalina", 10, { dilucion_id: "d1" })];
  const infus = [dil("d1", 7, 50, "noradrenalina"), evento("e1", 8, 30, "noradrenalina", 20)];
  const e = estadoBombas({ registros: regs, bombas, infusiones: infus, pesoKg: 70, ahora: h(8, 40) });
  assert.equal(e.noradrenalina!.origen, "evento");
  assert.equal(e.noradrenalina!.velocidadMlH, 20);
  assert.equal(e.noradrenalina!.momento, iso(8, 30));
  const b = balancePorHora(regs, bombas, null, h(8, 40));
  assert.equal(b.acumulado, 10); // sigue horario: la fila dice 10 mL/h
  // un evento ANTERIOR a la última fila no manda
  const viejo = estadoBombas({ registros: regs, bombas, infusiones: [dil("d1", 7, 0, "noradrenalina"), evento("e0", 7, 30, "noradrenalina", 99)], pesoKg: 70, ahora: h(8, 40) });
  assert.equal(viejo.noradrenalina!.velocidadMlH, 10);
});

test("un bolo de vasopresina NO marca 'vasopresina activa'", () => {
  const regs = [fila("a", 8, 0)];
  const infus = [bolo("v", 8, "vasopresina", 1, "U")];
  const e = estadoBombas({ registros: regs, bombas: [], infusiones: infus, pesoKg: 70, ahora: h(8, 30) });
  assert.equal(e.vasopresinaActiva, false);
  assert.equal(e.algunVasopresorActivo, false);
  // con la bomba en la fila, sí
  const conBomba = estadoBombas({ registros: regs, bombas: [bomba("b", "a", "vasopresina", 6)], infusiones: infus, pesoKg: 70, ahora: h(8, 30) });
  assert.equal(conBomba.vasopresinaActiva, true);
});

test("'al menos un vasopresor': noradrenalina, adrenalina o vasopresina (no dopamina ni dobutamina); 0 mL/h no cuenta", () => {
  const regs = [fila("a", 8, 0)];
  const con = (droga: BombaHora["droga"], v = 5) =>
    estadoBombas({ registros: regs, bombas: [bomba("b", "a", droga, v)], infusiones: [], pesoKg: 70, ahora: h(8, 10) }).algunVasopresorActivo;
  for (const d of ["noradrenalina", "adrenalina", "vasopresina"] as const) assert.equal(con(d), true, d);
  for (const d of ["dopamina", "dobutamina"] as const) assert.equal(con(d), false, d);
  assert.equal(con("noradrenalina", 0), false);
});

test("dilución vigente: la última confirmada hasta ese momento (no anulada, sin eventos de velocidad)", () => {
  const infus = [
    dil("d1", 7, 0, "noradrenalina"),
    dil("d2", 9, 0, "noradrenalina", { ampollas: 4, motivo: "cambio_dilucion" }),
    dil("d3", 9, 30, "noradrenalina", { ampollas: 8, anulado: true }),
    evento("e", 9, 40, "noradrenalina", 20),
  ];
  assert.equal(dilucionVigenteEn(infus, "noradrenalina", h(8))?.id, "d1");
  assert.equal(dilucionVigenteEn(infus, "noradrenalina", h(10))?.id, "d2");
  assert.equal(dilucionVigenteEn(infus, "dopamina", h(10)), null);
});

test("último bolo de desmopresina (informativo)", () => {
  const e = estadoBombas({ registros: [], bombas: [], infusiones: [bolo("x", 8, "desmopresina", 2, "mcg"), bolo("y", 9, "desmopresina", 2, "mcg")], pesoKg: 70, ahora: h(9, 30) });
  assert.equal(e.ultimoBoloDesmopresina, iso(9));
});

// ---------------------------------------------------------------- seteo de bombas: "¿seguro?" sin ruido
import { avisoDosisBomba, avisosSeteoBomba, unidadCorta } from "../mantenimiento-calculos.ts";

test("seteo normal (noradrenalina 4 mg × 2 en 100 mL): nada que avisar", () => {
  assert.deepEqual(avisosSeteoBomba("noradrenalina", { ampollas: 2, contenidoPorAmpolla: 4, unidadContenido: "mg", volumenFinalMl: 100 }), []);
  assert.deepEqual(avisosSeteoBomba("vasopresina", { ampollas: 1, contenidoPorAmpolla: 20, unidadContenido: "U", volumenFinalMl: 100 }), []);
  assert.deepEqual(avisosSeteoBomba("potasio", { ampollas: 2, contenidoPorAmpolla: 30, unidadContenido: "mEq", volumenFinalMl: 500 }), []);
});

test("seteo fuera de rango: ampolla, cantidad y volumen piden '¿seguro?'", () => {
  const a = avisosSeteoBomba("noradrenalina", { ampollas: 40, contenidoPorAmpolla: 40, unidadContenido: "mg", volumenFinalMl: 5 });
  assert.equal(a.length, 3);
  assert.match(a[0], /^Ampolla de 40 mg \(esperable 1-8 mg\)$/);
  assert.match(a[1], /^Cantidad 40/);
  assert.match(a[2], /^Volumen de 5 mL/);
});

test("dosis resultante: dentro de rango no avisa; fuera de rango sí (γ y U/min)", () => {
  assert.equal(avisoDosisBomba("noradrenalina", 0.19), null);
  assert.equal(avisoDosisBomba("noradrenalina", 1), null); // borde incluido
  assert.match(avisoDosisBomba("noradrenalina", 2.5)!, /Noradrenalina 2,5 γ \(esperable 0,01-1 γ\)/);
  assert.equal(avisoDosisBomba("vasopresina", 0.03), null);
  assert.match(avisoDosisBomba("vasopresina", 0.5)!, /0,5 U\/min/);
  assert.match(avisoDosisBomba("insulina", 50)!, /50 U\/h/);
  assert.equal(unidadCorta("mcg/kg/min"), "γ");
  assert.equal(unidadCorta("U/min"), "U/min");
});

// ---------------------------------------------------------------- solución de la dilución: guardar y leer
import { columnasSolucion, solucionDeFila, solucionPorId } from "../mantenimiento-calculos.ts";

test("solución de la dilución: se guarda en sus columnas y se vuelve a leer igual (incluida 'otra' con su texto)", () => {
  for (const s of [
    { tipo: "dextrosa_5" as const, otra: "" },
    { tipo: "sf_09" as const, otra: "" },
    { tipo: "otra" as const, otra: "Ringer lactato" },
  ]) {
    const cols = columnasSolucion(s);
    // lo que se guarda en la fila de dilución, y lo que se lee de ella al reabrir
    const fila = dil("d1", 8, 0, "noradrenalina", cols);
    assert.deepEqual(solucionPorId([fila], "d1"), s, s.tipo);
  }
  assert.deepEqual(columnasSolucion({ tipo: "otra", otra: "  Ringer lactato  " }), { solucion_dilucion: "otra", solucion_dilucion_otra: "Ringer lactato" });
});

test("solución: el texto solo va con 'otra', recortado a 40 caracteres; vacío -> null", () => {
  assert.deepEqual(columnasSolucion({ tipo: "dextrosa_5", otra: "texto de antes" }), { solucion_dilucion: "dextrosa_5", solucion_dilucion_otra: null });
  assert.deepEqual(columnasSolucion({ tipo: "otra", otra: "   " }), { solucion_dilucion: "otra", solucion_dilucion_otra: null });
  assert.equal(columnasSolucion({ tipo: "otra", otra: "x".repeat(60) }).solucion_dilucion_otra!.length, 40);
  assert.deepEqual(columnasSolucion(null), { solucion_dilucion: null, solucion_dilucion_otra: null });
  // filas viejas, sin solución; dilución anulada o inexistente
  assert.equal(solucionDeFila(dil("v", 8, 0, "noradrenalina")), null);
  assert.equal(solucionPorId([dil("a", 8, 0, "noradrenalina", { solucion_dilucion: "sf_09", anulado: true })], "a"), null);
  assert.equal(solucionPorId([], null), null);
});
