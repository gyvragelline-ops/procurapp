import { test } from "node:test";
import assert from "node:assert/strict";
import { generarSugerencias, type EstadoParaSugerencias } from "../mantenimiento-sugerencias.ts";
import { DOSIS, LEYENDA_VERIFICACION } from "../mantenimiento-metas.ts";

const base: EstadoParaSugerencias = {
  pam: 70,
  fc: 90,
  noradrenalinaGamma: null,
  vasopresinaActiva: false,
  disfuncionMiocardica: false,
  ic: null,
  corazonCandidato: "sin_definir",
  sodio: 140,
  volemia: { cargadas: 0, positivas: 0 },
  estadoDI: "sin_criterios",
  nutricionPrevia: null,
};
const texto = (e: Partial<EstadoParaSugerencias>) =>
  generarSugerencias({ ...base, ...e })
    .flatMap((s) => [s.titulo, ...s.lineas, s.leyenda])
    .join("\n");
const ids = (e: Partial<EstadoParaSugerencias>) => generarSugerencias({ ...base, ...e }).map((s) => s.id);

// ---------------------------------------------------------------- PROHIBIDO
test("la palabra 'atropina' no aparece en ninguna sugerencia (bradicardia y todas las demás combinaciones)", () => {
  const pams = [null, 40, 58, 70, 85, 120];
  const fcs = [null, 30, 55, 90, 125, 150];
  for (const pam of pams)
    for (const fc of fcs)
      for (const disfuncionMiocardica of [false, true])
        for (const ic of [null, 2.0, 3.0])
          for (const estadoDI of ["sin_criterios", "sospecha", "probable"] as const)
            for (const noradrenalinaGamma of [null, 0.2, 0.4]) {
              const t = texto({
                pam, fc, disfuncionMiocardica, ic, estadoDI, noradrenalinaGamma,
                vasopresinaActiva: true, corazonCandidato: "si", sodio: 160,
                volemia: { cargadas: 3, positivas: 2 }, nutricionPrevia: "si",
              });
              assert.doesNotMatch(t, /atropina/i);
            }
  // Bradicardia explícita
  const brady = generarSugerencias({ ...base, fc: 40 }).find((s) => s.id === "bradicardia")!;
  assert.doesNotMatch([brady.titulo, ...brady.lineas].join(" "), /atropina/i);
});

test("bradicardia: isoproterenol o dopamina; refractaria -> marcapasos transitorio", () => {
  const t = texto({ fc: 45 });
  assert.match(t, /isoproterenol 2-10 mcg\/min/);
  assert.match(t, /dopamina 3-10 γ/);
  assert.match(t, /marcapasos transitorio/);
});

// ---------------------------------------------------------------- leyenda
test("toda sugerencia lleva la leyenda de verificación", () => {
  const todas = generarSugerencias({
    ...base, pam: 50, fc: 40, disfuncionMiocardica: true, sodio: 160, estadoDI: "probable",
    volemia: { cargadas: 2, positivas: 1 }, nutricionPrevia: "no",
  });
  assert.ok(todas.length >= 5);
  for (const s of todas) assert.equal(s.leyenda, LEYENDA_VERIFICACION);
});

// ---------------------------------------------------------------- HTA + taquicardia
test("HTA + taquicardia: esperable, no se trata; avisa el colapso posterior", () => {
  const t = texto({ pam: 95, fc: 140 });
  assert.match(t, /esperable/);
  assert.match(t, /NO se trata/);
  assert.match(t, /Sin disfunción miocárdica: esperar/);
  assert.match(t, /hipotensión y colapso cardiovascular/);
  assert.doesNotMatch(t, /esmolol/);
});

test("HTA + taquicardia con disfunción miocárdica: la única sugerencia es esmolol", () => {
  const t = texto({ pam: 95, fc: 140, disfuncionMiocardica: true });
  assert.match(t, /esmolol 50-300 mcg\/kg\/min/);
});

test("urapidilo no aparece en ninguna sugerencia ni en las dosis", () => {
  assert.doesNotMatch(Object.values(DOSIS).join(" "), /urapidilo/i);
  for (const pam of [50, 95])
    for (const disfuncionMiocardica of [false, true])
      for (const ic of [null, 2.0, 3.0]) assert.doesNotMatch(texto({ pam, fc: 140, disfuncionMiocardica, ic }), /urapidilo/i);
});

test("HTA + taquicardia con IC <2,4 (medido o calculado): se esconde el esmolol y dice 'ecocardiograma antes de tratar'", () => {
  const t = texto({ pam: 95, fc: 140, disfuncionMiocardica: true, ic: 2.0 });
  assert.match(t, /ecocardiograma antes de tratar/);
  assert.doesNotMatch(t, /esmolol/);
});

// ---------------------------------------------------------------- hipotensión
test("hipotensión: descartar hipovolemia + noradrenalina 0,05-0,3 γ", () => {
  const t = texto({ pam: 50 });
  assert.match(t, /descartar hipovolemia/);
  assert.match(t, /noradrenalina 0,05-0,3 γ/);
});

test("hipotensión con noradrenalina >0,3 γ: asociar vasopresina 0,01-0,04 U/min", () => {
  assert.match(texto({ pam: 50, noradrenalinaGamma: 0.4 }), /asociar vasopresina 0,01-0,04 U\/min/);
});

test("corazón candidato: 'mantener ≤0,3 γ' solo con 'si', nunca con 'sin_definir' ni 'no'", () => {
  assert.match(texto({ pam: 50, corazonCandidato: "si" }), /Corazón candidato: mantener noradrenalina ≤0,3 γ/);
  assert.doesNotMatch(texto({ pam: 50, corazonCandidato: "sin_definir" }), /Corazón candidato/);
  assert.doesNotMatch(texto({ pam: 50, corazonCandidato: "no" }), /Corazón candidato/);
});

// ---------------------------------------------------------------- volemia, sodio, DI, nutrición
test("hipovolemia: solo con variables dinámicas positivas; con sodio alto suma 0,45%/agua libre", () => {
  assert.ok(!ids({ volemia: { cargadas: 2, positivas: 0 } }).includes("hipovolemia"));
  const t = texto({ volemia: { cargadas: 3, positivas: 2 }, sodio: 152 });
  assert.match(t, /2 de 3 variables dinámicas/);
  assert.match(t, /Ringer lactato o solución 0,9%/);
  assert.match(t, /solución 0,45% o agua libre/);
});

test("diabetes insípida con vasopresina ya corriendo: avisa no duplicar; pide vigilar potasio", () => {
  const t = texto({ estadoDI: "probable", pam: 50, vasopresinaActiva: true });
  assert.match(t, /diuresis osmótica por glucemia alta, manitol o diuréticos, sobrecarga de volumen/);
  assert.match(t, /desmopresina 1-4 mcg IV cada 6-8 h o vasopresina 0,5-2,4 U\/h/);
  assert.match(t, /no duplicar/);
  assert.ok(ids({ estadoDI: "sospecha" }).includes("potasio"));
  assert.ok(!ids({}).includes("potasio"));
});

test("nutrición: si -> dosis mínima; no -> suspender; siempre 'no dejar a dosis plena'", () => {
  assert.match(texto({ nutricionPrevia: "si" }), /dosis mínima/);
  assert.match(texto({ nutricionPrevia: "no" }), /suspender/);
  assert.match(texto({ nutricionPrevia: "no" }), /No dejarla a dosis plena/);
  assert.ok(!ids({ nutricionPrevia: null }).includes("nutricion"));
});

test("orden: rojas primero", () => {
  const niveles = generarSugerencias({ ...base, pam: 50, fc: 40, nutricionPrevia: "si", sodio: 152 }).map((s) => s.nivel);
  assert.deepEqual(niveles, [...niveles].sort((a, b) => ({ rojo: 0, amarillo: 1, info: 2 })[a] - ({ rojo: 0, amarillo: 1, info: 2 })[b]));
  assert.equal(niveles[0], "rojo");
});
