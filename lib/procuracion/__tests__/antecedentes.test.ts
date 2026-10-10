import { test } from "node:test";
import assert from "node:assert/strict";
import { exportarCsv, seccionesDeEquipo } from "../base-exportar.ts";
import { textoAntecedentes } from "../base-expediente-etapas.ts";
import { donantesSimulados } from "../base-demo.ts";

const AHORA = new Date(2026, 9, 10, 14, 0).getTime();
const sim = (id: string) => donantesSimulados(AHORA).find((x) => x.donante.id === id)!;

test("Antecedentes en la Base: el texto tal cual; vacío -> 'Sin cargar'", () => {
  assert.equal(textoAntecedentes("HTA.\nTabaquista."), "HTA.\nTabaquista.");
  assert.equal(textoAntecedentes(null), "Sin cargar");
  assert.equal(textoAntecedentes("   "), "Sin cargar");
});

test("Antecedentes en el export: bloque común de datos, para todos los equipos", () => {
  for (const equipo of ["todo", "cardiaco", "pulmonar", "hepatico", "renal", "pancreas"] as const) {
    assert.ok(seccionesDeEquipo(equipo).includes("identificacion"), equipo);
    const csv = exportarCsv(sim("sim-a").exportacion, { equipo, destino: "equipo", incluirNombreYDni: false }, AHORA).archivos.find((a) => a.seccion === "identificacion")!.contenido;
    // multilínea: va entre comillas (Excel lo muestra en una celda)
    assert.ok(csv.includes(';Antecedentes;"Hipertensión arterial en tratamiento.\nTabaquista 10 paquetes/año (simulado).";;Ficha'), equipo);
  }
  const vacio = exportarCsv(sim("sim-b").exportacion, { equipo: "todo", destino: "equipo", incluirNombreYDni: false }, AHORA).archivos.find((a) => a.seccion === "identificacion")!.contenido;
  assert.ok(vacio.includes(";Antecedentes;;;Ficha"));
});
