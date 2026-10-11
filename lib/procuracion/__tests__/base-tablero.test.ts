import { test } from "node:test";
import assert from "node:assert/strict";
import {
  barraEtapas,
  bloqueos,
  esActivo,
  estadoMantenimiento,
  etapaActual,
  faltaOBloquea,
  filaTablero,
  identificador,
  iniciales,
  minutosEnProtocolo,
  ordenarPorUrgencia,
  pendientesEtapa,
  quirofanoEnVentana,
  resumenTarjetas,
  textoDuracion,
  textoTimelineCierre,
  urgencia,
  validarCierre,
  type InsumosTablero,
} from "../base-tablero.ts";
import { datosEtapasVacios, donanteDemo, donantesSimulados, solicitudDemo } from "./fixtures/base-simulados.ts";

const AHORA = new Date(2026, 9, 10, 14, 0).getTime();
const hace = (min: number) => new Date(AHORA - min * 60_000).toISOString();

function insumos(extra: Partial<InsumosTablero> & { minutosProtocolo?: number; tipo?: "multiorganico" | "corneas" } = {}): InsumosTablero {
  const { minutosProtocolo = 60, tipo = "multiorganico", ...resto } = extra;
  return {
    donante: donanteDemo("x", AHORA, { created_at: hace(minutosProtocolo), tipo_procuracion: tipo }),
    etapas: datosEtapasVacios(tipo),
    momentosMantenimiento: [],
    solicitudes: [],
    equipos: [],
    ...resto,
  };
}

test("activo / cerrado: estado_general (vacío cuenta como activo)", () => {
  assert.equal(esActivo({ estado_general: "activo" }), true);
  assert.equal(esActivo({ estado_general: null }), true);
  assert.equal(esActivo({ estado_general: "cerrado" }), false);
});

test("tiempo en protocolo: desde created_at; texto corto", () => {
  assert.equal(minutosEnProtocolo({ created_at: hace(320) }, AHORA), 320);
  assert.equal(textoDuracion(0), "0 min");
  assert.equal(textoDuracion(45), "45 min");
  assert.equal(textoDuracion(60), "1 h");
  assert.equal(textoDuracion(320), "5 h 20 min");
  assert.equal(textoDuracion(1440), "1 d");
  assert.equal(textoDuracion(1620), "1 d 3 h");
});

test("en pantalla iniciales; para exportar PD / folio (nunca nombre ni DNI)", () => {
  assert.equal(iniciales("Juan Carlos de la Peña"), "JCP");
  assert.equal(iniciales(null), "—");
  assert.equal(identificador({ id: "abcdefgh-1", pd_numero: "123456", folio_numero: "77", nombre_completo: "Juan Pérez" }), "PD 123456 · Folio 77");
  assert.equal(identificador({ id: "abcdefgh-1", pd_numero: null, folio_numero: null, nombre_completo: "Juan Pérez" }), "JP · abcdefgh");
});

test("último dato de Mantenimiento: verde <60 min, ámbar 60–120, rojo >120", () => {
  const color = (min: number) => {
    const m = estadoMantenimiento(insumos({ momentosMantenimiento: [hace(500), hace(min)] }), AHORA);
    return m.tipo === "con_datos" ? m.color : m.tipo;
  };
  assert.equal(color(59), "verde");
  assert.equal(color(60), "ambar");
  assert.equal(color(120), "ambar");
  assert.equal(color(121), "rojo");
  assert.deepEqual(estadoMantenimiento(insumos({ tipo: "corneas" }), AHORA), { tipo: "no_aplica" });
});

test("Mantenimiento nunca iniciado: aviso ámbar pasadas 2 h de protocolo, NO rojo", () => {
  const a120 = insumos({ minutosProtocolo: 120 });
  const a121 = insumos({ minutosProtocolo: 121 });
  assert.deepEqual(estadoMantenimiento(a120, AHORA), { tipo: "sin_datos", minutosProtocolo: 120, noIniciado: false });
  assert.deepEqual(estadoMantenimiento(a121, AHORA), { tipo: "sin_datos", minutosProtocolo: 121, noIniciado: true });
  assert.deepEqual(bloqueos(a121, AHORA), []);
  assert.deepEqual(faltaOBloquea(a121, AHORA).ambar, ["Mantenimiento no iniciado"]);
  assert.equal(barraEtapas(a121, AHORA).find((e) => e.key === "mantenimiento")?.estado, "amber");
  assert.equal(urgencia(a121, AHORA).nivel, 4);
});

test("bloquea (rojo): urgente sin respuesta >30 min, o Mantenimiento sin dato >2 h desde el último", () => {
  const sol = (min: number, extra = {}) => insumos({ solicitudes: [solicitudDemo("s", "x", AHORA, { prioridad: "urgente", titulo: "Eco", created_at: hace(min), ...extra })] });
  assert.equal(bloqueos(sol(30), AHORA).length, 0);
  assert.deepEqual(bloqueos(sol(31), AHORA).map((b) => b.texto), ["Pedido urgente sin respuesta hace 31 min: Eco"]);
  assert.equal(bloqueos(sol(60, { prioridad: "normal" }), AHORA).length, 0);
  assert.equal(bloqueos(sol(60, { respuesta: "en camino" }), AHORA).length, 0);
  assert.equal(bloqueos(sol(60, { estado: "completado" }), AHORA).length, 0);
  assert.equal(bloqueos(sol(60, { anulado: true }), AHORA).length, 0);

  const mant = insumos({ momentosMantenimiento: [hace(130)] });
  assert.deepEqual(bloqueos(mant, AHORA).map((b) => b.texto), ["Mantenimiento sin datos hace 2 h 10 min"]);
  assert.equal(barraEtapas(mant, AHORA).find((e) => e.key === "mantenimiento")?.estado, "red");
  // con la etapa Mantenimiento completa, ya no bloquea
  const completo = { ...mant, etapas: { ...mant.etapas, marcas: { mantenimiento: { marca: "completo" as const, en: null } } } };
  assert.equal(bloqueos(completo, AHORA).length, 0);
});

test("etapa actual = primera no completa; 'falta' sale de los pendientes reales", () => {
  const i = insumos();
  assert.equal(etapaActual(barraEtapas(i, AHORA))?.key, "potencial");
  assert.deepEqual(faltaOBloquea({ ...i, etapas: { ...i.etapas, donante: { ...i.etapas.donante, servicio: "UTI" } } }, AHORA).pendientes, ["falta N° PD", "falta fecha de ingreso"]);

  const d = datosEtapasVacios();
  assert.deepEqual(pendientesEtapa("muestras", { ...d, muestras: [{ obtenida: true }, { obtenida: false }, { obtenida: false }] }), ["faltan 2 de 3 muestras"]);
  assert.deepEqual(pendientesEtapa("muestras", d), ["sin muestras cargadas"]);
  assert.deepEqual(pendientesEtapa("cultivos", { ...d, cultivos: [{ estado: "pendiente" as never, anulado: false }, { estado: "pendiente" as never, anulado: true }] }), ["1 cultivo pendiente de resultado"]);
  assert.deepEqual(pendientesEtapa("judicial", { ...d, fotosJudiciales: [{ tipo: "precario" }] }), ["falta autorización del juez"]);
  assert.deepEqual(pendientesEtapa("quirofano", d), ["sin hora de quirófano"]);
  assert.deepEqual(pendientesEtapa("medidas", d), ["sin marcar completa"]);
  assert.deepEqual(pendientesEtapa("me", d), ["falta hora de 1ª evaluación", "falta hora de 2ª evaluación", "24 reflejos sin completar", "falta test de confirmación"]);
  assert.deepEqual(pendientesEtapa("comMuerte", { ...d, comMuerteRealizada: true, marcas: { comMuerte: { marca: "no_completo", en: null } } }), ["marcada no completa manualmente"]);
  assert.deepEqual(pendientesEtapa("cultivos", { ...d, marcas: { cultivos: { marca: "completo", en: null } } }), []);
});

test("quirófano en ventana: de 2 h atrás a 24 h adelante", () => {
  const qx = (minutos: number) => quirofanoEnVentana({ etapas: { ...datosEtapasVacios(), horariosQx: [{ id: "q", hora: hace(minutos), registrado_en: hace(300), anulado: false }] } }, AHORA);
  assert.ok(qx(120));
  assert.equal(qx(121), null);
  assert.ok(qx(-24 * 60));
  assert.equal(qx(-24 * 60 - 1), null);
});

test("orden por urgencia con 5 protocolos simulados en simultáneo", () => {
  const activos = donantesSimulados(AHORA).filter((x) => esActivo(x.donante));
  assert.equal(activos.length, 5);
  // b (sin dato hace 130 min) y a (urgente hace 45 min): nivel 1, el bloqueo más viejo primero
  assert.deepEqual(ordenarPorUrgencia(activos, AHORA).map((x) => x.donante.id), ["sim-b", "sim-a", "sim-c", "sim-d", "sim-e"]);
  assert.deepEqual(activos.map((x) => urgencia(x, AHORA).nivel), [1, 1, 2, 3, 4]);
  assert.deepEqual(resumenTarjetas(donantesSimulados(AHORA), AHORA), { activos: 5, requierenAccion: 3, quirofano24h: 1, solicitudesAbiertas: 2 });
});

test("desempates: nivel 3 urgentes antes; después más tiempo en protocolo; después id", () => {
  const conSol = (id: string, prioridad: "normal" | "urgente", minSol: number, minProt = 60) => ({
    ...insumos({ minutosProtocolo: minProt }),
    donante: donanteDemo(id, AHORA, { created_at: hace(minProt) }),
    solicitudes: [solicitudDemo(`s-${id}`, id, AHORA, { prioridad, created_at: hace(minSol) })],
  });
  // urgente de 10 min (no vencida) antes que normal de 90 min
  assert.deepEqual(ordenarPorUrgencia([conSol("n", "normal", 90), conSol("u", "urgente", 10)], AHORA).map((x) => x.donante.id), ["u", "n"]);
  const sinNada = (id: string, minProt: number) => ({ ...insumos({ minutosProtocolo: minProt }), donante: donanteDemo(id, AHORA, { created_at: hace(minProt) }) });
  assert.deepEqual(ordenarPorUrgencia([sinNada("a", 30), sinNada("b", 90)], AHORA).map((x) => x.donante.id), ["b", "a"]);
  assert.deepEqual(ordenarPorUrgencia([sinNada("z", 30), sinNada("y", 30)], AHORA).map((x) => x.donante.id), ["y", "z"]);
});

test("fila del tablero: datos crudos, equipos con órganos, sin nombre", () => {
  const c = donantesSimulados(AHORA).find((x) => x.donante.id === "sim-c")!;
  const f = filaTablero(c, AHORA);
  assert.equal(f.iniciales, "NS");
  assert.equal(f.tiempoEnProtocolo, "1 d 1 h");
  assert.equal(f.hospital, "Hospital Simulado B · La Plata");
  assert.deepEqual(f.equipos, [
    { equipo: "Hígado Hospital Simulado", organos: ["Hígado"] },
    { equipo: "Riñón Simulado", organos: ["Riñones"] },
  ]);
  assert.equal(JSON.stringify(f).includes("Nora Sosa"), false);
  // intervención judicial aplica: 13 etapas; la actual es la judicial (falta la autorización)
  assert.equal(f.barra.length, 13);
  assert.deepEqual(f.barra.map((e) => e.numero), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assert.equal(f.etapaActual?.key, "judicial");
  assert.deepEqual(f.falta.pendientes, ["falta autorización del juez"]);
});

test("cerrar protocolo: resultado obligatorio ('otro' con texto) y línea de tiempo", () => {
  assert.equal(validarCierre(null, "").ok, false);
  assert.equal(validarCierre("otro", "  ").ok, false);
  assert.deepEqual(validarCierre("negativa_familiar", ""), { ok: true, detalle: null });
  assert.equal(textoTimelineCierre("negativa_familiar", null, "14:05"), "Protocolo cerrado — Negativa familiar (14:05)");
  assert.equal(textoTimelineCierre("otro", "traslado", "14:05"), "Protocolo cerrado — Otro: traslado (14:05)");
});
