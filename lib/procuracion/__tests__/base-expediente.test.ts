import { test } from "node:test";
import assert from "node:assert/strict";
import { cambio12h, mantenimientoPorSistema, serie, textoCambio, textoValor, type FuentesExpediente } from "../base-expediente.ts";
import { fuentesVacias, registroDemo } from "./fixtures/base-simulados.ts";

const AHORA = new Date(2026, 9, 10, 14, 0).getTime();
const hace = (min: number) => new Date(AHORA - min * 60_000).toISOString();

const lab = (id: string, parametro: string, valor: number | null, min: number, extra = {}) => ({
  id,
  toma_id: `t-${min}`,
  parametro,
  valor,
  valor_texto: null as string | null,
  unidad: null,
  medido_en: hace(min),
  anulado: false,
  origen: "laboratorio" as const,
  ...extra,
});

function fuentes(): FuentesExpediente {
  return {
    ...fuentesVacias(),
    registros: [
      registroDemo("r1", hace(600), { fc: 100, pam: 65, temperatura: 35.8, pvc: 6 }),
      registroDemo("r2", hace(60), { fc: 92, pam: 70, temperatura: 36.4 }),
      { ...registroDemo("r3", hace(30), { fc: 150 }), anulado: true },
    ] as never,
    mediciones: [{ id: "m1", registrado_en: hace(20), disfuncion_miocardica: null, anulado: false, pvc: 9, gc: null, ic_medido: 3.1, sat_venosa: null, delta_pp: null, delta_vs: null, delta_co2_espirado: null, indice_vena_cava: null, resultado_pasivo_miembros: null }],
    respirador: [{ id: "v1", registrado_en: hace(90), modo: "VCV", modo_otro: null, fio2: 40, peep: 8, volumen_corriente: 480, frecuencia: 16, presion_plateau: 24, presion_pico: 30, anulado: false }],
    lab: [
      lab("l1", "na", 148, 300),
      lab("l2", "na", 152, 45),
      lab("l3", "glucemia", 180, 15, { origen: "enfermeria" }),
      lab("l4", "sedimento", null, 200, { valor_texto: "leucocitos 2-4/campo" }),
      lab("l5", "pao2", 200, 40, { toma_id: "g" }),
      lab("l6", "hb", 9.1, 100, { anulado: true }),
    ] as never,
  };
}

test("cada dato del expediente trae su hora y su origen (enfermería / médico / laboratorio)", () => {
  const sistemas = mantenimientoPorSistema(fuentes(), AHORA);
  let conDato = 0;
  for (const s of sistemas)
    for (const f of s.filas) {
      if (!f.ultimo) continue;
      conDato++;
      assert.ok(!Number.isNaN(new Date(f.ultimo.en).getTime()), `${s.key}/${f.clave} sin hora`);
      assert.ok(["enfermeria", "medico", "laboratorio"].includes(f.ultimo.origen), `${s.key}/${f.clave} sin origen`);
    }
  assert.ok(conDato >= 12, `solo ${conDato} filas con dato`);
});

test("serie: junta las fuentes por hora con su origen; anulados afuera", () => {
  const f = fuentes();
  assert.deepEqual(serie("pvc", f, AHORA).map((d) => [d.valor, d.origen]), [[6, "enfermeria"], [9, "medico"]]);
  assert.deepEqual(serie("fc", f, AHORA).map((d) => d.valor), [100, 92]);
  assert.deepEqual(serie("glucemia", f, AHORA).map((d) => d.origen), ["enfermeria"]);
  assert.deepEqual(serie("sedimento", f, AHORA).map((d) => d.valor), ["leucocitos 2-4/campo"]);
  assert.deepEqual(serie("modo", f, AHORA).map((d) => [d.valor, d.origen]), [["VCV", "medico"]]);
  assert.deepEqual(serie("fio2", f, AHORA).map((d) => [d.valor, d.origen]), [[40, "medico"]]);
  assert.deepEqual(serie("hb", f, AHORA), []);
  assert.deepEqual(serie("pafi", f, AHORA).map((d) => [d.valor, d.origen]), [[500, "laboratorio"]]);
});

test("cambio en 12 h: último menos el primero de la ventana (hacen falta dos)", () => {
  const f = fuentes();
  assert.equal(cambio12h(serie("na", f, AHORA), AHORA), 4);
  assert.equal(cambio12h(serie("fc", f, AHORA), AHORA), -8);
  assert.equal(cambio12h(serie("glucemia", f, AHORA), AHORA), null);
  // fuera de la ventana no cuenta
  const viejos = [{ valor: 1, en: hace(13 * 60), origen: "laboratorio" as const }, { valor: 5, en: hace(60), origen: "laboratorio" as const }];
  assert.equal(cambio12h(viejos, AHORA), null);
});

test("tarjetas por sistema: referencia solo como texto, drogas que no corren no se listan", () => {
  const s = mantenimientoPorSistema(fuentes(), AHORA);
  assert.deepEqual(s.map((x) => x.titulo), ["Hemodinámico", "Respiratorio", "Renal y balance", "Metabólico y temperatura", "Hepático y hematológico", "Infeccioso"]);
  const pam = s[0].filas.find((f) => f.clave === "pam")!;
  assert.equal(pam.ultimo?.valor, 70);
  assert.ok(pam.referencia && /mmHg/.test(pam.referencia));
  assert.equal(s.flatMap((x) => x.filas).some((f) => f.clave.startsWith("droga:")), false);
  assert.equal(s[4].filas.find((f) => f.clave === "hb")!.ultimo, null);
});

test("textos con coma decimal", () => {
  assert.equal(textoValor(36.45, 1), "36,5");
  assert.equal(textoValor(152, 0), "152");
  assert.equal(textoValor("VCV", 0), "VCV");
  assert.equal(textoCambio(4, 0), "+4");
  assert.equal(textoCambio(-0.6, 1), "−0,6");
  assert.equal(textoCambio(0, 0), "sin cambio");
  assert.equal(textoCambio(null, 0), "—");
});
