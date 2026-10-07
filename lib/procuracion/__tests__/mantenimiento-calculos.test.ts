import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularDiuresis,
  colorDe,
  concentracion,
  dosisDesdeVelocidad,
  evaluarDiabetesInsipida,
  evaluarVolemia,
  fueraDeRangoPlausible,
  indiceCardiaco,
  pafi,
  resistenciaVascularSistemica,
  scoreCalidad,
  superficieCorporal,
  tendencia,
  textoConfirmacionDilucion,
  ultimaPafi,
  ultimoValorLab,
  velocidadDesdeDosis,
  type RegistroBase,
  type ValorLab,
} from "../mantenimiento-calculos.ts";
import { PRESET_NORADRENALINA } from "../mantenimiento-metas.ts";

const cerca = (a: number, b: number, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol, `${a} no es ≈ ${b}`);

// ---------------------------------------------------------------- gammas
test("noradrenalina: 2 amp × 4 mg en 100 mL = 80 mcg/mL, con línea de confirmación", () => {
  const c = concentracion("noradrenalina", PRESET_NORADRENALINA);
  assert.ok(c.ok);
  if (!c.ok) return;
  assert.equal(c.valor, 80);
  assert.equal(c.unidad, "mcg/mL");
  assert.equal(textoConfirmacionDilucion("noradrenalina", PRESET_NORADRENALINA), "8 mg en 100 mL = 80 mcg/mL. ¿Correcto?");
});

test("noradrenalina 8 mg en 100 mL, 70 kg: mL/h -> γ y γ -> mL/h", () => {
  // 10 mL/h: (10 × 80) / (70 × 60) = 0,1905 γ
  const d = dosisDesdeVelocidad("noradrenalina", 10, 80, 70);
  assert.ok(d.ok);
  if (d.ok) {
    cerca(d.dosis, 800 / 4200);
    assert.equal(d.unidad, "mcg/kg/min");
    assert.match(d.cuenta, /\(10 mL\/h × 80 mcg\/mL\) \/ \(70 kg × 60\)/);
  }
  // 0,3 γ: (0,3 × 70 × 60) / 80 = 15,75 mL/h
  const v = velocidadDesdeDosis("noradrenalina", 0.3, 80, 70);
  assert.ok(v.ok);
  if (v.ok) cerca(v.velocidadMlH, 15.75);
  // ida y vuelta
  const ida = dosisDesdeVelocidad("noradrenalina", 15.75, 80, 70);
  if (ida.ok) cerca(ida.dosis, 0.3);
});

test("sin peso no se calcula (y avisa que hay que cargarlo)", () => {
  const d = dosisDesdeVelocidad("noradrenalina", 10, 80, null);
  assert.equal(d.ok, false);
  if (!d.ok) assert.equal(d.motivo, "sin_peso");
  const v = velocidadDesdeDosis("dobutamina", 5, 1000, 0);
  assert.equal(v.ok, false);
});

test("vasopresina: 20 U en 100 mL = 0,2 U/mL; 6 mL/h = 0,02 U/min = 1,2 U/h (no va en gammas)", () => {
  const c = concentracion("vasopresina", { ampollas: 1, contenidoPorAmpolla: 20, unidadContenido: "U", volumenFinalMl: 100 });
  assert.ok(c.ok);
  if (!c.ok) return;
  assert.equal(c.unidad, "U/mL");
  cerca(c.valor, 0.2);
  const d = dosisDesdeVelocidad("vasopresina", 6, 0.2, null); // no necesita peso
  assert.ok(d.ok);
  if (d.ok) {
    assert.equal(d.unidad, "U/min");
    cerca(d.dosis, 0.02);
    cerca(d.uPorHora!, 1.2);
  }
  // inversa: 0,04 U/min = (0,04 × 60) / 0,2 = 12 mL/h
  const v = velocidadDesdeDosis("vasopresina", 0.04, 0.2, null);
  if (v.ok) cerca(v.velocidadMlH, 12);
  // vasopresina pide U por ampolla
  assert.equal(concentracion("vasopresina", { ampollas: 1, contenidoPorAmpolla: 20, unidadContenido: "mg", volumenFinalMl: 100 }).ok, false);
});

test("isoproterenol en mcg/min y amiodarona en mg/min (sin peso)", () => {
  const iso = concentracion("isoproterenol", { ampollas: 5, contenidoPorAmpolla: 0.2, unidadContenido: "mg", volumenFinalMl: 250 });
  assert.ok(iso.ok);
  if (iso.ok) {
    cerca(iso.valor, 4); // 1 mg = 1000 mcg / 250 mL
    const d = dosisDesdeVelocidad("isoproterenol", 30, iso.valor, null);
    if (d.ok) {
      assert.equal(d.unidad, "mcg/min");
      cerca(d.dosis, 2); // 30 × 4 / 60
    }
  }
  const amio = concentracion("amiodarona", { ampollas: 6, contenidoPorAmpolla: 150, unidadContenido: "mg", volumenFinalMl: 500 });
  assert.ok(amio.ok);
  if (amio.ok) {
    assert.equal(amio.unidad, "mg/mL");
    cerca(amio.valor, 1.8);
    const v = velocidadDesdeDosis("amiodarona", 1, amio.valor, null);
    if (v.ok) cerca(v.velocidadMlH, 33.333, 0.01);
  }
});

test("dilución incompleta no calcula", () => {
  assert.equal(concentracion("noradrenalina", { ampollas: 2, contenidoPorAmpolla: 0, unidadContenido: "mg", volumenFinalMl: 100 }).ok, false);
  assert.equal(textoConfirmacionDilucion("noradrenalina", { ampollas: 0, contenidoPorAmpolla: 4, unidadContenido: "mg", volumenFinalMl: 100 }), null);
});

// ---------------------------------------------------------------- semáforo
test("semáforo: bordes sin huecos con decimales", () => {
  const casos: [Parameters<typeof colorDe>[0], number, string][] = [
    ["fc", 59.5, "amarillo"], ["fc", 60, "verde"], ["fc", 120, "verde"], ["fc", 120.5, "amarillo"], ["fc", 130, "amarillo"], ["fc", 130.1, "rojo"], ["fc", 49, "rojo"],
    ["pam", 55, "amarillo"], ["pam", 54.9, "rojo"], ["pam", 80.5, "amarillo"], ["pam", 91, "rojo"],
    ["noradrenalina", 0.3, "verde"], ["noradrenalina", 0.305, "amarillo"], ["noradrenalina", 0.5, "amarillo"], ["noradrenalina", 0.51, "rojo"],
    ["diuresis", 1, "amarillo"], ["diuresis", 1.01, "verde"], ["diuresis", 0.5, "amarillo"], ["diuresis", 0.49, "rojo"],
    ["pafi", 331, "verde"], ["pafi", 330, "amarillo"], ["pafi", 299, "rojo"],
    ["ph", 7.345, "amarillo"], ["ph", 7.35, "verde"], ["ph", 7.5, "verde"], ["ph", 7.56, "rojo"],
    ["glucemia", 69, "rojo"], ["glucemia", 70, "amarillo"], ["glucemia", 109, "amarillo"], ["glucemia", 109.5, "amarillo"], ["glucemia", 110, "verde"],
    ["glucemia", 180, "verde"], ["glucemia", 180.5, "amarillo"], ["glucemia", 181, "amarillo"], ["glucemia", 200, "amarillo"], ["glucemia", 201, "rojo"],
    ["sat_o2", 95, "verde"], ["sat_o2", 94.5, "verde"], ["sat_o2", 94, "amarillo"], ["sat_o2", 90, "amarillo"], ["sat_o2", 89, "rojo"],
    ["sodio", 134, "rojo"], ["sodio", 150, "verde"], ["sodio", 151, "amarillo"], ["sodio", 155, "amarillo"], ["sodio", 156, "rojo"],
    ["potasio", 3.4, "amarillo"], ["potasio", 5.6, "rojo"],
    ["temperatura", 35.95, "amarillo"], ["temperatura", 37.5, "verde"], ["temperatura", 38.1, "rojo"],
    ["pvc", 4, "amarillo"], ["pvc", 13, "rojo"], ["ic", 2.4, "amarillo"], ["ic", 1.9, "rojo"], ["rvs", 1300, "amarillo"],
  ];
  for (const [clave, valor, esperado] of casos) assert.equal(colorDe(clave, valor), esperado, `${clave} ${valor}`);
  assert.equal(colorDe("fc", null), "sin_dato");
});

// ---------------------------------------------------------------- hemodinamia
test("superficie corporal, IC calculado/medido y RVS (solo con los datos necesarios)", () => {
  cerca(superficieCorporal(70, 175)!, Math.sqrt((70 * 175) / 3600));
  const ic = indiceCardiaco(null, 5, 70, 175);
  assert.equal(ic?.origen, "calculado");
  cerca(ic!.valor, 5 / Math.sqrt((70 * 175) / 3600));
  assert.deepEqual(indiceCardiaco(2.1, 5, 70, 175), { valor: 2.1, origen: "medido" });
  assert.equal(indiceCardiaco(null, 5, 70, null), null); // sin talla
  cerca(resistenciaVascularSistemica(70, 8, 5)!, 992);
  assert.equal(resistenciaVascularSistemica(70, null, 5), null);
});

test("PaFi = PaO2 / (FiO2/100), con la FiO2 de la misma extracción", () => {
  assert.equal(pafi(100, 50), 200);
  assert.equal(pafi(100, null), null);
  const ahora = new Date("2026-10-06T12:00:00Z").getTime();
  const lab: ValorLab[] = [
    { parametro: "pao2", valor: 100, medido_en: "2026-10-06T10:00:00Z", anulado: false, toma_id: "t1" },
    { parametro: "fio2", valor: 40, medido_en: "2026-10-06T10:00:00Z", anulado: false, toma_id: "t1" },
    { parametro: "fio2", valor: 100, medido_en: "2026-10-06T11:00:00Z", anulado: false, toma_id: "t2" }, // otra toma: no se usa
  ];
  cerca(ultimaPafi(lab, ahora)!.valor, 250);
});

test("laboratorio: último no anulado y desactualizado a más de 6 h", () => {
  const ahora = new Date("2026-10-06T12:00:00Z").getTime();
  const lab: ValorLab[] = [
    { parametro: "na", valor: 140, medido_en: "2026-10-06T04:00:00Z", anulado: false, toma_id: "a" },
    { parametro: "na", valor: 160, medido_en: "2026-10-06T05:00:00Z", anulado: true, toma_id: "b" },
  ];
  const na = ultimoValorLab(lab, "na", ahora)!;
  assert.equal(na.valor, 140); // el anulado no cuenta
  assert.equal(na.desactualizado, true); // 8 h
});

// ---------------------------------------------------------------- diuresis y balance
const reg = (id: string, hora: string, extra: Partial<RegistroBase> = {}): RegistroBase => ({
  id,
  registrado_en: `2026-10-06T${hora}:00Z`,
  anulado: false,
  diuresis_ml: null,
  diuresis_es_ultima_hora: false,
  ...extra,
});

test("diuresis: primer registro = última hora; mL/h y mL/kg/h con el tiempo real", () => {
  const d = calcularDiuresis(
    [reg("1", "08:00", { diuresis_ml: 70, diuresis_es_ultima_hora: true }), reg("2", "09:30", { diuresis_ml: 210 })],
    70
  );
  assert.equal(d[0].mlH, 70);
  assert.equal(d[0].mlKgH, 1);
  assert.equal(d[1].intervaloMin, 90);
  cerca(d[1].mlH!, 140); // 210 mL en 1,5 h
  cerca(d[1].mlKgH!, 2);
});

test("diuresis: intervalo <30 min no calcula ('intervalo corto')", () => {
  const d = calcularDiuresis([reg("1", "08:00", { diuresis_ml: 70, diuresis_es_ultima_hora: true }), reg("2", "08:20", { diuresis_ml: 40 })], 70);
  assert.equal(d[1].aviso, "intervalo_corto");
  assert.equal(d[1].mlH, null);
});

test("diuresis: anulado en el medio + intervalo >2 h -> 'intervalo largo' en vez del número", () => {
  const d = calcularDiuresis(
    [
      reg("1", "08:00", { diuresis_ml: 70, diuresis_es_ultima_hora: true }),
      reg("2", "09:00", { diuresis_ml: 100, anulado: true }),
      reg("3", "10:30", { diuresis_ml: 150 }),
    ],
    70
  );
  assert.equal(d.length, 2); // el anulado no aparece
  assert.equal(d[1].aviso, "intervalo_largo");
  assert.equal(d[1].mlH, null);
  // sin anulado en el medio, un intervalo largo SÍ se calcula
  const sinAnular = calcularDiuresis([reg("1", "08:00", { diuresis_ml: 70, diuresis_es_ultima_hora: true }), reg("3", "10:30", { diuresis_ml: 150 })], 70);
  cerca(sinAnular[1].mlH!, 60);
});

test("tendencia: últimos N no anulados con dato", () => {
  const rs = ["01", "02", "03", "04", "05", "06", "07", "08"].map((h, i) => ({ ...reg(String(i), `${h}:00`, { pam: 60 + i }), anulado: i === 7 }));
  const t = tendencia(rs, (r) => r.pam, 6);
  assert.deepEqual(t.map((p) => p.valor), [61, 62, 63, 64, 65, 66]);
});

// ---------------------------------------------------------------- score
test("score de calidad X/4 (sin dato = no cuenta)", () => {
  const s = scoreCalidad({ glucemia: 150, sodio: 154, ph: 7.4, pafi: 300 });
  assert.equal(s.cumplidos, 3);
  assert.equal(scoreCalidad({ glucemia: null, sodio: null, ph: null, pafi: null }).cumplidos, 0);
  assert.equal(scoreCalidad({ glucemia: 181, sodio: 155, ph: 7.51, pafi: 331 }).cumplidos, 1);
});

test("score: la glucemia cuenta cumplida solo en 110-180", () => {
  const g = (glucemia: number) => scoreCalidad({ glucemia, sodio: null, ph: null, pafi: null }).items[0].cumple;
  assert.deepEqual([g(69), g(109), g(110), g(150), g(180), g(181)], [false, false, true, true, true, false]);
});

// ---------------------------------------------------------------- volemia
test("volemia: cuenta cargadas y positivas; ΔCO2 sin referencia no cuenta como positiva", () => {
  const v = evaluarVolemia({ delta_pp: 15, delta_vs: 8, resultado_pasivo_miembros: 10, indice_vena_cava: null, delta_co2_espirado: 20 });
  assert.equal(v.cargadas, 4);
  assert.equal(v.positivas, 2); // ΔPP 15 >13 y elevación pasiva 10 ≥10
  assert.equal(v.detalle.find((d) => d.clave === "delta_co2_espirado")?.positiva, null);
});

// ---------------------------------------------------------------- diabetes insípida
test("DI probable: >4 mL/kg/h + orina diluida + sodio >145", () => {
  const diuresis = calcularDiuresis([reg("1", "08:00", { diuresis_ml: 350, diuresis_es_ultima_hora: true })], 70);
  const r = evaluarDiabetesInsipida({ diuresis, pamUltima: 70, sodio: 150, osmUrinaria: 200, densidadUrinaria: null, osmSerica: null });
  assert.equal(r.estado, "probable");
});

test("DI sospecha: >3 mL/kg/h en 2 registros que cubren ≥2 h, con hipotensión", () => {
  const diuresis = calcularDiuresis(
    [reg("1", "08:00", { diuresis_ml: 240, diuresis_es_ultima_hora: true }), reg("2", "09:00", { diuresis_ml: 240 })],
    70
  ); // 240 mL/h = 3,43 mL/kg/h, 60+60 min
  const r = evaluarDiabetesInsipida({ diuresis, pamUltima: 55, sodio: null, osmUrinaria: null, densidadUrinaria: null, osmSerica: null });
  assert.equal(r.estado, "sospecha");
  // sin sodio alto ni hipotensión: no hay criterio
  assert.equal(
    evaluarDiabetesInsipida({ diuresis, pamUltima: 70, sodio: 140, osmUrinaria: null, densidadUrinaria: null, osmSerica: null }).estado,
    "sin_criterios"
  );
});

// ---------------------------------------------------------------- plausibilidad
test("plausibilidad: fuera de rango pide '¿seguro?' (no bloquea)", () => {
  assert.deepEqual(fueraDeRangoPlausible("na", 210), { min: 100, max: 200 });
  assert.equal(fueraDeRangoPlausible("na", 140), null);
  assert.deepEqual(fueraDeRangoPlausible("ph", 6.5), { min: 6.8, max: 7.8 });
  assert.equal(fueraDeRangoPlausible("campo_desconocido", 1), null);
});

// ---------------------------------------------------------------- volemia (confirmación explícita)
test("ΔPP >13% y elevación pasiva de miembros ≥10% del VS o GC son variables dinámicas", () => {
  const solo = (v: Partial<Parameters<typeof evaluarVolemia>[0]>) =>
    evaluarVolemia({ delta_pp: null, delta_vs: null, resultado_pasivo_miembros: null, indice_vena_cava: null, delta_co2_espirado: null, ...v });
  assert.equal(solo({ delta_pp: 13 }).positivas, 0); // borde: >13
  assert.equal(solo({ delta_pp: 13.1 }).positivas, 1);
  assert.equal(solo({ resultado_pasivo_miembros: 9.9 }).positivas, 0);
  assert.equal(solo({ resultado_pasivo_miembros: 10 }).positivas, 1); // borde: ≥10
  assert.equal(solo({ delta_pp: 20, resultado_pasivo_miembros: 12 }).cargadas, 2);
});

// ---------------------------------------------------------------- infusiones
import { armarAlarmas, camposFueraDeRango, contarFueraDeMeta, minutosDesdeUltimoRegistro, ultimaDilucion, validarHoraRegistro, type InfusionFila } from "../mantenimiento-calculos.ts";

const inf = (id: string, hora: string, droga: InfusionFila["droga"], extra: Partial<InfusionFila> = {}): InfusionFila => ({
  id, registrado_en: `2026-10-06T${hora}:00Z`, droga, tipo: "infusion",
  ampollas: 2, contenido_por_ampolla: 4, unidad_contenido: "mg", volumen_final_ml: 100,
  velocidad_ml_h: 10, dosis_calculada: 0.19, unidad_dosis: "mcg/kg/min", anulado: false, ...extra,
});

test("se recuerda la última dilución usada (no anulada)", () => {
  const d = ultimaDilucion(
    [inf("1", "08:00", "noradrenalina", { ampollas: 2 }), inf("2", "09:00", "noradrenalina", { ampollas: 4, anulado: true })],
    "noradrenalina"
  );
  assert.deepEqual(d, { ampollas: 2, contenidoPorAmpolla: 4, unidadContenido: "mg", volumenFinalMl: 100 });
  assert.equal(ultimaDilucion([], "dobutamina"), null);
});

// ---------------------------------------------------------------- cabecera y alarmas
test("alarmas: rojas primero; avanzados solo con el monitoreo activo; sin registro >1 h", () => {
  const parametros = [
    { clave: "fc" as const, etiqueta: "FC", valor: 125, color: "amarillo" as const, avanzado: false },
    { clave: "pam" as const, etiqueta: "PAM", valor: 50, color: "rojo" as const, avanzado: false },
    { clave: "pvc" as const, etiqueta: "PVC", valor: 15, color: "rojo" as const, avanzado: true },
  ];
  const a = armarAlarmas({ parametros, monitoreoAvanzadoActivo: false, minutosSinRegistro: 75, estadoDI: "sospecha" });
  assert.deepEqual(a.map((x) => x.nivel), ["rojo", "rojo", "amarillo", "amarillo"]);
  assert.ok(!a.some((x) => x.texto.startsWith("PVC")));
  assert.equal(contarFueraDeMeta(parametros, false), 2);
  assert.equal(contarFueraDeMeta(parametros, true), 3);
});

test("alarma de hipoglucemia (<70, roja) en lugar del 'fuera de meta' genérico", () => {
  const a = armarAlarmas({
    parametros: [{ clave: "glucemia", etiqueta: "Glucemia", valor: 62, color: "rojo", avanzado: false }],
    monitoreoAvanzadoActivo: false,
    minutosSinRegistro: 10,
    estadoDI: "sin_criterios",
  });
  assert.deepEqual(a, [{ nivel: "rojo", texto: "Hipoglucemia: 62 mg/dL (<70)." }]);
  const alta = armarAlarmas({
    parametros: [{ clave: "glucemia", etiqueta: "Glucemia", valor: 250, color: "rojo", avanzado: false }],
    monitoreoAvanzadoActivo: false,
    minutosSinRegistro: 10,
    estadoDI: "sin_criterios",
  });
  assert.equal(alta[0].texto, "Glucemia fuera de meta: 250");
  // desactualizada (más de 6 h): gris, sin alarma
  const vieja = armarAlarmas({
    parametros: [{ clave: "glucemia", etiqueta: "Glucemia", valor: 62, color: "sin_dato", avanzado: false }],
    monitoreoAvanzadoActivo: false,
    minutosSinRegistro: 10,
    estadoDI: "sin_criterios",
  });
  assert.deepEqual(vieja, []);
});

test("minutos desde el último registro no anulado", () => {
  const ahora = new Date("2026-10-06T10:00:00Z").getTime();
  assert.equal(
    minutosDesdeUltimoRegistro(
      [{ registrado_en: "2026-10-06T08:00:00Z", anulado: false }, { registrado_en: "2026-10-06T09:30:00Z", anulado: true }],
      ahora
    ),
    120
  );
  assert.equal(minutosDesdeUltimoRegistro([], ahora), null);
});

test("hora de un registro: futura no se acepta; si cambia el orden, pide confirmación", () => {
  const ahora = new Date("2026-10-06T10:00:00Z").getTime();
  const rs = [
    { id: "a", registrado_en: "2026-10-06T08:00:00Z", anulado: false },
    { id: "b", registrado_en: "2026-10-06T09:00:00Z", anulado: false },
  ];
  assert.deepEqual(validarHoraRegistro("2026-10-06T10:05:00Z", ahora, rs, null), { estado: "futura" });
  assert.deepEqual(validarHoraRegistro("2026-10-06T08:30:00Z", ahora, rs, "a"), { estado: "ok", cambiaOrden: false });
  assert.deepEqual(validarHoraRegistro("2026-10-06T09:30:00Z", ahora, rs, "a"), { estado: "ok", cambiaOrden: true });
});

test("plausibilidad de un formulario: lista los campos fuera de rango", () => {
  assert.deepEqual(camposFueraDeRango({ fc: 300, pam: 70, temperatura: 25, na: null }), [
    { campo: "fc", valor: 300, min: 20, max: 250 },
    { campo: "temperatura", valor: 25, min: 30, max: 42 },
  ]);
});
