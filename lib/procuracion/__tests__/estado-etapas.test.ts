import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoCalculadoEtapa, estadoEtapa, etapasVisibles } from "../estado-etapas.ts";
import { datosEtapasVacios } from "../base-demo.ts";
import { REFLEJOS_ME, reflejoKey } from "../constants.ts";

test("etapas visibles: 12 sin judicial, 13 con judicial (anteúltima); córneas aparte", () => {
  const sin = etapasVisibles("multiorganico", false);
  const con = etapasVisibles("multiorganico", true);
  assert.equal(sin.length, 12);
  assert.equal(con.length, 13);
  assert.deepEqual(con.slice(-2).map((e) => e.key), ["judicial", "quirofano"]);
  assert.equal(sin.some((e) => e.key === "judicial"), false);
  assert.equal(etapasVisibles("corneas", false).some((e) => e.key === "mantenimiento"), false);
});

test("estado calculado: misma regla que la pantalla del procurador, etapa por etapa", () => {
  const d = datosEtapasVacios();
  for (const e of etapasVisibles("multiorganico", true)) assert.ok(["gray", undefined].includes(estadoCalculadoEtapa(e.key, d)), e.key);

  const me: Record<string, string> = { hora_1a: "10:00", hora_2a: "16:00", tipo_test_confirmacion: "apnea", apneica1_pco2_inicial: "40", apneica1_pco2_final: "65" };
  for (const r of REFLEJOS_ME) for (const m of ["1a", "2a"] as const) me[reflejoKey(r.key, m)] = "ausente";
  const llena = {
    ...d,
    donante: { servicio: "UTI", pd_numero: "1", fecha_ingreso: "2026-10-10", tipo_procuracion: "multiorganico" as const },
    meCampos: me,
    certAuxCampos: { eeg: "completo" },
    comMuerteRealizada: true,
    comDonacionRealizada: true,
    labImagenesCompleto: true,
    medidasCompleto: true,
    mantenimientoCompleto: true,
    muestras: [{ obtenida: true }],
    cultivos: [{ estado: "negativo" as never, anulado: false }],
    horariosQx: [{ id: "q", hora: "2026-10-10T18:00:00Z", registrado_en: "2026-10-10T10:00:00Z", anulado: false }],
    fotosJudiciales: [{ tipo: "precario" }, { tipo: "autorizacion_juez" }],
    etapasGuardadas: { documentacion: "green" as const },
  };
  for (const e of etapasVisibles("multiorganico", true)) assert.equal(estadoCalculadoEtapa(e.key, llena), "green", e.key);
  assert.equal(estadoCalculadoEtapa("muestras", { ...d, muestras: [{ obtenida: true }, { obtenida: false }] }), "amber");
  assert.equal(estadoCalculadoEtapa("judicial", { ...d, fotosJudiciales: [{ tipo: "precario" }] }), "amber");
});

test("la marca manual prevalece sobre el cálculo", () => {
  const d = datosEtapasVacios();
  assert.equal(estadoEtapa("cultivos", { ...d, marcas: { cultivos: { marca: "completo", en: null } } }), "green");
  assert.equal(estadoEtapa("comMuerte", { ...d, comMuerteRealizada: true, marcas: { comMuerte: { marca: "no_completo", en: null } } }), "amber");
});
