import { test } from "node:test";
import assert from "node:assert/strict";
import { BLOQUE_COMUN, BOM, COLUMNAS, SECCIONES, armarCsv, campoCsv, exportarCsv, seccionesDeEquipo, textoTimelineExportacion } from "../base-exportar.ts";
import { donantesSimulados, registroDemo } from "./fixtures/base-simulados.ts";

const AHORA = new Date(2026, 9, 10, 14, 5).getTime();

test("bloque común en todos los equipos: datos, serologías, hemodinámico, hemograma, hepatograma, coagulograma, amilasa, sedimento, cultivos, estudios, quirófano", () => {
  for (const k of ["identificacion", "serologias", "hemodinamico", "hemograma", "hepatograma", "coagulograma", "amilasa", "sedimento", "cultivos", "estudios", "quirofano"]) assert.ok(BLOQUE_COMUN.includes(k), k);
  for (const e of ["cardiaco", "pulmonar", "hepatico", "renal", "pancreas"] as const) {
    const s = seccionesDeEquipo(e);
    for (const k of BLOQUE_COMUN) assert.ok(s.includes(k), `${e} sin ${k}`);
    assert.equal(new Set(s).size, s.length, `${e} repite secciones`);
  }
});

test("lo propio de cada equipo", () => {
  const propio = (e: Parameters<typeof seccionesDeEquipo>[0]) => seccionesDeEquipo(e).filter((k) => !BLOQUE_COMUN.includes(k));
  assert.deepEqual(propio("cardiaco"), ["lab_cardiaco", "monitoreo_avanzado", "candidato_corazon", "ecg", "ecocardiograma", "ecografias"]);
  assert.deepEqual(propio("pulmonar"), ["respiratorio", "gases", "torax", "broncoscopia", "balance"]);
  assert.deepEqual(propio("hepatico"), ["ecografias", "electrolitos", "glucemia"]);
  assert.deepEqual(propio("renal"), ["ecografias", "balance", "renal", "electrolitos"]);
  assert.deepEqual(propio("pancreas"), ["glucemia", "insulina"]);
  assert.deepEqual(seccionesDeEquipo("todo"), SECCIONES.map((s) => s.key));
});

test("CSV: BOM, ';', coma decimal, columnas fijas y comillas cuando hace falta", () => {
  const csv = armarCsv([["Procurapp", "Equipo: Todo"]], [
    { donante: "PD 1", en: new Date(2026, 9, 10, 9, 7).toISOString(), parametro: "Sodio", valor: 148.5, unidad: "mEq/L", origen: "Laboratorio" },
    { donante: "PD 1", en: null, parametro: "Nota", valor: 'dice "hola"; chau', unidad: null, origen: "Procurador" },
  ]);
  assert.ok(csv.startsWith(BOM));
  const lineas = csv.slice(1).split("\r\n");
  assert.equal(lineas[0], "Procurapp;Equipo: Todo");
  assert.equal(lineas[1], "");
  assert.equal(lineas[2], COLUMNAS.join(";"));
  assert.equal(lineas[2], "donante;fecha_hora;parametro;valor;unidad;origen");
  assert.equal(lineas[3], "PD 1;10/10/2026 09:07;Sodio;148,5;mEq/L;Laboratorio");
  assert.equal(lineas[4], 'PD 1;;Nota;"dice ""hola""; chau";;Procurador');
  assert.equal(campoCsv(0.25), "0,25");
  assert.equal(campoCsv(null), "");
});

test("privacidad: para un equipo NUNCA salen nombre ni DNI (aunque se pida); la Base solo con la opción", () => {
  const d = donantesSimulados(AHORA).find((x) => x.donante.id === "sim-a")!.exportacion;
  const todo = (r: ReturnType<typeof exportarCsv>) => r.archivos.map((a) => a.nombre + a.contenido).join("\n");
  const equipo = todo(exportarCsv(d, { equipo: "cardiaco", destino: "equipo", incluirNombreYDni: true }, AHORA));
  assert.equal(d.donante.nombre_completo, "Sofía Alvarez");
  assert.equal(/Sofía Alvarez|DNI-000101/.test(equipo), false);
  assert.ok(equipo.includes("PD 000101 · Folio F-000101"));
  const baseSin = todo(exportarCsv(d, { equipo: "todo", destino: "base", incluirNombreYDni: false }, AHORA));
  assert.equal(/Sofía Alvarez|DNI-000101/.test(baseSin), false);
  const baseCon = todo(exportarCsv(d, { equipo: "todo", destino: "base", incluirNombreYDni: true }, AHORA));
  assert.ok(baseCon.includes("Sofía Alvarez") && baseCon.includes("DNI-000101"));
});

test("cada exportación lleva 'datos hasta' y deja su línea en la línea de tiempo", () => {
  const sim = donantesSimulados(AHORA).find((x) => x.donante.id === "sim-a")!;
  const r = exportarCsv(sim.exportacion, { equipo: "pulmonar", destino: "equipo", incluirNombreYDni: false }, AHORA);
  assert.equal(r.datosHasta, "10/10/2026 14:05");
  assert.equal(r.timeline, "Exportado para equipo Pulmonar, 14:05");
  assert.deepEqual(r.archivos.map((a) => a.seccion), seccionesDeEquipo("pulmonar"));
  for (const a of r.archivos) {
    assert.ok(a.contenido.includes("Datos hasta;10/10/2026 14:05"), a.seccion);
    assert.ok(a.nombre.startsWith("procurapp_PD000101_pulmonar_"), a.nombre);
  }
  assert.equal(textoTimelineExportacion("todo", false, "09:00"), "Exportado completo, 09:00");
  assert.equal(textoTimelineExportacion("todo", true, "09:00"), "Exportado completo, 09:00 (con nombre y DNI)");
});

test("las filas de parámetros salen crudas, con hora y origen", () => {
  const sim = donantesSimulados(AHORA).find((x) => x.donante.id === "sim-a")!;
  const exp = { ...sim.exportacion, estudios: [] as typeof sim.exportacion.estudios, fuentes: { ...sim.exportacion.fuentes, registros: [registroDemo("r", new Date(2026, 9, 10, 13, 40).toISOString(), { pam: 72.5 })] as never } };
  const hemo = exportarCsv(exp, { equipo: "todo", destino: "equipo", incluirNombreYDni: false }, AHORA).archivos.find((a) => a.seccion === "hemodinamico")!;
  assert.ok(hemo.contenido.includes("PD 000101 · Folio F-000101;10/10/2026 13:40;PAM;72,5;mmHg;Enfermería"));
  const ecg = () => exportarCsv(exp, { equipo: "cardiaco", destino: "equipo", incluirNombreYDni: false }, AHORA).archivos.find((a) => a.seccion === "ecg")!.contenido;
  assert.ok(ecg().includes(";ECG;sin cargar;"));
  exp.estudios = [{ tipo_estudio: "ECG", descripcion: "ritmo sinusal", created_at: new Date(2026, 9, 10, 7, 15).toISOString() }, { tipo_estudio: "Broncoscopia", descripcion: null, created_at: new Date(2026, 9, 10, 8, 0).toISOString() }];
  assert.ok(ecg().includes("10/10/2026 07:15;ECG;ritmo sinusal;;Procurador"));
  assert.equal(ecg().includes("Broncoscop"), false);
  const bronco = exportarCsv(exp, { equipo: "pulmonar", destino: "equipo", incluirNombreYDni: false }, AHORA).archivos.find((a) => a.seccion === "broncoscopia")!.contenido;
  assert.ok(bronco.includes("10/10/2026 08:00;Broncoscopía;(archivo cargado, sin descripción);;Procurador"));
});
