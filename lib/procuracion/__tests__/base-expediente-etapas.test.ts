import { test } from "node:test";
import assert from "node:assert/strict";
import { cambio12h, filaParametro, mantenimientoPorSistema, SISTEMAS, type Dato } from "../base-expediente.ts";
import { exportarCsv } from "../base-exportar.ts";
import { donantesSimulados } from "../base-demo.ts";
import { analisisComunicacion, familiarDeContacto, fotosDocumentacion, medidas, metodosAuxiliares, muestrasPorPaquete, neurologico } from "../base-expediente-etapas.ts";

const AHORA = new Date(2026, 9, 10, 14, 0).getTime();
const hace = (min: number) => new Date(AHORA - min * 60_000).toISOString();
const sim = (id: string) => donantesSimulados(AHORA).find((x) => x.donante.id === id)!;
const fila = (id: string, clave: string) => mantenimientoPorSistema(sim(id).fuentes, AHORA).flatMap((s) => s.filas).find((f) => f.clave === clave);

test("SEGURIDAD: la unidad que eligió el procurador viaja pegada al valor (pantalla)", () => {
  const trop = fila("sim-a", "troponina")!;
  assert.equal(trop.ultimo?.valor, 45);
  assert.equal(trop.ultimo?.unidad, "ng/L");
  assert.equal(trop.unidad, "ng/L");
  assert.equal(fila("sim-a", "cpk_mb")!.unidad, "ng/mL");
  // sin unidad guardada, la del parámetro
  assert.equal(fila("sim-a", "na")!.unidad, "mEq/L");
});

test("SEGURIDAD: la unidad que eligió el procurador sale en el CSV", () => {
  const csv = exportarCsv(sim("sim-a").exportacion, { equipo: "cardiaco", destino: "equipo", incluirNombreYDni: false }, AHORA).archivos.find((a) => a.seccion === "lab_cardiaco")!.contenido;
  assert.ok(csv.includes(";Troponina;45;ng/L;Laboratorio"), csv);
  assert.ok(csv.includes(";CPK-MB;3,1;ng/mL;Laboratorio"), csv);
});

test("SEGURIDAD: con unidades distintas en 12 h no se calcula el cambio (no se resta ng/mL de ng/L)", () => {
  const datos: Dato[] = [
    { valor: 0.05, en: hace(300), origen: "laboratorio", unidad: "ng/mL" },
    { valor: 45, en: hace(60), origen: "laboratorio", unidad: "ng/L" },
  ];
  assert.equal(cambio12h(datos, AHORA), null);
  assert.equal(cambio12h([datos[1], { ...datos[1], valor: 40, en: hace(200) }], AHORA), 5);
  const par = SISTEMAS[0].parametros.find((p) => p.clave === "troponina")!;
  const f = filaParametro(par, { registros: [], mediciones: [], respirador: [], bombas: [], infusiones: [], pesoKg: null, lab: datos.map((d, i) => ({ parametro: "troponina", valor: d.valor as number, unidad: d.unidad!, medido_en: d.en, anulado: false, toma_id: `t${i}` })) }, AHORA);
  assert.equal(f.cambio12h, null);
  assert.equal(f.nota, "unidades distintas en 12 h: sin cambio calculado");
});

test("bombas: dosis con los mL/h al lado; sin dilución se ven los mL/h y por qué no hay dosis", () => {
  const nora = fila("sim-a", "droga:noradrenalina")!;
  assert.equal(nora.unidad, "mcg/kg/min");
  assert.equal(nora.nota, "15 mL/h");
  const insulina = fila("sim-d", "droga:insulina")!;
  assert.deepEqual([insulina.ultimo?.valor, insulina.unidad, insulina.nota], [3, "mL/h", "sin dosis: falta la dilución"]);
});

test("bolos con dosis, unidad y hora; los no usados no se listan", () => {
  const furo = fila("sim-a", "bolo:furosemida")!;
  assert.deepEqual([furo.ultimo?.valor, furo.unidad, furo.ultimo?.origen, furo.nota], [20, "mg", "enfermeria", "1 bolo en 12 h"]);
  assert.equal(fila("sim-a", "bolo:desmopresina")?.unidad, "mcg");
  assert.equal(fila("sim-a", "bolo:esmolol"), undefined);
});

test("monitoreo avanzado, disfunción miocárdica y configuración del médico, con hora y origen", () => {
  for (const k of ["delta_co2_espirado", "indice_vena_cava", "resultado_pasivo_miembros"]) assert.equal(fila("sim-c", k)?.ultimo?.origen, "medico", k);
  assert.equal(fila("sim-c", "disfuncion_miocardica")?.ultimo?.valor, "No");
  const pulmon = fila("sim-a", "config:pulmon_candidato")!;
  assert.deepEqual([pulmon.ultimo?.valor, pulmon.ultimo?.origen, pulmon.ultimo?.en], ["Sí", "medico", hace(9 * 60)]);
  assert.equal(fila("sim-a", "config:monitoreo_avanzado_activo")?.ultimo?.valor, "No");
  assert.equal(fila("sim-a", "config:corazon_candidato")?.ultimo?.valor, "Sin definir");
});

test("ingresos y egresos por tipo, sin 'cambio en 12 h'", () => {
  const sol = fila("sim-a", "ing_sol_09_ml")!;
  assert.equal(sol.ultimo?.valor, 100);
  assert.equal(sol.cambio12h, null);
});

test("02 neurológico: horas, reflejos uno por uno, test, cumple ME", () => {
  const n = neurologico(sim("sim-a").expediente.planillas.neuro);
  assert.equal(n.evaluaciones[0].hora, "08:00");
  assert.equal(n.evaluaciones[1].diabetesInsipida, "Sí");
  assert.equal(n.evaluaciones[0].reflejos.length, 12);
  assert.ok(n.evaluaciones[0].reflejos.every((r) => r.valor === "ausente"));
  assert.deepEqual(n.test.apnea, { pco2Inicial: "40", pco2Final: "65", duracion: "8 min", resultado: "positiva" });
  assert.equal(n.cumpleMe, "Sí");
  const vacio = neurologico({});
  assert.equal(vacio.test.tipo, null);
  assert.ok(vacio.evaluaciones[0].reflejos.every((r) => r.valor === null));
});

test("03 métodos auxiliares con su estado e informe", () => {
  const s = sim("sim-a").expediente;
  const m = metodosAuxiliares(s.certAux, s.planillas.neuro, s.planillas.doppler);
  assert.deepEqual(
    m.map((x) => [x.key, x.estado]),
    [
      ["eeg", "Completo"],
      ["potenciales_evocados", "No corresponde"],
      ["doppler_transcraneano", "Completo"],
      ["angiografia_cerebral", "Pendiente"],
    ]
  );
  assert.equal(m[0].informe, "Silencio eléctrico cerebral (simulado)");
  assert.deepEqual([m[2].fecha, m[2].hora], ["10/10/2026", "09:30"]);
});

test("05 familiar y análisis; 06 muestras; 07 medidas; 10 fotos", () => {
  const s = sim("sim-a").expediente;
  assert.deepEqual(familiarDeContacto(s.familiar).map((x) => x.etiqueta), ["Nombre y apellido", "DNI", "Parentesco", "Dirección", "Celular"]);
  assert.equal(familiarDeContacto(null)[0].valor, null);
  assert.equal(analisisComunicacion(s.analisisComunicacion)[0].etapa, "2. Aceptación, dudas, explicaciones");
  const mu = muestrasPorPaquete(s.muestras);
  assert.equal(mu.length, 8);
  assert.equal(mu.filter((x) => x.estado === "Obtenida").length, 5);
  const me = medidas(s.planillas.medidas, s.donante.talla, s.donante.peso);
  assert.equal(me.length, 10);
  assert.deepEqual(me.slice(0, 3).map((x) => x.valor), ["62 kg", "175 cm", "18 cm"]);
  const fo = fotosDocumentacion(s.fotosDocumentacion);
  assert.deepEqual(fo.map((f) => [f.tipo, f.cantidad, f.soloBase]), [["dni", 1, true], ["grupo_factor", 1, false]]);
});
