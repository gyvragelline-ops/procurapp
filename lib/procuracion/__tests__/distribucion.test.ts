import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  eleccionInicial,
  estadoOrgano,
  fichaOrgano,
  fichasDistribucion,
  itemsElegidos,
  lineaEnvioFicha,
  mensajeFicha,
  ORGANOS_DISTRIBUCION,
} from "../distribucion.ts";
import { RX_TORAX_HORAS_AVISO } from "../distribucion-requisitos.ts";
import { lineaBaseValida } from "../base-nombre.ts";
import { donantesSimulados } from "./fixtures/base-simulados.ts";

const AHORA = new Date(2026, 9, 10, 14, 32).getTime();
const exp = (id = "sim-a") => donantesSimulados(AHORA).find((x) => x.donante.id === id)!.expediente;
const cfg = (k: string) => ORGANOS_DISTRIBUCION.find((o) => o.clave === k)!;
const req = (organo: string, clave: string, d = exp()) => fichaOrgano(cfg(organo), d, AHORA).requisitos.find((r) => r.clave === clave)!;

test("configuración: un solo archivo, marcado A VALIDAR; los 5 órganos con sus listas (sin isquemia)", () => {
  const src = readFileSync(new URL("../distribucion-requisitos.ts", import.meta.url), "utf8");
  assert.match(src, /A VALIDAR CON PROTOCOLO CUCAIBA\/INCUCAI/);
  assert.deepEqual(
    ORGANOS_DISTRIBUCION.map((o) => [o.etiqueta, o.requisitos.length]),
    [
      ["Pulmón", 8],
      ["Corazón", 6],
      ["Riñón", 7],
      ["Hígado", 7],
      ["Páncreas", 5],
    ]
  );
  assert.ok(!ORGANOS_DISTRIBUCION.some((o) => o.requisitos.some((r) => /isquemia/i.test(r.etiqueta))));
  assert.equal(RX_TORAX_HORAS_AVISO, 12);
});

test("cruce con lo cargado: ✓ listo con su valor, ○ lo que falta, ! informativo", () => {
  const pafi = req("pulmon", "pafi");
  assert.equal(pafi.marca, "listo");
  assert.equal(pafi.linea, "PaO₂/FiO₂ 350 · FiO₂ 0,40 · PEEP 8");
  assert.equal(req("pulmon", "fibrobroncoscopia").marca, "falta");
  assert.equal(req("pulmon", "desafio").marca, "falta"); // texto: la app no lo carga
  assert.equal(req("rinon", "hla").marca, "info");
  assert.equal(req("rinon", "hla").valor, "lo hace INCUCAI");
  // parcial: lo que hay sale con su valor, lo demás como pendiente
  const hep = req("higado", "hepatograma");
  assert.equal(hep.marca, "falta");
  assert.match(hep.linea!, /^TGO 45 U\/L · TGP 38 U\/L \(07:32\) · pendiente: BT, BD, FA, GGT$/);
});

test("perímetro torácico: todos los cargados, cada uno con su nombre", () => {
  const t = req("pulmon", "talla_perimetros");
  assert.equal(t.linea, "Talla 175 cm · Perímetro axilar 92 cm · Perímetro xifoideo 85 cm");
});

test("Rx de tórax: 'de hace X h'; con más de 12 h, '!' (solo avisa)", () => {
  assert.equal(req("pulmon", "rx_torax").valor, "de hace 6 h");
  assert.equal(req("pulmon", "rx_torax").marca, "listo");
  const d = exp();
  const vieja = { ...d, estudios: d.estudios.map((e) => (e.tipo_estudio === "Rx_torax" ? { ...e, created_at: new Date(AHORA - 13 * 3_600_000).toISOString() } : e)) };
  const r = req("pulmon", "rx_torax", vieja);
  assert.equal(r.marca, "info");
  assert.equal(r.valor, "de hace 13 h");
});

test("antecedentes: texto libre en una línea, '!'; la Base decide si lo incluye", () => {
  const a = req("pulmon", "antecedentes");
  assert.equal(a.marca, "info");
  assert.ok(!a.linea!.includes("\n"));
  assert.match(a.linea!, /^Antecedentes: Hipertensión arterial en tratamiento\. · Tabaquista/);
});

test("estado del órgano: aceptado / no aceptado / pendiente con equipo / sin avisar", () => {
  const d = exp();
  assert.deepEqual(estadoOrgano(cfg("corazon"), d), { texto: "Sin avisar", color: "mu", equipo: null });
  const eq = { id: "e1", equipo: "Equipo A", organos: ["corazon" as const], organo_otro: null, anestesista: "si" as const, informado_por: "Base (Ana)", medio: null, creado_en: "2026-10-10T12:00:00.000Z", modificado_en: null, anulado: false };
  const conEquipo = { ...d, equipos: [eq] };
  assert.equal(estadoOrgano(cfg("corazon"), conEquipo).texto, "Pendiente · Equipo A · lleva anestesista");
  const marca = (aceptado: boolean) => ({ id: "m1", organo: "corazon", aceptado, equipo_id: "e1", marcado_por: "Ana", marcado_en: "2026-10-10T13:00:00.000Z", anulado: false });
  assert.equal(estadoOrgano(cfg("corazon"), { ...conEquipo, organosAceptados: [marca(true)] }).texto, "Aceptado · Equipo A · lleva anestesista");
  assert.equal(estadoOrgano(cfg("corazon"), { ...conEquipo, organosAceptados: [marca(false)] }).color, "r");
  // la ficha toma el nombre del equipo avisado
  assert.equal(fichaOrgano(cfg("corazon"), conEquipo, AHORA).nombreEquipo, "Equipo A");
  assert.equal(fichaOrgano(cfg("pulmon"), conEquipo, AHORA).nombreEquipo, "Equipo pulmonar");
});

test("N de M listos: no cuentan los informativos", () => {
  const f = fichasDistribucion(exp(), AHORA).find((x) => x.cfg.clave === "rinon")!;
  assert.equal(f.total, 5); // 7 menos HLA y biopsia
  assert.ok(f.listos <= f.total);
});

test("mensaje: SOLO lo tildado; lo tildado que falta sale como Pendiente; sin nombre ni DNI; cierre", () => {
  const d = exp();
  const f = fichaOrgano(cfg("rinon"), d, AHORA);
  const e = eleccionInicial(f);
  assert.equal(e.tildes.hla, false); // informativos destildados de entrada
  const m = mensajeFicha(f, e, "PRUEBA · PD 000101", AHORA);
  assert.match(m, /^\*PRUEBA · PD 000101 · Ficha Equipo renal\*\nDatos hasta 14:12\n/);
  assert.match(m, /\*Pendiente\*\n• Sedimento y proteinuria\n• Ecografía renal/);
  assert.ok(m.endsWith("La aptitud la decide cada equipo."));
  assert.ok(!m.includes("HLA"));
  const nombre = (d.donante as { nombre_completo?: string | null }).nombre_completo;
  if (nombre) assert.ok(!m.includes(nombre));
  // destildar lo que falta: ya no sale como pendiente; destildar un dato: no sale
  const sinEco = { ...e, tildes: { ...e.tildes, ecografia_renal: false, creatinina_urea: false } };
  const m2 = mensajeFicha(f, sinEco, "PD 000101", AHORA);
  assert.ok(!m2.includes("Ecografía renal"));
  assert.ok(!m2.includes("Creatinina"));
  assert.match(m2, /\*Pendiente\*\n• Sedimento y proteinuria\n\n/);
});

test("texto escrito en la ficha (prueba de desafío, FEVI, diabetes previa) sale en lugar de 'Pendiente'", () => {
  const f = fichaOrgano(cfg("pulmon"), exp(), AHORA);
  const e = eleccionInicial(f);
  assert.deepEqual(itemsElegidos(f, e).pendientes, ["Prueba de desafío (FiO₂ 1,0 y PEEP 5)", "Fibrobroncoscopia"]);
  const con = { ...e, textos: { desafio: "PaO₂ 420 a los 20 min" } };
  const r = itemsElegidos(f, con);
  assert.deepEqual(r.pendientes, ["Fibrobroncoscopia"]);
  assert.ok(r.lineas.includes("Prueba de desafío: PaO₂ 420 a los 20 min"));
});

test("cada envío deja su línea: quién, hora, equipo y adjuntos (y nunca sin nombre)", () => {
  const f = fichaOrgano(cfg("pulmon"), exp(), AHORA);
  const l = lineaEnvioFicha("envió por WhatsApp", f, 1, "Ana", AHORA);
  assert.equal(l, "Base · Ana · envió por WhatsApp la ficha de Pulmón para Equipo pulmonar · 1 adjunto (14:32)");
  assert.ok(lineaBaseValida(l));
  assert.equal(lineaEnvioFicha("copió", f, 0, "Ana", AHORA), "Base · Ana · copió la ficha de Pulmón para Equipo pulmonar · 0 adjuntos (14:32)");
  assert.throws(() => lineaEnvioFicha("copió", f, 0, "", AHORA));
});

test("ficha: si la PaFi no se calcula, la línea dice el motivo (nunca un número)", () => {
  const d = exp();
  const conFio2 = (fio2: number) => ({ ...d, fuentes: { ...d.fuentes, respirador: d.fuentes.respirador.map((e) => ({ ...e, fio2 })) } });
  const inval = req("pulmon", "pafi", conFio2(40));
  assert.equal(inval.marca, "falta");
  assert.equal(inval.linea, "PaO₂/FiO₂: FiO₂ inválida (esperado 0,21–1)");
  // sin respirador y sin FiO2 en la propia gasometría
  const sinResp = req("pulmon", "pafi", { ...d, fuentes: { ...d.fuentes, respirador: [], lab: d.fuentes.lab.filter((v) => v.parametro !== "fio2") } });
  assert.equal(sinResp.linea, "PaO₂/FiO₂: FiO₂ no registrada para esta gasometría");
  const sinPao2 = req("pulmon", "pafi", { ...d, fuentes: { ...d.fuentes, lab: d.fuentes.lab.filter((v) => v.parametro !== "pao2") } });
  assert.equal(sinPao2.valor, "falta PaO₂");
  for (const r of [inval, sinResp, sinPao2]) assert.ok(!/\d{3,}/.test(r.linea ?? r.valor));
});

test("ficha: valores inverosímiles 'a verificar' (PaFi > 700, diuresis irreal) y NO se mandan como dato", () => {
  const d = exp();
  const raro = {
    ...d,
    fuentes: {
      ...d.fuentes,
      respirador: d.fuentes.respirador.map((e) => ({ ...e, fio2: 0.21 })), // 140 / 0,21 = 667: todavía verosímil
      lab: d.fuentes.lab.map((v) => (v.parametro === "pao2" ? { ...v, valor: 300 } : v)), // 300 / 0,21 = 1429
      registros: d.fuentes.registros.map((x) => ({ ...x, diuresis_ml: 40000 })),
    },
  };
  const pf = req("pulmon", "pafi", raro);
  assert.deepEqual([pf.marca, pf.valor, pf.linea], ["verificar", "a verificar", null]);
  const di = req("rinon", "diuresis_balance", raro);
  assert.deepEqual([di.marca, di.valor, di.linea], ["verificar", "a verificar", null]);
  const f = fichaOrgano(cfg("pulmon"), raro, AHORA);
  const m = mensajeFicha(f, eleccionInicial(f), "PD 000101", AHORA);
  assert.ok(m.includes("*A verificar* (no se envía el valor)\n• PaO₂/FiO₂ con FiO₂ y PEEP"));
  assert.ok(!m.includes("1429") && !m.includes("1.429"));
  const fr = fichaOrgano(cfg("rinon"), raro, AHORA);
  assert.ok(!mensajeFicha(fr, eleccionInicial(fr), "PD 000101", AHORA).includes("40000"));
});

test("respirador en la ficha: FiO₂ en fracción con coma ('FiO₂ 0,40'), nunca '%'", () => {
  const r = req("pulmon", "respirador");
  assert.match(r.linea!, /FiO₂ 0,40/);
  assert.ok(!r.linea!.includes("%"));
});
