import { test } from "node:test";
import assert from "node:assert/strict";
import {
  equiposVigentes,
  estadoEtapaJudicial,
  estadoEtapaQuirofano,
  historialHora,
  horaVigente,
  mensajesOrdenados,
  textoOrganos,
  validarEquipo,
  validarHora,
  validarMensaje,
  type EquipoQuirofano,
  type HorarioQuirofano,
  type MensajeCaso,
} from "../quirofano-calculos.ts";
import { STAGES_MULTIORGANICO, STRIP_STAGES_MULTIORGANICO } from "../constants.ts";

const h = (hora: number, min = 0, dia = 10) => new Date(2026, 9, dia, hora, min).getTime();
const iso = (hora: number, min = 0, dia = 10) => new Date(h(hora, min, dia)).toISOString();
const hor = (id: string, hora: string, registrado: string, anulado = false): HorarioQuirofano => ({ id, hora, registrado_en: registrado, anulado });

// ---------------------------------------------------------------- hora de quirófano
test("hora vigente: la última cargada no anulada", () => {
  const hs = [hor("a", iso(14), iso(9)), hor("b", iso(16, 30), iso(10, 12)), hor("c", iso(18), iso(11), true)];
  assert.equal(horaVigente(hs)?.id, "b");
  assert.equal(horaVigente([]), null);
  assert.equal(horaVigente([hor("x", iso(14), iso(9), true)]), null);
});

test("cada cambio queda en el historial (el anulado no), del más nuevo al más viejo", () => {
  const hs = [hor("a", iso(14), iso(9, 5)), hor("b", iso(16, 30), iso(10, 12)), hor("c", iso(18), iso(11), true)];
  assert.deepEqual(historialHora(hs), [
    { id: "b", texto: "14:00 → 16:30 (10/10) · cambiado 10:12" },
    { id: "a", texto: "14:00 (10/10) · cargada 09:05" },
  ]);
});

test("hora: tiene que ser una fecha válida", () => {
  assert.deepEqual(validarHora(null), { ok: false, error: "Falta la fecha y hora de quirófano." });
  assert.deepEqual(validarHora("no es fecha"), { ok: false, error: "Falta la fecha y hora de quirófano." });
  assert.deepEqual(validarHora(iso(16)), { ok: true, hora: iso(16) });
});

// ---------------------------------------------------------------- aviso de los equipos
const base = { equipo: "Hígado HIBA", organos: ["higado" as const], organoOtro: "", anestesista: null, informadoPor: "", medio: null };

test("equipo: nombre obligatorio y al menos un órgano; 'otro' exige texto", () => {
  assert.deepEqual(validarEquipo({ ...base, equipo: " " }), { ok: false, error: "Falta el nombre del equipo." });
  assert.deepEqual(validarEquipo({ ...base, organos: [] }), { ok: false, error: "Elegí al menos un órgano." });
  assert.deepEqual(validarEquipo({ ...base, organos: ["otro"], organoOtro: " " }), { ok: false, error: "Escribí cuál es el otro órgano." });
});

test("equipo: anestesista arranca 'sin confirmar'; 'otro' guarda su texto; informado por = equipo + medio", () => {
  const r = validarEquipo({ ...base, organos: ["rinones", "otro", "higado"], organoOtro: " Córneas ", informadoPor: " Dr. Pérez (Hígado HIBA) ", medio: "whatsapp" });
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.datos, {
      equipo: "Hígado HIBA",
      organos: ["higado", "rinones", "otro"], // orden fijo
      organo_otro: "Córneas",
      anestesista: "sin_confirmar",
      informado_por: "Dr. Pérez (Hígado HIBA)",
      medio: "whatsapp",
    });
    assert.equal(textoOrganos({ organos: r.datos.organos, organo_otro: r.datos.organo_otro }), "Hígado, Riñones, Córneas");
  }
  // sin "otro": no guarda el texto aunque haya quedado escrito
  const s = validarEquipo({ ...base, organoOtro: "quedó escrito", anestesista: "si" });
  assert.ok(s.ok && s.datos.organo_otro === null && s.datos.anestesista === "si");
});

test("equipos vigentes: en orden de carga; el anulado no aparece", () => {
  const e = (id: string, creado: string, anulado = false): EquipoQuirofano => ({
    id, equipo: id, organos: ["corazon"], organo_otro: null, anestesista: "sin_confirmar", informado_por: null, medio: null,
    creado_en: creado, modificado_en: null, anulado,
  });
  assert.deepEqual(equiposVigentes([e("b", iso(10)), e("a", iso(9)), e("x", iso(8), true)]).map((x) => x.id), ["a", "b"]);
});

// ---------------------------------------------------------------- chat
test("chat: rol obligatorio; texto de 1 a 1000 caracteres; autor opcional", () => {
  assert.deepEqual(validarMensaje({ rol: null, autor: "", texto: "hola" }), { ok: false, error: "Elegí quién escribe (Procurador, Base o Equipo)." });
  assert.deepEqual(validarMensaje({ rol: "base", autor: "", texto: "   " }), { ok: false, error: "Escribí el mensaje." });
  assert.equal(validarMensaje({ rol: "base", autor: "", texto: "x".repeat(1001) }).ok, false);
  assert.deepEqual(validarMensaje({ rol: "equipo", autor: " Riñón Italiano ", texto: " Salimos 15:30 " }), {
    ok: true, datos: { rol: "equipo", autor: "Riñón Italiano", texto: "Salimos 15:30" },
  });
});

test("chat: del más viejo al más nuevo; los anulados se conservan (tachados en pantalla)", () => {
  const m = (id: string, creado: string, anulado = false): MensajeCaso => ({ id, rol: "base", autor: null, texto: id, creado_en: creado, anulado });
  assert.deepEqual(mensajesOrdenados([m("c", iso(11)), m("a", iso(9), true), m("b", iso(10))]).map((x) => [x.id, x.anulado]), [
    ["a", true], ["b", false], ["c", false],
  ]);
});

// ---------------------------------------------------------------- etapas
test("etapa Hora de quirófano: gris sin hora, verde con hora vigente", () => {
  assert.equal(estadoEtapaQuirofano([]), "gray");
  assert.equal(estadoEtapaQuirofano([hor("a", iso(14), iso(9), true)]), "gray");
  assert.equal(estadoEtapaQuirofano([hor("a", iso(14), iso(9))]), "green");
});

test("etapa Intervención judicial: gris sin fotos, ámbar con una, verde con precario y autorización del juez", () => {
  assert.equal(estadoEtapaJudicial([]), "gray");
  assert.equal(estadoEtapaJudicial([{ tipo: "precario" }]), "amber");
  assert.equal(estadoEtapaJudicial([{ tipo: "autorizacion_juez" }]), "amber");
  assert.equal(estadoEtapaJudicial([{ tipo: "precario" }, { tipo: "autorizacion_juez" }, { tipo: "dni" }]), "green");
});

test("Evaluación multiorgánica ya no es una etapa; Quirófano se llama 'Hora de quirófano'", () => {
  assert.ok(!STAGES_MULTIORGANICO.some((s) => s.key === "organos"));
  assert.ok(!STRIP_STAGES_MULTIORGANICO.includes("organos"));
  assert.equal(STAGES_MULTIORGANICO.find((s) => s.key === "quirofano")?.label, "Hora de quirófano");
});
