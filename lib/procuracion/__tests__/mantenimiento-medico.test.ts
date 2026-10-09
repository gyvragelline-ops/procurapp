import { test } from "node:test";
import assert from "node:assert/strict";
import {
  avisosDeEnfermeria,
  disfuncionMiocardica,
  dosisPorFila,
  pafiConRespirador,
  respiradorVigenteEn,
  serieMedico,
  ultimoLabConRespaldo,
  ultimoValorLab,
  ultimoValorMedico,
  type BombaHora,
  type EventoRespirador,
  type InfusionFila,
  type MedicionMedico,
  type ValorLab,
} from "../mantenimiento-calculos.ts";
import { direccionTendencia, edadUltimoDato, recortarVentana } from "../mantenimiento-tendencias.ts";
import { tensionesEntreReglas, type EstadoParaTensiones } from "../mantenimiento-tensiones.ts";
import { generarSugerencias, type EstadoParaSugerencias } from "../mantenimiento-sugerencias.ts";
import { CAMBIO_MINIMO_FLECHA, VENTANA_TENDENCIA_INICIAL_H, VENTANAS_TENDENCIA_H } from "../mantenimiento-metas.ts";

const cerca = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} no es ≈ ${b}`);
const h = (hora: number, min = 0) => new Date(2026, 9, 6, hora, min).getTime();
const iso = (hora: number, min = 0) => new Date(h(hora, min)).toISOString();

const ev = (id: string, hora: number, min: number, extra: Partial<EventoRespirador> = {}): EventoRespirador => ({
  id, registrado_en: iso(hora, min), modo: "VCV", modo_otro: null, fio2: 40, peep: 5, volumen_corriente: 450, frecuencia: 14,
  presion_plateau: null, presion_pico: null, anulado: false, ...extra,
});
const lab = (parametro: string, valor: number | null, hora: number, min = 0, toma = "t1", extra: Partial<ValorLab> = {}): ValorLab => ({
  parametro, valor, medido_en: iso(hora, min), anulado: false, toma_id: toma, ...extra,
});
const med = (id: string, hora: number, extra: Partial<MedicionMedico> = {}): MedicionMedico => ({
  id, registrado_en: iso(hora), anulado: false, disfuncion_miocardica: null, pvc: null, gc: null, ic_medido: null, sat_venosa: null,
  delta_pp: null, delta_vs: null, delta_co2_espirado: null, indice_vena_cava: null, resultado_pasivo_miembros: null, ...extra,
});

// ---------------------------------------------------------------- respirador y PaFi
test("respirador vigente: el último evento no anulado hasta ese momento", () => {
  const eventos = [ev("a", 8, 0, { fio2: 40 }), ev("b", 10, 0, { fio2: 60 }), ev("c", 11, 0, { fio2: 100, anulado: true })];
  assert.equal(respiradorVigenteEn(eventos, h(9))?.id, "a");
  assert.equal(respiradorVigenteEn(eventos, h(10, 30))?.id, "b");
  assert.equal(respiradorVigenteEn(eventos, h(12))?.id, "b"); // el anulado no cuenta
  assert.equal(respiradorVigenteEn(eventos, h(7)), null);
});

test("PaFi con la FiO2 y PEEP vigentes a la hora de la gasometría ('FiO2 de las HH:MM')", () => {
  const eventos = [ev("a", 8, 0, { fio2: 40, peep: 5 }), ev("b", 10, 15, { fio2: 60, peep: 8 })];
  const p = pafiConRespirador([lab("pao2", 240, 11)], eventos, [], h(11, 30))!;
  assert.equal(p.origen, "respirador");
  assert.equal(p.valor, 400); // 240 / 0,60
  assert.deepEqual([p.fio2, p.peep, p.fio2Desde], [60, 8, iso(10, 15)]);
  assert.equal(p.respiradorViejo, false);
});

test("PaFi: cambio de FiO2 entre dos gasometrías -> cada una usa la suya; un evento posterior no la afecta", () => {
  const eventos = [ev("a", 8, 0, { fio2: 40 }), ev("b", 10, 0, { fio2: 80 })];
  // gasometría de las 09: FiO2 40 aunque después se subió a 80
  assert.equal(pafiConRespirador([lab("pao2", 120, 9)], eventos, [], h(9, 30))!.valor, 300);
  // gasometría de las 11: FiO2 80
  assert.equal(pafiConRespirador([lab("pao2", 120, 9, 0, "t1"), lab("pao2", 240, 11, 0, "t2")], eventos, [], h(11, 30))!.valor, 300);
});

test("PaFi: respaldos (fila vieja, después la toma); sin ninguno no se calcula", () => {
  const viejos = [{ registrado_en: iso(8), anulado: false, fio2: 50, peep: 6 }];
  const deFila = pafiConRespirador([lab("pao2", 200, 9)], [], viejos, h(9, 30))!;
  assert.deepEqual([deFila.origen, deFila.valor, deFila.peep], ["registro", 400, 6]);
  const deToma = pafiConRespirador([lab("pao2", 200, 9), lab("fio2", 100, 9)], [], [], h(9, 30))!;
  assert.deepEqual([deToma.origen, deToma.valor], ["toma", 200]);
  assert.equal(pafiConRespirador([lab("pao2", 200, 9)], [], [], h(9, 30)), null);
  // un evento del respirador POSTERIOR a la gasometría no sirve: usa el respaldo
  assert.equal(pafiConRespirador([lab("pao2", 200, 9)], [ev("x", 10, 0)], viejos, h(10, 30))!.origen, "registro");
});

test("PaFi: aviso de respirador viejo (>12 h del último evento), solo cuando hay PaFi", () => {
  const eventos = [ev("a", 0, 0, { fio2: 50 })];
  assert.equal(pafiConRespirador([lab("pao2", 200, 11)], eventos, [], h(12, 30))!.respiradorViejo, true);
  assert.equal(pafiConRespirador([lab("pao2", 200, 11)], eventos, [], h(11, 30))!.respiradorViejo, false);
  assert.equal(pafiConRespirador([], eventos, [], h(23)), null); // sin gasometría no hay PaFi ni aviso
});

// ---------------------------------------------------------------- datos del médico
test("último valor del médico por campo: el más reciente entre la tabla nueva y las filas viejas", () => {
  const meds = [med("m1", 9, { pvc: 8 }), med("m2", 11, { gc: 5 }), med("m3", 12, { pvc: 99, anulado: true })];
  const viejos = [{ registrado_en: iso(10), anulado: false, pvc: 6 }, { registrado_en: iso(7), anulado: false, gc: 4 }];
  assert.deepEqual(ultimoValorMedico("pvc", meds, viejos), { valor: 6, registrado_en: iso(10), origen: "registro" });
  assert.deepEqual(ultimoValorMedico("gc", meds, viejos), { valor: 5, registrado_en: iso(11), origen: "medico" });
  assert.equal(ultimoValorMedico("sat_venosa", meds, viejos), null);
  // en las tendencias: puntos sueltos con su hora y su origen
  assert.deepEqual(serieMedico("pvc", meds, viejos).map((p) => [p.t, p.valor, p.origen]), [[h(9), 8, "medico"], [h(10), 6, "registro"]]);
});

test("disfunción miocárdica: 'sin evaluar' aunque las filas viejas digan false; después, la confirmada", () => {
  assert.deepEqual(disfuncionMiocardica([]), { estado: "sin_evaluar" });
  assert.deepEqual(disfuncionMiocardica([med("m1", 9, { pvc: 8 })]), { estado: "sin_evaluar" }); // fila sin ese dato
  assert.deepEqual(disfuncionMiocardica([med("m1", 9, { disfuncion_miocardica: true }), med("m2", 10, { disfuncion_miocardica: false })]), {
    estado: "no",
    registrado_en: iso(10),
  });
  assert.deepEqual(disfuncionMiocardica([med("m1", 9, { disfuncion_miocardica: true }), med("m2", 10, { disfuncion_miocardica: false, anulado: true })]), {
    estado: "si",
    registrado_en: iso(9),
  });
});

test("sin evaluar la disfunción, la sugerencia no asume que no hay", () => {
  const base: EstadoParaSugerencias = {
    pam: 95, fc: 130, noradrenalinaGamma: null, noradrenalinaSinDosis: null, vasopresinaActiva: false, disfuncionMiocardica: false,
    disfuncionEvaluada: false, ic: null, corazonCandidato: "sin_definir", sodio: 140, volemia: { cargadas: 0, positivas: 0 },
    estadoDI: "sin_criterios", sodioHaceHoras: null,
  };
  const texto = generarSugerencias(base).flatMap((s) => s.lineas).join("\n");
  assert.match(texto, /Disfunción miocárdica sin evaluar/);
  assert.doesNotMatch(texto, /Sin disfunción miocárdica: esperar/);
});

test("diabetes insípida: osmolaridad de laboratorio con respaldo en las filas viejas (el más reciente)", () => {
  const viejos = [{ registrado_en: iso(8), anulado: false, osm_urinaria: 250 }];
  assert.equal(ultimoLabConRespaldo([lab("osm_urinaria", 280, 10)], "osm_urinaria", viejos, "osm_urinaria", h(10, 30))!.valor, 280);
  assert.equal(ultimoLabConRespaldo([lab("osm_urinaria", 280, 7)], "osm_urinaria", viejos, "osm_urinaria", h(10, 30))!.valor, 250);
  assert.equal(ultimoLabConRespaldo([], "osm_urinaria", [], "osm_urinaria", h(10)), null);
});

test("laboratorio en texto (sedimento) queda fuera de las reglas", () => {
  assert.equal(ultimoValorLab([lab("sedimento", null, 9)], "sedimento", h(10)), null);
});

// ---------------------------------------------------------------- tendencias
test("ventanas: 6, 12 y 24 h, arranca en 12; recorta bien", () => {
  assert.deepEqual([...VENTANAS_TENDENCIA_H], [6, 12, 24]);
  assert.equal(VENTANA_TENDENCIA_INICIAL_H, 12);
  const puntos = [h(0), h(6), h(11), h(15), h(17)].map((t) => ({ t, valor: 1 }));
  const ahora = h(17, 30);
  assert.equal(recortarVentana(puntos, ahora, 6).length, 2); // 15 y 17
  assert.equal(recortarVentana(puntos, ahora, 12).length, 4); // 06, 11, 15, 17 (el límite es 05:30; 00 queda afuera)
  assert.equal(recortarVentana(puntos, ahora, 24).length, 5);
});

test("flecha (primer vs último valor válido): con 2 puntos no aparece; por debajo del mínimo 'estable'; por encima, sube o baja", () => {
  const p = (valores: number[]) => valores.map((valor, i) => ({ t: h(8 + i), valor }));
  assert.equal(direccionTendencia(p([60, 80]), CAMBIO_MINIMO_FLECHA.pam), null);
  assert.equal(direccionTendencia(p([70, 72, 73]), CAMBIO_MINIMO_FLECHA.pam), "estable"); // +3 < 5
  assert.equal(direccionTendencia(p([60, 66, 72]), CAMBIO_MINIMO_FLECHA.pam), "sube");
  assert.equal(direccionTendencia(p([90, 80, 70, 60]), CAMBIO_MINIMO_FLECHA.pam), "baja");
  assert.equal(direccionTendencia(p([0.1, 0.12, 0.13]), CAMBIO_MINIMO_FLECHA.noradrenalina), "estable"); // +0,03 γ < 0,05
});

test("edad del último dato en minutos", () => {
  assert.equal(edadUltimoDato([{ t: h(9), valor: 1 }, { t: h(10), valor: 1 }], h(10, 25)), 25);
  assert.equal(edadUltimoDato([], h(10)), null);
});

test("noradrenalina en γ hora por hora, desde las bombas y su seteo", () => {
  const registros = [
    { id: "a", registrado_en: iso(8), anulado: false },
    { id: "b", registrado_en: iso(9), anulado: false },
    { id: "c", registrado_en: iso(10), anulado: false },
  ];
  const bombas: BombaHora[] = [
    { id: "1", registro_id: "a", droga: "noradrenalina", velocidad_ml_h: 10, dilucion_id: "d", anulado: false },
    { id: "2", registro_id: "b", droga: "noradrenalina", velocidad_ml_h: 0, dilucion_id: "d", anulado: false }, // suspendida
    { id: "3", registro_id: "c", droga: "noradrenalina", velocidad_ml_h: 10, dilucion_id: null, anulado: false }, // sin seteo: sin punto
  ];
  const infusiones: InfusionFila[] = [
    { id: "d", registrado_en: iso(7), droga: "noradrenalina", tipo: "infusion", motivo: "inicio", ampollas: 2, contenido_por_ampolla: 4,
      unidad_contenido: "mg", volumen_final_ml: 100, velocidad_ml_h: null, dosis_calculada: null, unidad_dosis: null, anulado: false },
  ];
  const s = dosisPorFila("noradrenalina", registros, bombas, infusiones, 70);
  assert.equal(s.length, 2);
  cerca(s[0].valor, 800 / 4200);
  assert.deepEqual(s[1], { t: h(9), valor: 0 });
  assert.equal(dosisPorFila("noradrenalina", registros, bombas, infusiones, null).length, 1); // sin peso: solo la suspendida
});

// ---------------------------------------------------------------- franja de estado
test("avisos de enfermería: una sola hora pendiente (pasados 15 min) y una sola nota (la de la última hora cargada)", () => {
  const regs = [
    { registrado_en: iso(8), anulado: false, aviso_medico: "Diuresis baja" },
    { registrado_en: iso(9), anulado: false, aviso_medico: "Taquicárdico" },
  ];
  const a = avisosDeEnfermeria(regs, h(10, 20));
  assert.deepEqual(a.pendiente, { inicio: h(10), texto: "Hora 10 pendiente (enfermería)" });
  assert.deepEqual(a.nota, { texto: "Taquicárdico", registrado_en: iso(9) });
  assert.equal(avisosDeEnfermeria(regs, h(10, 5)).pendiente, null); // antes de :15
  // la última hora cargada sin nota: no se muestra una nota vieja
  assert.equal(avisosDeEnfermeria([...regs, { registrado_en: iso(10), anulado: false, aviso_medico: null }], h(10, 30)).nota, null);
});

// ---------------------------------------------------------------- tensiones
const tBase: EstadoParaTensiones = {
  estadoDI: "sin_criterios", volemiaPositivas: 0, pafi: null, pulmonCandidato: "sin_definir", sodio: 140, glucemia: 140,
  corazonCandidato: "sin_definir", pam: 70, noradrenalinaGamma: null, vasopresinaActiva: false, balanceAcumulado: 0,
};
const ids = (e: Partial<EstadoParaTensiones>) => tensionesEntreReglas({ ...tBase, ...e }).map((x) => x.id);

test("sin choque de reglas: ninguna tensión", () => {
  assert.deepEqual(ids({}), []);
});

test("tensión 1, volumen contra pulmón: volumen (DI o hipovolemia) con PaFi <300 o pulmón candidato", () => {
  assert.deepEqual(ids({ estadoDI: "sospecha", pafi: 250 }), ["volumen_pulmon"]);
  assert.deepEqual(ids({ volemiaPositivas: 1, pulmonCandidato: "si" }), ["volumen_pulmon"]);
  assert.deepEqual(ids({ estadoDI: "sospecha", pafi: 350 }), []);
  assert.deepEqual(ids({ pafi: 200 }), []); // sin pedido de volumen
});

test("tensión 2, agua libre contra glucemia: apunta a solución al medio y menciona insulina", () => {
  const t = tensionesEntreReglas({ ...tBase, sodio: 155, glucemia: 220 });
  assert.deepEqual(t.map((x) => x.id), ["agua_libre_glucemia"]);
  assert.match(t[0].notas.join(" "), /solución al medio \(0,45 %\)/);
  assert.match(t[0].notas.join(" "), /[Ii]nsulina/);
  assert.deepEqual(ids({ sodio: 155, glucemia: 170 }), []);
});

test("tensión 3, corazón candidato contra hipotensión", () => {
  assert.deepEqual(ids({ corazonCandidato: "si", pam: 55, noradrenalinaGamma: 0.3 }), ["corazon_hipotension"]);
  assert.deepEqual(ids({ corazonCandidato: "si", pam: 70 }), []);
});

test("tensión 4, vasopresina por DI y por hemodinamia: mantiene 'no duplicar'", () => {
  const t = tensionesEntreReglas({ ...tBase, estadoDI: "probable", vasopresinaActiva: true });
  assert.ok(t.some((x) => x.id === "vasopresina" && x.notas.includes("No duplicar.")));
  assert.ok(ids({ estadoDI: "probable", pam: 50, noradrenalinaGamma: 0.4 }).includes("vasopresina"));
  assert.ok(!ids({ estadoDI: "probable" }).includes("vasopresina"));
});

test("tensión 5, volumen contra balance muy positivo con pulmón candidato", () => {
  assert.ok(ids({ volemiaPositivas: 1, pulmonCandidato: "si", balanceAcumulado: 2500 }).includes("volumen_balance"));
  assert.ok(!ids({ volemiaPositivas: 1, pulmonCandidato: "si", balanceAcumulado: 1500 }).includes("volumen_balance"));
  assert.ok(!ids({ volemiaPositivas: 1, pulmonCandidato: "no", balanceAcumulado: 2500 }).includes("volumen_balance"));
});

test("ninguna tensión se resuelve sola: todas 'a criterio médico', sin indicar qué hacer", () => {
  const todas = tensionesEntreReglas({
    ...tBase, estadoDI: "probable", volemiaPositivas: 1, pafi: 200, pulmonCandidato: "si", sodio: 155, glucemia: 220,
    corazonCandidato: "si", pam: 50, noradrenalinaGamma: 0.4, vasopresinaActiva: true, balanceAcumulado: 3000,
  });
  assert.equal(todas.length, 5);
  for (const t of todas) {
    assert.equal(t.leyenda, "A criterio médico.");
    assert.equal(t.lados.length, 2);
    assert.doesNotMatch([t.titulo, ...t.lados, ...t.notas].join(" "), /\b(indicar|iniciar|suspender|administrar|dar)\b/i);
  }
});
