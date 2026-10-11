import { test } from "node:test";
import assert from "node:assert/strict";
import {
  A_VERIFICAR,
  armarFicha,
  camposOrgano,
  diffFichas,
  donanteFicha,
  editadosTexto,
  esChoqueDeVersion,
  instantanea,
  lineaDescargaFicha,
  lineaEdicionFicha,
  textoFicha,
  tildesIniciales,
  validarEdicion,
  valoresCampos,
  versionPropuesta,
  versionSiguiente,
  type Ediciones,
  type EnvioPrevio,
} from "../ficha.ts";
import { ORGANOS_DISTRIBUCION } from "../distribucion.ts";
import { ESTUDIOS_POR_ORGANO } from "../distribucion-requisitos.ts";
import { lineaBaseValida } from "../base-nombre.ts";
import { donantesSimulados } from "./fixtures/base-simulados.ts";

const AHORA = new Date(2026, 9, 10, 14, 32).getTime();
const ISO = new Date(AHORA).toISOString();
const exp = (id = "sim-a") => donantesSimulados(AHORA).find((x) => x.donante.id === id)!.expediente;
const cfg = (k: string) => ORGANOS_DISTRIBUCION.find((o) => o.clave === k)!;
const ed = (valor: string, numero: number | null): Ediciones[string] => ({ valor, numero, en: ISO, por: "Ana" });

function ficha(organo: string, ediciones: Ediciones = {}, d = exp(), anterior: EnvioPrevio | null = null, version = 1) {
  const co = camposOrgano(cfg(organo), d, AHORA);
  const vs = valoresCampos(co.campos, ediciones);
  const t = tildesIniciales(co);
  const inst = instantanea(vs, co, t, AHORA);
  const f = armarFicha({ cfg: cfg(organo), nombreEquipo: "Equipo pulmonar", donante: donanteFicha(d.donante), co, valores: vs, tildes: t, version, anterior, instantaneaActual: inst, ahora: AHORA });
  return { co, vs, t, inst, f };
}

test("campos de pulmón: PaO₂, FiO₂ (fracción), PEEP y la PaFi calculada (bloqueada)", () => {
  const { co } = ficha("pulmon");
  const c = (k: string) => co.campos.find((x) => x.clave === k)!;
  assert.deepEqual([c("pao2").original, c("fio2").original, c("peep").original, c("pafi").original], ["140", "0,40", "8", "350"]);
  assert.equal(c("pafi").calculo, "pafi");
  assert.equal(c("fio2").tipo, "fio2");
});

test("los calculados no se editan a mano; se editan sus fuentes y se recalculan", () => {
  const { co } = ficha("pulmon");
  const c = (k: string) => co.campos.find((x) => x.clave === k)!;
  assert.deepEqual(validarEdicion(c("pafi"), "500"), { ok: false, error: "Se calcula: editá la PaO₂ o la FiO₂." });
  const rinon = ficha("rinon").co.campos.find((x) => x.clave === "balance_acumulado")!;
  assert.equal(validarEdicion(rinon, "100").ok, false);
  // PaO₂ 140 -> 160: PaFi 350 -> 400
  const vs = valoresCampos(co.campos, { pao2: ed("160", 160) });
  assert.equal(vs.find((v) => v.campo.clave === "pafi")!.valor, "400");
  // FiO₂ 0,40 -> 0,50: PaFi 280
  const vs2 = valoresCampos(co.campos, { fio2: ed("0,50", 0.5) });
  assert.equal(vs2.find((v) => v.campo.clave === "pafi")!.valor, "280");
});

test("FiO₂ solo en fracción 0,21–1 (coma o punto); 40 se rechaza", () => {
  const f = ficha("pulmon").co.campos.find((x) => x.clave === "fio2")!;
  assert.deepEqual(validarEdicion(f, "0.5"), { ok: true, valor: "0,50", numero: 0.5 });
  assert.deepEqual(validarEdicion(f, "0,5"), { ok: true, valor: "0,50", numero: 0.5 });
  assert.equal(validarEdicion(f, "40").ok, false);
  assert.equal(validarEdicion(f, "1,01").ok, false);
});

test("editado: se marca con el valor anterior y en el PDF '† editado por Base HH:MM (versión anterior: X)'", () => {
  const { vs, f } = ficha("pulmon", { pao2: ed("160", 160) });
  const v = vs.find((x) => x.campo.clave === "pao2")!;
  assert.deepEqual(v.editado, { antes: "140", en: ISO, por: "Ana" });
  const fila = f.secciones.find((s) => s.titulo === "Oxigenación")!.filas.find((x) => x.etiqueta === "PaO₂")!;
  assert.equal(fila.valor, "160 mmHg");
  assert.equal(fila.editado, "† editado por Base 14:32 (versión anterior: 140)");
  assert.deepEqual(editadosTexto(vs), ["PaO₂ 140 → 160"]);
});

test("un valor editado NO toca el registro clínico: los datos de origen siguen iguales", () => {
  const d = exp();
  const antes = JSON.stringify(d);
  ficha("pulmon", { pao2: ed("160", 160) }, d);
  assert.equal(JSON.stringify(d), antes);
});

test("inverosímil -> 'a verificar' y no se manda el valor (PaFi > 700, FiO₂ fuera de rango, diuresis irreal)", () => {
  const { f, inst } = ficha("pulmon", { pao2: ed("400", 400) }); // 400 / 0,40 = 1000
  assert.ok(f.aVerificar.includes("PaO₂/FiO₂ (calculada)"));
  assert.ok(!textoFicha(f).includes("1000") && !textoFicha(f).includes("1.000"));
  assert.equal(inst.valores.pafi.valor, A_VERIFICAR);
  const d = exp();
  const raro = { ...d, fuentes: { ...d.fuentes, registros: d.fuentes.registros.map((x) => ({ ...x, diuresis_ml: 40000 })) } };
  const r = ficha("rinon", {}, raro);
  assert.ok(r.f.aVerificar.includes("Diuresis (mL de la última fila)"));
  assert.ok(!textoFicha(r.f).includes("40000"));
});

test("PaFi que no se puede calcular: la ficha dice el motivo, nunca un número", () => {
  const d = exp();
  const sinFio2 = { ...d, fuentes: { ...d.fuentes, respirador: [], lab: d.fuentes.lab.filter((x) => x.parametro !== "fio2") } };
  const { f } = ficha("pulmon", {}, sinFio2);
  const fila = f.secciones.find((s) => s.titulo === "Oxigenación")!.filas.find((x) => x.etiqueta.startsWith("PaO₂/FiO₂"))!;
  assert.equal(fila.valor, "FiO₂ no registrada para esta gasometría");
});

test("mapeo estudio -> órgano: Rx a pulmón y corazón; ecografía a hígado, riñón y páncreas; foto del laboratorio y del cuerpo, a ninguno", () => {
  assert.deepEqual(ESTUDIOS_POR_ORGANO.Rx_torax, ["pulmon", "corazon"]);
  assert.deepEqual(ESTUDIOS_POR_ORGANO.TAC_torax, ["pulmon"]);
  assert.equal(ESTUDIOS_POR_ORGANO.Laboratorio, undefined);
  assert.equal(ESTUDIOS_POR_ORGANO.Fotos_cuerpo, undefined);
  const d = exp();
  const con = { ...d, estudios: [...d.estudios, { id: "x1", tipo_estudio: "Fotos_cuerpo", descripcion: null, archivo_url: "u", archivo_tipo: "image" as const, created_at: ISO }] };
  assert.ok(!camposOrgano(cfg("pulmon"), con, AHORA).estudios.some((e) => e.tipo === "Fotos_cuerpo"));
  assert.deepEqual(camposOrgano(cfg("pulmon"), d, AHORA).estudios.map((e) => e.tipo), ["Rx_torax"]);
  assert.deepEqual(camposOrgano(cfg("pulmon"), d, AHORA).faltanEstudios.map((e) => e.clave), ["fibrobroncoscopia"]);
});

test("nunca nombre, DNI ni datos de la familia en la ficha ni en su texto", () => {
  const d = exp();
  const conIdentidad = { ...d, donante: { ...d.donante, nombre_completo: "Juana Pérez Prueba", dni: "30111222" }, familiar: { iniciales: "JP", parentesco: "Madre", direccion: "Calle Falsa 123", telefono: "011-5555-5555" } };
  for (const o of ORGANOS_DISTRIBUCION) {
    const { f } = ficha(o.clave, {}, conIdentidad as never);
    const todo = JSON.stringify(f) + textoFicha(f);
    for (const prohibido of ["Juana", "Pérez Prueba", "30111222", "Calle Falsa", "5555-5555", "Madre"]) assert.ok(!todo.includes(prohibido), `${o.clave}: ${prohibido}`);
    assert.ok(f.pie.includes("Sin nombre ni DNI del donante."));
  }
  assert.deepEqual(Object.keys(donanteFicha(conIdentidad.donante as never)).sort(), ["edad", "es_prueba", "folio_numero", "id", "pd_numero", "sexo"]);
});

test("siempre: PD, PRUEBA si corresponde, datos hasta, generado y versión", () => {
  const d = exp();
  const { f } = ficha("pulmon", {}, { ...d, donante: { ...d.donante, es_prueba: true } });
  assert.equal(f.pd, "PD 000101");
  assert.equal(f.prueba, true);
  assert.equal(f.version, 1);
  assert.ok(f.datosHasta);
  assert.equal(f.generado, "14:32");
  assert.match(textoFicha(f), /^\*PRUEBA · PD 000101 · Ficha Equipo pulmonar · versión 1\*/);
});

test("diff entre versiones: cambios de valor, agregados y quitados", () => {
  const a = { valores: { pao2: { etiqueta: "PaO₂", valor: "128" }, pafi: { etiqueta: "PaO₂/FiO₂", valor: "320" }, x: { etiqueta: "Antecedentes", valor: "HTA" } }, estudios: { e1: "Rx de tórax · 07:20" } };
  const b = { valores: { pao2: { etiqueta: "PaO₂", valor: "140" }, pafi: { etiqueta: "PaO₂/FiO₂", valor: "350" } }, estudios: { e1: "Rx de tórax · 07:20", e2: "TAC de tórax · 09:40" } };
  assert.deepEqual(diffFichas(a, b), ["PaO₂ 128 → 140", "PaO₂/FiO₂ 320 → 350", "Antecedentes quitado", "TAC de tórax agregada"]);
  assert.deepEqual(diffFichas(b, b), []);
});

test("versión: igual a la última -> la misma; cambió -> la siguiente (nunca se reusa un número)", () => {
  const { inst } = ficha("pulmon");
  const v1: EnvioPrevio = { version: 1, creado_en: ISO, anulado: false, valores: inst.valores, incluye: { estudios: inst.estudios } };
  assert.deepEqual(versionPropuesta([], inst), { version: 1, nueva: true, anterior: null });
  assert.equal(versionPropuesta([v1], inst).version, 1);
  assert.equal(versionPropuesta([v1], inst).nueva, false);
  const otra = ficha("pulmon", { pao2: ed("160", 160) }).inst;
  assert.deepEqual(versionPropuesta([v1], otra), { version: 2, nueva: true, anterior: v1 });
  // una versión anulada no se reusa
  assert.equal(versionPropuesta([{ ...v1, version: 3, anulado: true }, v1], otra).version, 4);
});

test("versión 2: el PDF lleva 'Cambios respecto de la versión 1'", () => {
  const v1 = ficha("pulmon");
  const anterior: EnvioPrevio = { version: 1, creado_en: ISO, anulado: false, valores: v1.inst.valores, incluye: { estudios: v1.inst.estudios } };
  const { f } = ficha("pulmon", { pao2: ed("160", 160) }, exp(), anterior, 2);
  assert.deepEqual(f.cambios, { desde: 1, en: "14:32", lista: ["PaO₂ 140 → 160", "PaO₂/FiO₂ (calculada) 350 → 400"] });
  assert.match(textoFicha(f), /\*Cambios respecto de la versión 1 \(14:32\)\*\nPaO₂ 140 → 160 · PaO₂\/FiO₂ \(calculada\) 350 → 400/);
});

test("línea de tiempo: cada edición con original, editado y quién; la descarga con versión y editados", () => {
  const l = lineaEdicionFicha("Pulmón", { etiqueta: "PaO₂" }, "140", "160", "Ana", AHORA);
  assert.equal(l, "Base · Ana · editó en la ficha de Pulmón: PaO₂ 140 → 160 (el registro clínico no cambia) (14:32)");
  assert.ok(lineaBaseValida(l));
  const { f, vs } = ficha("pulmon", { pao2: ed("160", 160) });
  assert.equal(lineaDescargaFicha(f, 1, editadosTexto(vs), "Ana", AHORA), "Base · Ana · descargó la ficha v1 de Pulmón para Equipo pulmonar · 1 imagen · editados: PaO₂ 140 → 160 (14:32)");
});

test("guardado de versión: la más alta existente (contando anuladas) + 1; el choque de dos Bases se reconoce para reintentar", () => {
  assert.equal(versionSiguiente([]), 1);
  assert.equal(versionSiguiente([1, 3, 2]), 4); // la 3 puede estar anulada: igual cuenta
  assert.ok(esChoqueDeVersion('duplicate key value violates unique constraint "ficha_envios_version_unica"'));
  assert.ok(esChoqueDeVersion("No se pudo guardar -- revisá tu conexión e intentá de nuevo. (duplicate key value violates unique constraint \"ficha_envios_version_unica\")"));
  assert.equal(esChoqueDeVersion("No se pudo guardar -- revisá tu conexión e intentá de nuevo. (Failed to fetch)"), false);
});
