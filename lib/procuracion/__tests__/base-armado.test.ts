import { test } from "node:test";
import assert from "node:assert/strict";
import { armarInsumos, filasVacias } from "../base-armado.ts";
import { crearFuenteDemo, donanteDemo, donantesSimulados } from "../base-demo.ts";
import { estadoCalculadoEtapa } from "../estado-etapas.ts";
import { exportarTableroCsv } from "../base-exportar.ts";
import { esActivo, filaTablero, ordenarPorUrgencia } from "../base-tablero.ts";
import { mantenimientoPorSistema } from "../base-expediente.ts";

const AHORA = new Date(2026, 9, 10, 14, 0).getTime();

test("de las filas crudas a los insumos: mismo criterio que la pantalla del procurador", () => {
  const d = { ...donanteDemo("x", AHORA, { pd_numero: "1", fecha_ingreso: "2026-10-09" }), servicio: "UTI" };
  const f = {
    ...filasVacias(),
    etapas: [
      { etapa_key: "documentacion", estado: "green" as const, marcado_manual: null, marcado_en: null },
      { etapa_key: "cultivos", estado: "gray" as const, marcado_manual: "completo", marcado_en: "2026-10-10T10:00:00Z" },
    ],
    documentacion: [
      { categoria: "judicial", item_key: "aplica", estado: "si" },
      { categoria: "comMuerte", item_key: "realizada", estado: "si" },
      { categoria: "comDonacion", item_key: "realizada", estado: "no" },
      { categoria: "certificacion", item_key: "eeg", estado: "completo" },
    ],
  };
  const i = armarInsumos(d, f);
  assert.equal(i.etapas.judicialAplica, true);
  assert.equal(estadoCalculadoEtapa("potencial", i.etapas), "green");
  assert.equal(estadoCalculadoEtapa("comMuerte", i.etapas), "green");
  assert.equal(estadoCalculadoEtapa("comDonacion", i.etapas), "gray");
  assert.equal(estadoCalculadoEtapa("certificacion", i.etapas), "green");
  assert.equal(estadoCalculadoEtapa("documentacion", i.etapas), "green");
  assert.deepEqual(i.etapas.marcas, { cultivos: { marca: "completo", en: "2026-10-10T10:00:00Z" } });
});

test("modo demo: 5 activos, lo que se guarda queda en memoria (nada va a la base)", async () => {
  const f = crearFuenteDemo(AHORA);
  assert.equal(f.demo, true);
  const t = await f.cargarTablero();
  assert.equal(t.insumos.length, 5);
  assert.ok(t.insumos.every((x) => esActivo(x.donante)));
  const s = await f.crearSolicitud("sim-e", { titulo: "Peso y talla", detalle: null, origen: "base", destino: "procurador", organo_key: null, prioridad: "normal", pedido_por: null });
  assert.equal((await f.cargarExpediente("sim-e")).insumos.solicitudes.length, 1);
  await f.cambiarSolicitud(s.id, { estado: "completado", completed_at: "2026-10-10T14:10:00Z" });
  assert.equal((await f.cargarExpediente("sim-e")).insumos.solicitudes[0].estado, "completado");
  await f.cambiarEstadoProtocolo("sim-e", "cerrado", "Protocolo cerrado — Otro: prueba (14:10)");
  assert.equal((await f.cargarTablero()).insumos.length, 4);
  assert.equal((await f.cargarExpediente("sim-e")).linea[0].texto, "Protocolo cerrado — Otro: prueba (14:10)");
});

test("datos simulados del expediente: 12 h de series, dosis de noradrenalina con hora y origen", () => {
  const a = donantesSimulados(AHORA).find((x) => x.donante.id === "sim-a")!;
  const hemo = mantenimientoPorSistema(a.fuentes, AHORA)[0];
  const nora = hemo.filas.find((f) => f.clave === "droga:noradrenalina")!;
  assert.ok(nora.ultimo && typeof nora.ultimo.valor === "number");
  assert.equal(nora.ultimo.origen, "enfermeria");
  assert.ok(Math.abs((nora.ultimo.valor as number) - 0.26) < 0.01, String(nora.ultimo.valor));
  // ventana de 12 h: la fila de hace 12 h 20 min queda afuera (110 -> 88)
  assert.equal(hemo.filas.find((f) => f.clave === "fc")!.cambio12h, -22);
});

test("CSV del tablero: una fila por dato, identificador sin nombre, 'datos hasta'", () => {
  const sims = donantesSimulados(AHORA).filter((x) => esActivo(x.donante));
  const filas = ordenarPorUrgencia(sims, AHORA).map((x) => filaTablero(x, AHORA));
  const csv = exportarTableroCsv(filas, AHORA);
  assert.equal(csv.nombre, "procurapp_tablero_20261010-1400.csv");
  assert.ok(csv.contenido.includes("Datos hasta;10/10/2026 14:00"));
  assert.ok(csv.contenido.includes("PD 000102 · Folio F-000102;10/10/2026 14:00;Falta o bloquea;Mantenimiento sin datos hace 2 h 10 min"));
  for (const n of ["Sofía", "Mario", "Nora", "Juan", "Rita"]) assert.equal(csv.contenido.includes(n), false, n);
});
