import { test } from "node:test";
import assert from "node:assert/strict";
import {
  balancePorHora,
  calcularDiuresis,
  dosisPorFila,
  scoreCalidad,
  type BombaHora,
  type FilaHoraria,
  type InfusionFila,
  type RegistroBase,
} from "../mantenimiento-calculos.ts";
import {
  bandaMeta,
  cambioEnVentana,
  direccion,
  enEje,
  fueraDeMeta,
  heroeRitmoDiuretico,
  serieHoraria,
  tarjetaTendencia,
  textoChipDireccion,
  textoRangoMeta,
  textoVacio,
} from "../mantenimiento-tendencias.ts";
import { generarSugerencias, type EstadoParaSugerencias } from "../mantenimiento-sugerencias.ts";
import { CAMBIO_MINIMO_FLECHA, EJE_Y } from "../mantenimiento-metas.ts";

const cerca = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} no es ≈ ${b}`);
const h = (hora: number, min = 0) => new Date(2026, 9, 6, hora, min).getTime();
const iso = (hora: number, min = 0) => new Date(h(hora, min)).toISOString();
const pt = (hora: number, valor: number, min = 0) => ({ t: h(hora, min), valor });

// ---------------------------------------------------------------- serie por hora
test("serie por hora: una casilla por hora; hora sin dato = hueco (no se interpola); gana el último de la hora", () => {
  const s = serieHoraria([pt(8, 70), pt(8, 72, 40), pt(10, 65)], h(11, 30), 4);
  assert.deepEqual(s.map((x) => [x.inicio, x.valor]), [[h(8), 72], [h(9), null], [h(10), 65], [h(11), null]]);
});

test("ventanas de 6, 12 y 24 h: tantas casillas como horas; sin puntos futuros", () => {
  const puntos = [pt(0, 1), pt(6, 2), pt(17, 3), pt(17, 9, 45)];
  for (const horas of [6, 12, 24]) assert.equal(serieHoraria(puntos, h(17, 30), horas).length, horas);
  assert.equal(serieHoraria(puntos, h(17, 30), 6).at(-1)!.valor, 3); // el de 17:45 es futuro
  assert.equal(serieHoraria(puntos, h(17, 30), 12)[0].inicio, h(6));
});

// ---------------------------------------------------------------- dirección
test("dirección: primer contra último valor VÁLIDO; con menos de 3, sin flecha; bajo el mínimo, estable", () => {
  const v = (valores: (number | null)[]) => valores.map((valor, i) => ({ inicio: h(i), valor }));
  assert.equal(direccion(v([80, null, 70]), 5).dir, null); // 2 válidos
  const d = direccion(v([null, 80, 75, null, 62]), CAMBIO_MINIMO_FLECHA.pam);
  assert.deepEqual([d.dir, d.cambio, d.primero!.valor, d.ultimo!.valor], ["baja", -18, 80, 62]);
  assert.equal(direccion(v([70, 75, 73]), CAMBIO_MINIMO_FLECHA.pam).dir, "estable"); // +3 < 5
  assert.equal(direccion(v([0.1, 0.15, 0.18]), CAMBIO_MINIMO_FLECHA.noradrenalina).dir, "estable"); // +0,08 < 0,1
  assert.equal(direccion(v([0.1, 0.15, 0.21]), CAMBIO_MINIMO_FLECHA.noradrenalina).dir, "sube");
});

test("chip de dirección: '↑ subiendo +X en 12 h' / '↓ bajando −X en 12 h' / '→ estable'", () => {
  const v = (valores: number[]) => valores.map((valor, i) => ({ inicio: h(i), valor }));
  assert.equal(textoChipDireccion(direccion(v([80, 70, 62]), 5), 12, 0), "↓ bajando −18 en 12 h");
  assert.equal(textoChipDireccion(direccion(v([0.05, 0.2, 0.34]), 0.1), 12, 2), "↑ subiendo +0,29 en 12 h");
  assert.equal(textoChipDireccion(direccion(v([36.8, 36.9, 37]), 0.5), 6, 1), "→ estable");
  assert.equal(textoChipDireccion(direccion(v([36.8, 37]), 0.5), 6, 1), null);
});

// ---------------------------------------------------------------- ejes fijos y meta
test("eje Y fijo: un valor fuera del eje se dibuja en el borde, sin cambiar la escala", () => {
  assert.deepEqual(enEje(35, "pam"), { valor: EJE_Y.pam.min, recortado: true });
  assert.deepEqual(enEje(130, "pam"), { valor: EJE_Y.pam.max, recortado: true });
  assert.deepEqual(enEje(70, "pam"), { valor: 70, recortado: false });
  assert.deepEqual(bandaMeta("pam", EJE_Y.pam), { desde: 60, hasta: 80 });
  assert.deepEqual(bandaMeta("sat_o2", EJE_Y.sat_o2), { desde: 94, hasta: 100 }); // >94: hasta el techo del eje
});

test("rango de meta en texto: '60–80 mmHg', '>94 %', '≤0,3 γ'", () => {
  assert.equal(textoRangoMeta("pam"), "60–80 mmHg");
  assert.equal(textoRangoMeta("sat_o2"), ">94 %");
  assert.equal(textoRangoMeta("noradrenalina"), "≤0,3 γ");
  assert.equal(textoRangoMeta("glucemia"), "110–180 mg/dL");
});

// ---------------------------------------------------------------- tarjetas
test("tarjeta: en meta o fuera según el ÚLTIMO valor; 'N fuera de meta' solo con dato", () => {
  const base = { ahora: h(11, 30), horas: 12, cambioMinimo: 5, decimales: 0 };
  const pam = tarjetaTendencia({ ...base, clave: "pam", meta: "pam", puntos: [pt(8, 55), pt(9, 58), pt(11, 72)] });
  assert.deepEqual([pam.enMeta, pam.color, pam.estado], [true, "verde", "En meta · 60–80 mmHg"]);
  const fc = tarjetaTendencia({ ...base, clave: "fc", meta: "fc", puntos: [pt(8, 100), pt(11, 135)] });
  assert.deepEqual([fc.enMeta, fc.color, fc.estado], [false, "rojo", "Fuera de meta · 60–120 lpm"]);
  const vacia = tarjetaTendencia({ ...base, clave: "temperatura", meta: "temperatura", puntos: [] });
  assert.equal(vacia.enMeta, null);
  assert.equal(fueraDeMeta([pam, fc, vacia]), 1);
});

test("estado vacío: sin datos en la ventana -> 'Sin datos de enfermería en las últimas N h'", () => {
  const t = tarjetaTendencia({ clave: "pam", meta: "pam", puntos: [pt(0, 70)], ahora: h(11, 30), horas: 6, cambioMinimo: 5, decimales: 0 });
  assert.equal(t.vacio, "Sin datos de enfermería en las últimas 6 h");
  assert.equal(t.ultimo, null);
  assert.equal(textoVacio(24), "Sin datos de enfermería en las últimas 24 h");
});

test("dosis de bomba desactualizada (>70 min): visible y sin color de meta", () => {
  const t = tarjetaTendencia({
    clave: "noradrenalina", meta: "noradrenalina", puntos: [pt(8, 0.2)], ahora: h(9, 30), horas: 12, cambioMinimo: 0.1, decimales: 2, desactualizado: true,
  });
  assert.equal(t.desactualizado, true);
  assert.equal(t.color, "sin_dato");
  assert.equal(t.enMeta, null); // ni en meta ni fuera
});

test("score: las cuatro premisas con su chip (glucemia 110-180, Na <155, pH 7,35-7,50, PaFi >330)", () => {
  const s = scoreCalidad({ glucemia: 150, sodio: 160, ph: 7.4, pafi: null });
  assert.deepEqual(s.items.map((i) => [i.etiqueta, i.cumple]), [["Glucemia 110-180", true], ["Na <155", false], ["pH 7.35-7.5", true], ["PaFi >330", null]]);
  assert.equal(s.cumplidos, 2);
});

// ---------------------------------------------------------------- héroe
const diu = (hora: number, mlKgH: number | null, mlH: number | null = null) => ({
  id: `d${hora}`, registrado_en: iso(hora), intervaloMin: 60, mlH, mlKgH, aviso: null,
});

test("héroe: barra por hora con color (>1,0 verde; 0,5–1,0 ámbar; <0,5 rojo) y huecos", () => {
  const h0 = heroeRitmoDiuretico([diu(7, 1.01), diu(8, 1.0), diu(10, 0.5), diu(11, 0.49)], h(11, 30), 5);
  assert.deepEqual(h0.barras.map((b) => [b.valor, b.color]), [
    [1.01, "verde"], [1.0, "amarillo"], [null, "sin_dato"], [0.5, "amarillo"], [0.49, "rojo"],
  ]);
});

test("héroe: con huecos al principio, 'hace N h' usa la hora real del primer valor", () => {
  const he = heroeRitmoDiuretico([diu(3, 2.1, 147), diu(6, 1.5, 105), diu(11, 0.7, 49)], h(11, 30), 12);
  assert.equal(he.textoInicio, "hace 8 h: 2,1");
  assert.equal(he.textoDireccion, "↓ Cayendo");
  assert.equal(he.textoPie, "Última hora: 49 mL · en 12 h bajó de 2,1 a 0,7 mL/kg/h");
  assert.equal(heroeRitmoDiuretico([], h(11), 12).vacio, "Sin datos de enfermería en las últimas 12 h");
});

// ---------------------------------------------------------------- balance
test("balance acumulado: calculado desde los componentes y su cambio en la ventana", () => {
  const fila = (id: string, hora: number, sol09: number, diuresis: number): FilaHoraria => ({
    id, registrado_en: iso(hora), anulado: false, temperatura: null, diuresis_ml: diuresis, egr_sng_drenajes_ml: null,
    perdidas_insensibles_ml: null, perdidas_insensibles_editadas: false, ing_sol_09_ml: sol09, ing_ringer_ml: null,
    ing_sol_medio_ml: null, ing_dextrosa_ml: null, ing_hemoderivados_ml: null,
  });
  const regs = [fila("a", 8, 500, 100), fila("b", 9, 300, 100), fila("c", 10, 200, 100)];
  const b = balancePorHora(regs, [], null, h(10, 30));
  const puntos = b.horas.flatMap((x) => (x.estado === "cargada" ? [{ t: x.inicio, valor: x.acumulado }] : []));
  assert.deepEqual(puntos.map((p) => p.valor), [400, 600, 700]);
  assert.equal(cambioEnVentana(serieHoraria(puntos, h(10, 30), 12)), 300);
});

// ---------------------------------------------------------------- sugerencias
test("cada sugerencia lleva su área (Hemodinamia, Perfusión, Metabólico) y de qué dato sale su hora", () => {
  const base: EstadoParaSugerencias = {
    pam: 50, fc: 90, noradrenalinaGamma: null, noradrenalinaSinDosis: null, vasopresinaActiva: false, disfuncionMiocardica: false,
    disfuncionEvaluada: true, ic: null, corazonCandidato: "sin_definir", sodio: 156, volemia: { cargadas: 1, positivas: 1 },
    estadoDI: "sin_criterios", sodioHaceHoras: 2,
  };
  const porId = Object.fromEntries(generarSugerencias(base).map((s) => [s.id, [s.area, s.datoDe]]));
  assert.deepEqual(porId.hipotension, ["Hemodinamia", "registro"]);
  assert.deepEqual(porId.hipovolemia, ["Perfusión", "registro"]);
  assert.deepEqual(porId.hipernatremia, ["Metabólico", "sodio"]);
  assert.equal(porId.nutricion, undefined); // la nutrición previa salió de la pantalla y de las reglas
});

// ---------------------------------------------------------------- escenario de 12 h
// Diuresis cayendo 2,1 -> 0,7 mL/kg/h; PAM 80 -> 62; noradrenalina 0,05 -> 0,34 γ.
// Donante de 70 kg; noradrenalina 2 amp × 4 mg en 100 mL (80 mcg/mL).
test("escenario simulado de 12 h: lo que muestra cada tarjeta", () => {
  const peso = 70;
  const ahora = h(11, 30);
  const paso = (desde: number, hasta: number, i: number) => desde + ((hasta - desde) * i) / 11;
  const registros: (RegistroBase & { id: string })[] = [];
  const bombas: BombaHora[] = [];
  for (let i = 0; i <= 11; i++) {
    registros.push({
      id: `r${i}`, registrado_en: iso(i), anulado: false, diuresis_es_ultima_hora: i === 0,
      diuresis_ml: Math.round(paso(2.1, 0.7, i) * peso), pam: Math.round(paso(80, 62, i)),
    });
    bombas.push({ id: `b${i}`, registro_id: `r${i}`, droga: "noradrenalina", velocidad_ml_h: (paso(0.05, 0.34, i) * peso * 60) / 80, dilucion_id: "d", anulado: false });
  }
  const infusiones: InfusionFila[] = [
    { id: "d", registrado_en: iso(0), droga: "noradrenalina", tipo: "infusion", motivo: "inicio", ampollas: 2, contenido_por_ampolla: 4,
      unidad_contenido: "mg", volumen_final_ml: 100, velocidad_ml_h: null, dosis_calculada: null, unidad_dosis: null, anulado: false },
  ];

  // Héroe: ritmo diurético
  const he = heroeRitmoDiuretico(calcularDiuresis(registros, peso), ahora, 12);
  cerca(he.actual!.valor, 0.7, 0.01);
  assert.equal(he.textoDireccion, "↓ Cayendo");
  assert.equal(he.textoInicio, "hace 11 h: 2,1");
  assert.equal(he.barras.at(-1)!.color, "amarillo"); // 0,7: entre 0,5 y 1,0
  assert.equal(he.barras[0].color, "verde"); // 2,1
  assert.equal(he.textoPie, "Última hora: 49 mL · en 12 h bajó de 2,1 a 0,7 mL/kg/h");

  // PAM: bajando 18, pero el último (62) sigue en meta
  const pam = tarjetaTendencia({
    clave: "pam", meta: "pam", ahora, horas: 12, cambioMinimo: CAMBIO_MINIMO_FLECHA.pam, decimales: 0,
    puntos: registros.map((r) => ({ t: new Date(r.registrado_en).getTime(), valor: r.pam! })),
  });
  assert.deepEqual([pam.ultimo!.valor, pam.estado, pam.chip, pam.color], [62, "En meta · 60–80 mmHg", "↓ bajando −18 en 12 h", "verde"]);

  // Noradrenalina: subiendo 0,29 y fuera de meta (>0,30 γ)
  const na = tarjetaTendencia({
    clave: "noradrenalina", meta: "noradrenalina", ahora, horas: 12, cambioMinimo: CAMBIO_MINIMO_FLECHA.noradrenalina, decimales: 2,
    puntos: dosisPorFila("noradrenalina", registros, bombas, infusiones, peso),
  });
  cerca(na.ultimo!.valor, 0.34);
  assert.deepEqual([na.estado, na.chip, na.color], ["Fuera de meta · ≤0,3 γ", "↑ subiendo +0,29 en 12 h", "amarillo"]);

  assert.equal(fueraDeMeta([pam, na]), 1);

  // Sugerencias: PAM 62 no es hipotensión (<60): no se sugiere asociar vasopresina.
  const sug = generarSugerencias({
    pam: 62, fc: 90, noradrenalinaGamma: na.ultimo!.valor, noradrenalinaSinDosis: null, vasopresinaActiva: false,
    disfuncionMiocardica: false, disfuncionEvaluada: false, ic: null, corazonCandidato: "sin_definir", sodio: null,
    volemia: { cargadas: 0, positivas: 0 }, estadoDI: "sin_criterios", sodioHaceHoras: null,
  });
  assert.deepEqual(sug.map((s) => s.id), []);
});

// ---------------------------------------------------------------- formato
import { alertasFueraDeRango, numFijo } from "../mantenimiento-tendencias.ts";

test("decimales fijos: temperatura 1 ('36,0'), noradrenalina 2 ('0,30'), PAM/FC/Sat/glucemia 0", () => {
  assert.equal(numFijo(36, 1), "36,0");
  assert.equal(numFijo(37.46, 1), "37,5");
  assert.equal(numFijo(0.3, 2), "0,30");
  assert.equal(numFijo(62, 0), "62");
  assert.equal(numFijo(1234, 0), "1234"); // sin separador de miles
});

// ---------------------------------------------------------------- tarjeta de alertas
const tarj = (
  clave: "pam" | "fc" | "sat_o2" | "glucemia" | "noradrenalina",
  nombre: string,
  unidad: string,
  dec: number,
  valores: number[],
  extra: { desactualizado?: boolean } = {}
) => {
  const t = tarjetaTendencia({
    clave, meta: clave, puntos: valores.map((v, i) => pt(9 + i, v)), ahora: h(11, 30), horas: 12,
    cambioMinimo: CAMBIO_MINIMO_FLECHA[clave], decimales: dec, ...extra,
  });
  return { ...t, nombre, unidad, dec };
};
const ahoraAl = h(11, 30);

test("alertas: solo lo fuera de rango, una línea por ítem: '✕ Saturación 92 % · meta >94 · ↓ bajando'", () => {
  const sat = tarj("sat_o2", "Saturación", "%", 0, [98, 96, 92]);
  const pam = tarj("pam", "PAM", "mmHg", 0, [70, 72, 71]); // en meta: no aparece
  const r = alertasFueraDeRango([sat, pam], [], ahoraAl);
  assert.deepEqual(r.alertas.map((a) => [a.nivel, a.texto, a.destino]), [["amarillo", "✕ Saturación 92 % · meta >94 · ↓ bajando", "tarjeta-sat_o2"]]);
});

test("alertas ordenadas de más a menos grave (rojas primero)", () => {
  const sat = tarj("sat_o2", "Saturación", "%", 0, [93, 93, 93]); // ámbar
  const pam = tarj("pam", "PAM", "mmHg", 0, [60, 55, 50]); // roja (<55)
  const r = alertasFueraDeRango([sat, pam], [], ahoraAl);
  assert.deepEqual(r.alertas.map((a) => a.id), ["pam", "sat_o2"]);
  assert.equal(r.alertas[0].texto, "✕ PAM 50 mmHg · meta 60–80 · ↓ bajando");
});

test("alertas: nada fuera de rango -> lista vacía (la pantalla dice 'Todo en meta')", () => {
  const r = alertasFueraDeRango([tarj("pam", "PAM", "mmHg", 0, [70, 72, 71])], [], ahoraAl);
  assert.deepEqual(r, { alertas: [], vencidos: [] });
});

test("alertas de laboratorio: reciente fuera de rango -> alerta; vencido (>6 h) -> línea gris aparte", () => {
  const na = { meta: "sodio" as const, etiqueta: "Na", unidad: "mEq/L", dec: 0 };
  const reciente = alertasFueraDeRango([], [{ ...na, dato: { valor: 158, medido_en: iso(10), desactualizado: false } }], ahoraAl);
  assert.deepEqual(reciente.alertas.map((a) => [a.nivel, a.texto, a.destino]), [["rojo", "✕ Na 158 mEq/L · meta 135–150", "laboratorio"]]);
  const vencido = alertasFueraDeRango([], [{ ...na, dato: { valor: 158, medido_en: iso(4), desactualizado: true } }], ahoraAl);
  assert.deepEqual(vencido.alertas, []);
  assert.deepEqual(vencido.vencidos.map((v) => v.texto), ["Na sin actualizar hace 7 h"]);
  const ph = alertasFueraDeRango([], [{ meta: "ph", etiqueta: "pH", unidad: "", dec: 2, dato: { valor: 7.2, medido_en: iso(10), desactualizado: false } }], ahoraAl);
  assert.equal(ph.alertas[0].texto, "✕ pH 7,20 · meta 7,35–7,5");
});

test("alertas: la glucemia no se duplica (tarjeta + laboratorio) y una dosis desactualizada no alerta", () => {
  const glu = tarj("glucemia", "Glucemia", "mg/dL", 0, [150, 190, 230]);
  const na = tarj("noradrenalina", "Noradrenalina", "γ", 2, [0.2, 0.4, 0.5], { desactualizado: true });
  const r = alertasFueraDeRango(
    [glu, na],
    [{ meta: "glucemia", etiqueta: "Glucemia", unidad: "mg/dL", dec: 0, dato: { valor: 230, medido_en: iso(11), desactualizado: false } }],
    ahoraAl
  );
  assert.deepEqual(r.alertas.map((a) => a.id), ["glucemia"]);
});
