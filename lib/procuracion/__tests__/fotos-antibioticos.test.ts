import { test } from "node:test";
import assert from "node:assert/strict";
import { antibioticosVigentes, validarAntibiotico, type Antibiotico } from "../antibioticos-calculos.ts";
import { fotosFaltantesPotencial, pendientesEtapa, barraEtapas } from "../base-tablero.ts";
import { estadoCalculadoEtapa, etapasVisibles } from "../estado-etapas.ts";
import { datosEtapasVacios, donanteDemo, donantesSimulados } from "../base-demo.ts";
import { fotosDocumentacion } from "../base-expediente-etapas.ts";
import { armarInsumos, filasVacias } from "../base-armado.ts";

const AHORA = new Date(2026, 9, 10, 14, 0).getTime();
const hace = (min: number) => new Date(AHORA - min * 60_000).toISOString();

test("antibiótico: qué y desde cuándo, obligatorios; desde no futuro; foco opcional", () => {
  assert.deepEqual(validarAntibiotico({ antibiotico: " Vancomicina ", desdeIso: hace(60), foco: " Respiratorio " }, AHORA), {
    ok: true,
    datos: { antibiotico: "Vancomicina", desde: hace(60), foco: "Respiratorio" },
  });
  assert.deepEqual(validarAntibiotico({ antibiotico: "Vancomicina", desdeIso: hace(60), foco: "  " }, AHORA), { ok: true, datos: { antibiotico: "Vancomicina", desde: hace(60), foco: null } });
  assert.equal(validarAntibiotico({ antibiotico: " ", desdeIso: hace(60), foco: "" }, AHORA).ok, false);
  assert.equal(validarAntibiotico({ antibiotico: "Vanco", desdeIso: null, foco: "" }, AHORA).ok, false);
  assert.equal(validarAntibiotico({ antibiotico: "Vanco", desdeIso: hace(-10), foco: "" }, AHORA).ok, false);
  assert.equal(validarAntibiotico({ antibiotico: "x".repeat(121), desdeIso: hace(60), foco: "" }, AHORA).ok, false);
});

test("antibióticos vigentes: sin anulados, el inicio más reciente arriba", () => {
  const a = (id: string, min: number, anulado = false): Antibiotico => ({ id, antibiotico: id, desde: hace(min), foco: null, creado_en: hace(min), anulado });
  assert.deepEqual(antibioticosVigentes([a("viejo", 600), a("anulado", 10, true), a("nuevo", 60)]).map((x) => x.id), ["nuevo", "viejo"]);
});

test("etapa 'Cultivos y antibióticos': mismo estado que antes (los antibióticos no lo cambian)", () => {
  assert.equal(etapasVisibles("multiorganico", false).find((e) => e.key === "cultivos")?.label, "Cultivos y antibióticos");
  assert.equal(estadoCalculadoEtapa("cultivos", { ...datosEtapasVacios(), cultivos: [{ estado: "negativo", anulado: false }] }), "green");
});

test("fotos de DNI y de grupo y factor: pendientes de la etapa 01 que NO bloquean ni cambian su color", () => {
  const d = { ...datosEtapasVacios(), donante: { servicio: "UTI", pd_numero: "1", fecha_ingreso: "2026-10-09", tipo_procuracion: "multiorganico" as const } };
  // sin fotos: 01 sigue verde, pero lista las dos fotos
  const sinFotos = { ...d, fotosDocumentacion: [] };
  assert.equal(estadoCalculadoEtapa("potencial", sinFotos), "green");
  assert.deepEqual(pendientesEtapa("potencial", sinFotos), ["falta foto del DNI", "falta foto de grupo y factor"]);
  assert.deepEqual(fotosFaltantesPotencial({ fotosDocumentacion: [{ tipo: "dni" }] }), ["falta foto de grupo y factor"]);
  assert.deepEqual(pendientesEtapa("potencial", { ...d, fotosDocumentacion: [{ tipo: "dni" }, { tipo: "grupo_factor" }] }), []);
  // en la pantalla del procurador (sin datos de fotos) no se listan
  assert.deepEqual(pendientesEtapa("potencial", d), []);
  // marcada completa a mano: igual se listan (no bloquean)
  assert.deepEqual(pendientesEtapa("potencial", { ...sinFotos, marcas: { potencial: { marca: "completo", en: null } } }), ["falta foto del DNI", "falta foto de grupo y factor"]);
  // la etapa 10 no depende de las fotos
  assert.equal(estadoCalculadoEtapa("documentacion", sinFotos), estadoCalculadoEtapa("documentacion", { ...sinFotos, fotosDocumentacion: [{ tipo: "dni" }, { tipo: "grupo_factor" }] }));
});

test("en la Base las fotos se leen de la misma tabla: precario y juez a judicial; DNI y grupo a la etapa 01", () => {
  const don = { ...donanteDemo("x", AHORA, { pd_numero: "1", fecha_ingreso: "2026-10-09" }), servicio: "UTI" };
  const i = armarInsumos(don, { ...filasVacias(), fotosJudiciales: [{ tipo: "dni" }, { tipo: "precario" }] });
  assert.deepEqual(i.etapas.fotosJudiciales, [{ tipo: "precario" }]);
  assert.deepEqual(i.etapas.fotosDocumentacion, [{ tipo: "dni" }]);
  assert.equal(barraEtapas(i, AHORA)[0].estado, "green");
  const a = donantesSimulados(AHORA).find((x) => x.donante.id === "sim-a")!.expediente;
  assert.deepEqual(fotosDocumentacion(a.fotosDocumentacion).map((f) => [f.etiqueta, f.soloBase]), [["Foto del DNI", true], ["Foto de grupo y factor", false]]);
});
