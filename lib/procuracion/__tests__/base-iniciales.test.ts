import { test } from "node:test";
import assert from "node:assert/strict";
import { inicialesPorDonante, validarIds } from "../base-iniciales.ts";
import { filaTablero, identificador } from "../base-tablero.ts";
import { identificacionCorta } from "../base-secciones.ts";
import { donantesSimulados } from "./fixtures/base-simulados.ts";

const ID = "2b575719-995d-4e8c-88ae-4ba9490f8268";
const AHORA = new Date(2026, 9, 10, 14, 0).getTime();

test("iniciales en el servidor: solo iniciales, del donante y del primer familiar con nombre", () => {
  const r = inicialesPorDonante(
    [{ id: ID, nombre_completo: "Juan Carlos de la Peña" }, { id: "b", nombre_completo: null }],
    [{ donante_id: ID, nombre: " " }, { donante_id: ID, nombre: "María Pérez" }, { donante_id: ID, nombre: "Otro Nombre" }]
  );
  assert.deepEqual(r, { donantes: { [ID]: "JCP", b: "—" }, familiares: { [ID]: "MP" } });
  assert.ok(!JSON.stringify(r).includes("Juan"));
});

test("iniciales: ids válidos (uuid), sin repetir, con tope", () => {
  assert.deepEqual(validarIds([ID, ID]), { ok: true, ids: [ID] });
  assert.equal(validarIds(["x"]).ok, false);
  assert.equal(validarIds("x").ok, false);
  assert.equal(validarIds(Array.from({ length: 201 }, () => ID)).ok, false);
});

test("la fila del Tablero usa las iniciales del servidor (sin nombre cargado)", () => {
  const i = donantesSimulados(AHORA)[0];
  const d = { ...i.donante, nombre_completo: null, iniciales: "SA" };
  assert.equal(filaTablero({ ...i, donante: d }, AHORA).iniciales, "SA");
  assert.equal(identificador({ id: ID, pd_numero: null, folio_numero: null, nombre_completo: null, iniciales: "SA" }), "SA · 2b575719");
});

test("donante de prueba: 'PRUEBA' en el Tablero y en el texto copiado o compartido", () => {
  const i = donantesSimulados(AHORA)[0];
  assert.equal(filaTablero({ ...i, donante: { ...i.donante, es_prueba: true } }, AHORA).esPrueba, true);
  assert.equal(filaTablero(i, AHORA).esPrueba, false);
  assert.equal(identificacionCorta({ id: ID, pd_numero: "1234", folio_numero: null, es_prueba: true }), "PRUEBA · PD 1234");
  assert.equal(identificacionCorta({ id: ID, pd_numero: "1234", folio_numero: null, es_prueba: false }), "PD 1234");
});
